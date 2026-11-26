const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DB_PATH = path.join(__dirname, "..", ".rfk_smart_settings.json");

function loadSettings() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return {
    chatbot: false,
    autostatus: true,
    antidelete: true,
    anticall: false,
    pmblock: false,
    antilinkGroups: {}
  };
}

function saveSettings(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

const msgCache = new Map();
const groupAdminCache = new Map();

async function isGroupAdmin(sock, groupJid, userJid) {
  if (!groupJid || !userJid) return false;
  const cleanUser = userJid.split(":")[0].split("@")[0];
  try {
    let cached = groupAdminCache.get(groupJid);
    if (!cached || Date.now() - cached.ts > 60000) {
      const meta = await sock.groupMetadata(groupJid);
      const admins = new Set(
        (meta.participants || [])
          .filter((p) => p.admin === "admin" || p.admin === "superadmin")
          .map((p) => p.id.split(":")[0].split("@")[0])
      );
      cached = { admins, ts: Date.now() };
      groupAdminCache.set(groupJid, cached);
    }
    return cached.admins.has(cleanUser);
  } catch {
    return false;
  }
}

function attachSmartListeners(sock) {
  if (!sock || sock._rfkSmartAttached) return;
  sock._rfkSmartAttached = true;

  // 1. Anti-Call Listener
  sock.ev.on("call", async (calls) => {
    const cfg = loadSettings();
    if (!cfg.anticall) return;
    for (const call of calls) {
      if (call.status === "offer") {
        try {
          await sock.rejectCall(call.id, call.from);
          await sock.sendMessage(call.from, {
            text: "📵 *Calls are not allowed on this bot number!*"
          });
        } catch {}
      }
    }
  });

  // 2. Messages Upsert Listener (Status, Anti-Link, PM Blocker, Cache for Anti-Delete, AI Chatbot)
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages)) return;
    const cfg = loadSettings();

    for (const m of messages) {
      try {
        if (!m.message) continue;
        const remoteJid = m.key.remoteJid;
        if (!remoteJid) continue;

        // A. Auto Status View & React
        if (remoteJid === "status@broadcast") {
          if (cfg.autostatus && !m.key.fromMe) {
            try {
              await sock.readMessages([m.key]);
              const emojis = ["❤️", "🔥", "😍", "✨", "👍", "🤍"];
              const pick = emojis[Math.floor(Math.random() * emojis.length)];
              const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";
              await sock.sendMessage(
                "status@broadcast",
                { react: { text: pick, key: m.key } },
                { statusJidList: [m.key.participant, botJid].filter(Boolean) }
              );
            } catch {}
          }
          continue;
        }

        // Cache message for Anti-Delete
        if (m.key.id && !m.message.protocolMessage) {
          msgCache.set(m.key.id, m);
          if (msgCache.size > 500) {
            const firstKey = msgCache.keys().next().value;
            msgCache.delete(firstKey);
          }
        }

        // B. Anti-Delete Recovery
        const proto = m.message.protocolMessage;
        if (proto && proto.type === 0 && cfg.antidelete) {
          const deletedId = proto.key?.id;
          const original = deletedId ? msgCache.get(deletedId) : null;
          if (original && !original.key.fromMe) {
            const senderJid = original.key.participant || original.key.remoteJid;
            const origText =
              original.message?.conversation ||
              original.message?.extendedTextMessage?.text ||
              original.message?.imageMessage?.caption ||
              original.message?.videoMessage?.caption ||
              "[Media / Non-text Message]";

            await sock.sendMessage(
              remoteJid,
              {
                text:
                  `🗑️ *ANTI-DELETE RECOVERED*\n\n` +
                  `👤 *From:* @${senderJid.split("@")[0]}\n` +
                  `💬 *Message:* ${origText}`,
                mentions: [senderJid]
              },
              { quoted: original }
            );
          }
          continue;
        }

        if (m.key.fromMe) continue;

        const isGroup = remoteJid.endsWith("@g.us");
        const sender = isGroup ? m.key.participant : remoteJid;
        const senderNum = (sender || "").split(":")[0].split("@")[0];
        const isBotOwner =
          senderNum.includes("918086165391") ||
          senderNum.includes("917907228818");

        const body = (
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption ||
          ""
        ).trim();

        if (!body) continue;

        // C. Group Anti-Link (Excludes Group Admins & Bot Owners!)
        if (isGroup && cfg.antilinkGroups?.[remoteJid]) {
          const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[^\s]+|wa\.me\/[^\s]+)/i;
          if (linkRegex.test(body) && !isBotOwner) {
            const senderIsAdmin = await isGroupAdmin(sock, remoteJid, sender);
            if (!senderIsAdmin) {
              try {
                await sock.sendMessage(remoteJid, { delete: m.key });
                await sock.sendMessage(remoteJid, {
                  text: `⚠️ *Anti-Link Alert!*\n@${senderNum}, links are not allowed in this group (Admins exempted).`,
                  mentions: [sender]
                });
              } catch {}
              continue;
            }
          }
        }

        // D. PM Blocker (Excludes Bot Owners)
        if (!isGroup && cfg.pmblock && !isBotOwner) {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🚫 *PM Blocker is active. Direct messages are not allowed!*"
            });
            await sock.updateBlockStatus(remoteJid, "block");
          } catch {}
          continue;
        }

        // E. AI Chatbot (Ignores commands starting with . ! / #)
        if (cfg.chatbot && !/^[.!\/#]/.test(body)) {
          const botId = sock.user?.id?.split(":")[0];
          const contextInfo = m.message?.extendedTextMessage?.contextInfo;
          const isMentioned =
            (contextInfo?.mentionedJid || []).some((j) => j.includes(botId)) ||
            (contextInfo?.participant || "").includes(botId);

          if (!isGroup || isMentioned) {
            try {
              const res = await axios.get(
                `https://api.simsimi.vn/v1/simtalk`,
                {
                  params: { text: body, lc: "en" },
                  timeout: 8000
                }
              ).catch(() => null);

              const replyMsg =
                res?.data?.message ||
                `Hello! 👋 How can I help you today?`;
              await sock.sendMessage(remoteJid, { text: replyMsg }, { quoted: m });
            } catch {}
          }
        }
      } catch {}
    }
  });
}

module.exports = {
  pattern: "antilink",
  alias: ["chatbot", "autostatus", "antidelete", "anticall", "pmblock"],
  type: "owner",
  desc: "Manage Anti-Link (Admins exempted), Chatbot, Auto-Status, Anti-Delete, Anti-Call & PM-Block",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachSmartListeners(sock);
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (text || raw.split(/\s+/)[1] || "").trim().toLowerCase();

    const isGroup = jid.endsWith("@g.us");
    const sender = isGroup ? msg.key.participant : jid;

    // Allow Group Admins or Bot Owners to toggle .antilink in groups
    if (cmdName === "antilink") {
      if (!isGroup) return send("❌ *This command can only be used inside a group!*");
      const adminOk = isOwner || (await isGroupAdmin(sock, jid, sender));
      if (!adminOk) return send("❌ *Only Group Admins or Bot Owner can toggle Anti-Link!*");

      const cfg = loadSettings();
      if (arg === "on") {
        cfg.antilinkGroups[jid] = true;
        saveSettings(cfg);
        return send("✅ *Anti-Link ENABLED for this group!*\n_(Group Admins & Bot Owners are exempted)_");
      } else if (arg === "off") {
        delete cfg.antilinkGroups[jid];
        saveSettings(cfg);
        return send("⭕ *Anti-Link DISABLED for this group!*");
      }
      const status = cfg.antilinkGroups[jid] ? "ON ✅" : "OFF ⭕";
      return send(`🔗 *Group Anti-Link Status:* ${status}\n\nUsage: *.antilink on* or *.antilink off*`);
    }

    // Owner-only global features
    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const cfg = loadSettings();
    const validKeys = ["chatbot", "autostatus", "antidelete", "anticall", "pmblock"];

    if (validKeys.includes(cmdName)) {
      if (arg === "on") {
        cfg[cmdName] = true;
        saveSettings(cfg);
        return send(`✅ *${cmdName.toUpperCase()} has been turned ON!*`);
      } else if (arg === "off") {
        cfg[cmdName] = false;
        saveSettings(cfg);
        return send(`⭕ *${cmdName.toUpperCase()} has been turned OFF!*`);
      }
      const current = cfg[cmdName] ? "ON ✅" : "OFF ⭕";
      return send(`⚙️ *${cmdName.toUpperCase()} Status:* ${current}\n\nUsage: *.${cmdName} on* or *.${cmdName} off*`);
    }
  }
};

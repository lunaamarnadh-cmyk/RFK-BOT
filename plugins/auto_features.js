const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const DB_PATH = path.join(__dirname, "..", ".rfk_auto_features.json");

function loadAutoDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return {
    antiviewonce: false,
    autoreact: false,
    autotyping: false,
    autoread: false
  };
}

function saveAutoDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

function extractViewOnceInner(msgObj) {
  if (!msgObj) return null;
  const vo =
    msgObj.viewOnceMessageV2?.message ||
    msgObj.viewOnceMessageV2Extension?.message ||
    msgObj.viewOnceMessage?.message;
  if (vo) return vo;
  if (msgObj.imageMessage?.viewOnce) return { imageMessage: msgObj.imageMessage };
  if (msgObj.videoMessage?.viewOnce) return { videoMessage: msgObj.videoMessage };
  return null;
}

function attachAutoListeners(sock) {
  if (!sock || sock._rfkAutoFeaturesAttached) return;
  sock._rfkAutoFeaturesAttached = true;

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages)) return;
    const db = loadAutoDB();

    for (const m of messages) {
      try {
        if (!m.message) continue;
        const remoteJid = m.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") continue;

        // 1. Anti-ViewOnce Auto Recovery
        if (db.antiviewonce && !m.key.fromMe) {
          const inner = extractViewOnceInner(m.message);
          if (inner) {
            try {
              const targetMsg = { key: m.key, message: inner };
              const buf = await downloadMediaMessage(
                targetMsg,
                "buffer",
                {},
                { logger: undefined, reuploadRequest: sock.updateMediaMessage }
              );
              const sender = m.key.participant || remoteJid;
              const caption =
                `👁️ *ANTI-VIEWONCE RECOVERED*\n` +
                `👤 *From:* @${sender.split("@")[0]}\n` +
                (inner.imageMessage?.caption || inner.videoMessage?.caption
                  ? `💬 *Caption:* ${inner.imageMessage?.caption || inner.videoMessage?.caption}`
                  : "");

              if (inner.imageMessage) {
                await sock.sendMessage(
                  remoteJid,
                  { image: buf, caption, mentions: [sender] },
                  { quoted: m }
                );
              } else if (inner.videoMessage) {
                await sock.sendMessage(
                  remoteJid,
                  { video: buf, caption, mentions: [sender] },
                  { quoted: m }
                );
              }
            } catch {}
          }
        }

        if (m.key.fromMe) continue;

        // 2. Auto-Read (Blue Tick)
        if (db.autoread) {
          try {
            await sock.readMessages([m.key]);
          } catch {}
        }

        // 3. Auto-Typing Presence
        if (db.autotyping) {
          try {
            await sock.sendPresenceUpdate("composing", remoteJid);
          } catch {}
        }

        // 4. Auto-React Emoji
        if (db.autoreact) {
          try {
            const emojis = ["❤️", "🔥", "✨", "👍", "⚡", "😊", "💯"];
            const pick = emojis[Math.floor(Math.random() * emojis.length)];
            await sock.sendMessage(remoteJid, {
              react: { text: pick, key: m.key }
            });
          } catch {}
        }
      } catch {}
    }
  });
}

module.exports = {
  pattern: "antiviewonce",
  alias: ["vv", "autoreact", "autotyping", "autoread"],
  type: "owner",
  desc: "Manage Anti-ViewOnce (.antiviewonce / .vv), Auto-React, Auto-Typing & Auto-Read",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachAutoListeners(sock);
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (text || raw.split(/\s+/)[1] || "").trim().toLowerCase();

    // Manual View-Once Reveal (.vv) on reply
    if (cmdName === "vv" && arg !== "on" && arg !== "off") {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const inner = extractViewOnceInner(ctx?.quotedMessage);
      if (!inner) {
        return send("👁️ *Reply to a View-Once photo or video with `.vv` to open it!*");
      }
      try {
        const targetMsg = {
          key: {
            remoteJid: jid,
            id: ctx.stanzaId,
            participant: ctx.participant
          },
          message: inner
        };
        const buf = await downloadMediaMessage(
          targetMsg,
          "buffer",
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        if (inner.imageMessage) {
          return sock.sendMessage(
            jid,
            { image: buf, caption: inner.imageMessage.caption || "👁️ *View-Once Revealed*" },
            { quoted: msg }
          );
        } else if (inner.videoMessage) {
          return sock.sendMessage(
            jid,
            { video: buf, caption: inner.videoMessage.caption || "👁️ *View-Once Revealed*" },
            { quoted: msg }
          );
        }
      } catch {
        return send("❌ *Failed to open View-Once media!*");
      }
      return;
    }

    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const db = loadAutoDB();
    const validKeys = ["antiviewonce", "autoreact", "autotyping", "autoread"];

    if (validKeys.includes(cmdName)) {
      if (arg === "on") {
        db[cmdName] = true;
        saveAutoDB(db);
        return send(`✅ *${cmdName.toUpperCase()} has been turned ON!*`);
      } else if (arg === "off") {
        db[cmdName] = false;
        saveAutoDB(db);
        return send(`⭕ *${cmdName.toUpperCase()} has been turned OFF!*`);
      }
      const st = db[cmdName] ? "ON ✅" : "OFF ⭕";
      return send(`⚙️ *${cmdName.toUpperCase()} Status:* ${st}\n\nUsage: *.${cmdName} on* or *.${cmdName} off*`);
    }
  }
};

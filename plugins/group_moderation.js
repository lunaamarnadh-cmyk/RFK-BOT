const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_moderation.json");

function loadModDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      return {
        antitagGroups: parsed.antitagGroups || {},
        antibadwordGroups: parsed.antibadwordGroups || {},
        antigroupmentionGroups: parsed.antigroupmentionGroups || {},
        warnings: parsed.warnings || {}
      };
    }
  } catch {}
  return {
    antitagGroups: {},
    antibadwordGroups: {},
    antigroupmentionGroups: {},
    warnings: {}
  };
}

function saveModDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

const adminCache = new Map();

async function isGroupAdmin(sock, groupJid, userJid) {
  if (!groupJid || !userJid) return false;
  const cleanUser = userJid.split(":")[0].split("@")[0];
  try {
    let cached = adminCache.get(groupJid);
    if (!cached || Date.now() - cached.ts > 60000) {
      const meta = await sock.groupMetadata(groupJid);
      const admins = new Set(
        (meta.participants || [])
          .filter((p) => p.admin === "admin" || p.admin === "superadmin")
          .map((p) => p.id.split(":")[0].split("@")[0])
      );
      cached = { admins, ts: Date.now() };
      adminCache.set(groupJid, cached);
    }
    return cached.admins.has(cleanUser);
  } catch {
    return false;
  }
}

// Auto Temp Folder Cleaner (Every 1 hour)
if (!global._rfkTempCleanerStarted) {
  global._rfkTempCleanerStarted = true;
  setInterval(() => {
    try {
      const dirs = [
        path.join("/tmp", "rfk_stickers"),
        path.join(process.cwd(), "temp"),
        path.join(process.cwd(), "tmp")
      ];
      const maxAge = 2 * 60 * 60 * 1000;
      const now = Date.now();
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          try {
            const st = fs.statSync(fp);
            if (st.isFile() && now - st.mtimeMs > maxAge) {
              fs.unlinkSync(fp);
            }
          } catch {}
        }
      }
    } catch {}
  }, 60 * 60 * 1000);
}

const BAD_WORDS = [
  "fuck", "bitch", "asshole", "bastard", "motherfucker", "dick", "pussy",
  "slut", "whore", "nigger", "faggot", "cunt", "porn", "sexvideo",
  "myre", "myru", "kunna", "poori", "thayoli", "oombi", "punda", "thendi"
];

function containsBadWord(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return BAD_WORDS.some((word) => {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(lower);
  });
}

function attachModerationListeners(sock) {
  if (!sock || sock._rfkModAttached) return;
  sock._rfkModAttached = true;

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages)) return;
    const db = loadModDB();

    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const remoteJid = m.key.remoteJid;
        if (!remoteJid || !remoteJid.endsWith("@g.us")) continue;

        const sender = m.key.participant;
        const senderNum = (sender || "").split(":")[0].split("@")[0];
        const isBotOwner =
          senderNum.includes("918086165391") ||
          senderNum.includes("917907228818");

        if (isBotOwner) continue;

        const msgKeys = Object.keys(m.message || {});
        const isGroupStatusMention =
          msgKeys.includes("groupStatusMentionMessage") ||
          Boolean(m.message?.groupStatusMentionMessage);

        // 0. Anti-Group Mention Check (Blocks status group mentions by non-admins)
        const agmCfg = db.antigroupmentionGroups?.[remoteJid];
        if (agmCfg?.enabled && isGroupStatusMention) {
          const senderIsAdmin = await isGroupAdmin(sock, remoteJid, sender);
          if (!senderIsAdmin) {
            try {
              await sock.sendMessage(remoteJid, { delete: m.key });
              if (agmCfg.action === "kick") {
                await sock.sendMessage(remoteJid, {
                  text:
                    `📌 *ANTI-GROUP MENTION KICK!*\n\n` +
                    `⚠️ @${senderNum}, mentioning this group in status is prohibited! You have been removed.`,
                  mentions: [sender]
                });
                await sock.groupParticipantsUpdate(remoteJid, [sender], "remove").catch(() => {});
              } else {
                await sock.sendMessage(remoteJid, {
                  text:
                    `📌 *ANTI-GROUP MENTION ALERT!*\n\n` +
                    `⚠️ @${senderNum}, mentioning this group in status is not allowed!\n` +
                    `_(Group Admins & Bot Owners are exempted)_`,
                  mentions: [sender]
                });
              }
            } catch {}
            continue;
          }
        }

        const contextInfo =
          m.message?.extendedTextMessage?.contextInfo ||
          m.message?.imageMessage?.contextInfo ||
          m.message?.videoMessage?.contextInfo ||
          {};
        const mentioned = contextInfo.mentionedJid || [];

        const body = (
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption ||
          ""
        ).trim();

        // 1. Anti-Tag Check (Blocks mass mentions / hidetag by non-admins)
        if (db.antitagGroups?.[remoteJid]) {
          const isMassTag =
            mentioned.length >= 5 ||
            /@(all|everyone|here)\b/i.test(body);

          if (isMassTag) {
            const senderIsAdmin = await isGroupAdmin(sock, remoteJid, sender);
            if (!senderIsAdmin) {
              try {
                await sock.sendMessage(remoteJid, { delete: m.key });
                await sock.sendMessage(remoteJid, {
                  text:
                    `🏷️ *ANTI-TAG ALERT!*\n\n` +
                    `⚠️ @${senderNum}, mass tagging members is not allowed in this group!\n` +
                    `_(Group Admins & Bot Owners are exempted)_`,
                  mentions: [sender]
                });
              } catch {}
              continue;
            }
          }
        }

        // 2. Anti-Badword Check (3-Strike Warning System, Admins Exempted)
        if (db.antibadwordGroups?.[remoteJid] && body && containsBadWord(body)) {
          const senderIsAdmin = await isGroupAdmin(sock, remoteJid, sender);
          if (!senderIsAdmin) {
            try {
              await sock.sendMessage(remoteJid, { delete: m.key });

              if (!db.warnings[remoteJid]) db.warnings[remoteJid] = {};
              const count = (db.warnings[remoteJid][senderNum] || 0) + 1;
              db.warnings[remoteJid][senderNum] = count;
              saveModDB(db);

              if (count >= 3) {
                delete db.warnings[remoteJid][senderNum];
                saveModDB(db);
                await sock.sendMessage(remoteJid, {
                  text:
                    `🚫 *ANTI-BADWORD KICK!*\n\n` +
                    `@${senderNum} reached *3/3 warnings* for abusive language and has been removed!`,
                  mentions: [sender]
                });
                await sock.groupParticipantsUpdate(remoteJid, [sender], "remove").catch(() => {});
              } else {
                await sock.sendMessage(remoteJid, {
                  text:
                    `🤬 *ANTI-BADWORD WARNING (${count}/3)*\n\n` +
                    `⚠️ @${senderNum}, abusive language is strictly prohibited here!`,
                  mentions: [sender]
                });
              }
            } catch {}
            continue;
          }
        }
      } catch {}
    }
  });
}

module.exports = {
  pattern: "antitag",
  alias: ["antibadword", "resetwarn", "antigroupmention", "agm"],
  type: "admin",
  desc: "Toggle Group Anti-Tag, Anti-Badword & Anti-Group Mention (Admins exempted)",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachModerationListeners(sock);
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const isGroup = jid.endsWith("@g.us");
    if (!isGroup) return send("❌ *This command can only be used inside a group!*");

    const sender = msg.key.participant;
    const adminOk = isOwner || (await isGroupAdmin(sock, jid, sender));
    if (!adminOk) return send("❌ *Only Group Admins or Bot Owner can use this command!*");

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg1 = (parts[1] || text || "").trim().toLowerCase();
    const arg2 = (parts[2] || "").trim().toLowerCase();

    const db = loadModDB();

    if (cmdName === "antigroupmention" || cmdName === "agm") {
      if (arg1 === "on") {
        const prevAction = db.antigroupmentionGroups[jid]?.action || "delete";
        db.antigroupmentionGroups[jid] = { enabled: true, action: prevAction };
        saveModDB(db);
        return send(`✅ *Anti-Group Mention ENABLED!*\n⚙️ *Action:* ${prevAction}\n_(Group Admins & Bot Owners are exempted)_`);
      }
      if (arg1 === "off") {
        if (db.antigroupmentionGroups[jid]) {
          db.antigroupmentionGroups[jid].enabled = false;
        }
        saveModDB(db);
        return send("⭕ *Anti-Group Mention DISABLED!*");
      }
      if (arg1 === "set") {
        if (!["delete", "kick"].includes(arg2)) {
          return send("❌ *Invalid action!*\nUsage: `.antigroupmention set delete` or `.antigroupmention set kick`");
        }
        db.antigroupmentionGroups[jid] = { enabled: true, action: arg2 };
        saveModDB(db);
        return send(`✅ *Anti-Group Mention action set to:* *${arg2.toUpperCase()}* (Auto-enabled)`);
      }

      const cur = db.antigroupmentionGroups[jid];
      const st = cur?.enabled ? "ON ✅" : "OFF ⭕";
      const act = cur?.action || "delete";
      return send(
        `📌 *Anti-Group Mention Status*\n\n` +
        `• *Status:* ${st}\n` +
        `• *Action:* ${act}\n\n` +
        `*Usage:*\n` +
        `• \`.antigroupmention on\`\n` +
        `• \`.antigroupmention off\`\n` +
        `• \`.antigroupmention set delete | kick\`\n` +
        `• \`.antigroupmention get\``
      );
    }

    if (cmdName === "antitag") {
      if (arg1 === "on") {
        db.antitagGroups[jid] = true;
        saveModDB(db);
        return send("✅ *Anti-Tag Protection ENABLED!*\n_(Group Admins & Bot Owners are exempted)_");
      } else if (arg1 === "off") {
        delete db.antitagGroups[jid];
        saveModDB(db);
        return send("⭕ *Anti-Tag Protection DISABLED!*");
      }
      const st = db.antitagGroups[jid] ? "ON ✅" : "OFF ⭕";
      return send(`🏷️ *Group Anti-Tag Status:* ${st}\n\nUsage: *.antitag on* or *.antitag off*`);
    }

    if (cmdName === "antibadword") {
      if (arg1 === "on") {
        db.antibadwordGroups[jid] = true;
        saveModDB(db);
        return send("✅ *Anti-Badword (3-Strike System) ENABLED!*\n_(Group Admins & Bot Owners are exempted)_");
      } else if (arg1 === "off") {
        delete db.antibadwordGroups[jid];
        saveModDB(db);
        return send("⭕ *Anti-Badword Protection DISABLED!*");
      }
      const st = db.antibadwordGroups[jid] ? "ON ✅" : "OFF ⭕";
      return send(`🤬 *Group Anti-Badword Status:* ${st}\n\nUsage: *.antibadword on* or *.antibadword off*`);
    }

    if (cmdName === "resetwarn") {
      db.warnings[jid] = {};
      saveModDB(db);
      return send("🔄 *All badword warnings in this group have been reset!*");
    }
  }
};

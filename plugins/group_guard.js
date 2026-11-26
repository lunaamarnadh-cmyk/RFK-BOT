const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_group_guard.json");

function loadGuardDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return {
    antibotGroups: {},
    welcomeGroups: {}
  };
}

function saveGuardDB(data) {
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

// Auto RAM Cleaner & Memory Guard (Prevents lag & crashes)
if (!global._rfkRamGuardStarted) {
  global._rfkRamGuardStarted = true;
  setInterval(() => {
    try {
      if (global.gc) global.gc();
      const usedMB = process.memoryUsage().rss / 1024 / 1024;
      if (usedMB > 450) {
        console.log(`⚠️ High RAM (${Math.round(usedMB)}MB) detected. Restarting cleanly...`);
        process.exit(0);
      }
    } catch {}
  }, 60 * 1000);
}

function attachGroupGuardListeners(sock) {
  if (!sock || sock._rfkGroupGuardAttached) return;
  sock._rfkGroupGuardAttached = true;

  // 1. Anti-Bot Detection (Strictly exempts Group Admins & Bot Owners!)
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" || !Array.isArray(messages)) return;
    const db = loadGuardDB();

    for (const m of messages) {
      try {
        if (!m.message || m.key.fromMe) continue;
        const remoteJid = m.key.remoteJid;
        if (!remoteJid || !remoteJid.endsWith("@g.us")) continue;
        if (!db.antibotGroups?.[remoteJid]) continue;

        const msgId = m.key.id || "";
        // Detect standard Baileys / third-party bot message ID signatures
        const isBotSignature =
          (msgId.startsWith("BAE5") && msgId.length === 16) ||
          (msgId.startsWith("3EB0") && msgId.length >= 20 && !m.pushName);

        if (!isBotSignature) continue;

        const sender = m.key.participant;
        const senderNum = (sender || "").split(":")[0].split("@")[0];
        const isBotOwner =
          senderNum.includes("918086165391") ||
          senderNum.includes("917907228818");

        if (isBotOwner) continue;

        const senderIsAdmin = await isGroupAdmin(sock, remoteJid, sender);
        if (senderIsAdmin) continue;

        // Delete unauthorized bot message & warn
        try {
          await sock.sendMessage(remoteJid, { delete: m.key });
          await sock.sendMessage(remoteJid, {
            text:
              `🤖 *ANTI-BOT PROTECTION*\n\n` +
              `⚠️ @${senderNum}, external bots are not allowed in this group!\n` +
              `_(Group Admins & Bot Owners are exempted)_`,
            mentions: [sender]
          });
        } catch {}
      } catch {}
    }
  });

  // 2. Group Welcome & Goodbye Listener
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupJid, participants, action } = update;
      if (!groupJid || !Array.isArray(participants)) return;

      // Refresh admin cache when roles change
      if (action === "promote" || action === "demote") {
        adminCache.delete(groupJid);
        return;
      }

      const db = loadGuardDB();
      if (!db.welcomeGroups?.[groupJid]) return;

      let groupName = "this group";
      try {
        const meta = await sock.groupMetadata(groupJid);
        groupName = meta.subject || groupName;
      } catch {}

      for (const userJid of participants) {
        const userNum = userJid.split(":")[0].split("@")[0];
        if (action === "add") {
          await sock.sendMessage(groupJid, {
            text:
              `👋 *WELCOME TO ${groupName.toUpperCase()}!*\n\n` +
              `Hello @${userNum}, we are glad to have you here! ✨`,
            mentions: [userJid]
          });
        } else if (action === "remove") {
          await sock.sendMessage(groupJid, {
            text:
              `👋 *GOODBYE!*\n\n` +
              `@${userNum} has left *${groupName}*.`,
            mentions: [userJid]
          });
        }
      }
    } catch {}
  });
}

module.exports = {
  pattern: "antibot",
  alias: ["welcome", "goodbye"],
  type: "admin",
  desc: "Toggle Group Anti-Bot (Admins exempted) & Welcome/Goodbye messages",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachGroupGuardListeners(sock);
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
    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (text || raw.split(/\s+/)[1] || "").trim().toLowerCase();

    const db = loadGuardDB();

    if (cmdName === "antibot") {
      if (arg === "on") {
        db.antibotGroups[jid] = true;
        saveGuardDB(db);
        return send("✅ *Anti-Bot Protection ENABLED!*\n_(Group Admins & Bot Owners are exempted)_");
      } else if (arg === "off") {
        delete db.antibotGroups[jid];
        saveGuardDB(db);
        return send("⭕ *Anti-Bot Protection DISABLED!*");
      }
      const st = db.antibotGroups[jid] ? "ON ✅" : "OFF ⭕";
      return send(`🤖 *Group Anti-Bot Status:* ${st}\n\nUsage: *.antibot on* or *.antibot off*`);
    }

    if (cmdName === "welcome" || cmdName === "goodbye") {
      if (arg === "on") {
        db.welcomeGroups[jid] = true;
        saveGuardDB(db);
        return send("✅ *Group Welcome & Goodbye messages ENABLED!*");
      } else if (arg === "off") {
        delete db.welcomeGroups[jid];
        saveGuardDB(db);
        return send("⭕ *Group Welcome & Goodbye messages DISABLED!*");
      }
      const st = db.welcomeGroups[jid] ? "ON ✅" : "OFF ⭕";
      return send(`👋 *Group Welcome Status:* ${st}\n\nUsage: *.welcome on* or *.welcome off*`);
    }
  }
};

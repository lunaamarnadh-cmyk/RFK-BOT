const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_anti_owner_kick.json");

// Protected Owner Numbers
const OWNER_NUMBERS = ["918086165391", "917907228818"];

function loadConfig() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      return {
        enabled: data.enabled !== false,
        bannedByGroup: data.bannedByGroup || {}
      };
    }
  } catch {}
  return { enabled: true, bannedByGroup: {} };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(cfg, null, 2));
  } catch {}
}

function cleanNum(jid) {
  return (jid || "").split(":")[0].split("@")[0].replace(/\D/g, "");
}

function isProtectedOwner(jid) {
  const num = cleanNum(jid);
  if (!num) return false;
  return OWNER_NUMBERS.some((o) => num === o || num.endsWith(o) || o.endsWith(num));
}

function attachAntiOwnerKickListener(sock) {
  if (!sock || sock._rfkAntiOwnerKickAttached) return;
  sock._rfkAntiOwnerKickAttached = true;

  sock.ev.on("group-participants.update", async (update) => {
    try {
      const cfg = loadConfig();
      if (!cfg.enabled) return;

      const { id: groupJid, participants, action, author } = update || {};
      if (!groupJid || !groupJid.endsWith("@g.us") || !Array.isArray(participants)) return;

      const botNum = cleanNum(sock.user?.id);
      const botLidNum = cleanNum(sock.user?.lid);
      const authorNum = cleanNum(author);

      // Check if bot is admin in this group
      let botIsAdmin = false;
      try {
        const meta = await sock.groupMetadata(groupJid);
        botIsAdmin = (meta.participants || []).some((p) => {
          const pNum = cleanNum(p.id);
          return (
            (pNum === botNum || (botLidNum && pNum === botLidNum)) &&
            (p.admin === "admin" || p.admin === "superadmin")
          );
        });
      } catch {}

      if (!botIsAdmin) return;

      // CASE A: Someone tries to re-add a previously banned owner-attacker
      if (action === "add") {
        const bannedList = cfg.bannedByGroup[groupJid] || [];
        if (bannedList.length === 0) return;

        // If a Bot Owner themselves re-adds the user, automatically unban them
        if (isProtectedOwner(author)) {
          const reAddedNums = participants.map((p) => cleanNum(p));
          cfg.bannedByGroup[groupJid] = bannedList.filter((n) => !reAddedNums.includes(n));
          saveConfig(cfg);
          return;
        }

        const intruders = participants.filter((p) => bannedList.includes(cleanNum(p)));
        if (intruders.length > 0) {
          try {
            await sock.groupParticipantsUpdate(groupJid, intruders, "remove");
            const tags = intruders.map((u) => `@${cleanNum(u)}`);
            await sock.sendMessage(groupJid, {
              text:
                `🚫 *RE-ADD BLOCKED!*\n\n` +
                `${tags.join(", ")} is permanently banned from this group for removing the *Bot Owner* and has been removed again!`,
              mentions: intruders
            });
          } catch {}
        }
        return;
      }

      // CASE B: Someone removes a Bot Owner
      if (action === "remove") {
        const removedOwners = participants.filter((p) => isProtectedOwner(p));
        if (removedOwners.length === 0) return;

        // Ignore if owner left voluntarily or removed by bot/another owner
        if (!authorNum) return;
        if (authorNum === botNum || (botLidNum && authorNum === botLidNum)) return;
        if (isProtectedOwner(author)) return;

        // Add attacker to permanent group ban list so re-adding also fails
        if (!cfg.bannedByGroup[groupJid]) cfg.bannedByGroup[groupJid] = [];
        if (!cfg.bannedByGroup[groupJid].includes(authorNum)) {
          cfg.bannedByGroup[groupJid].push(authorNum);
          saveConfig(cfg);
        }

        // 1. Kick the attacker immediately
        try {
          await sock.sendMessage(groupJid, {
            text:
              `🚨 *ANTI-OWNER KICK TRIGGERED!*\n\n` +
              `⚠️ @${authorNum} removed the *Bot Owner*!\n` +
              `⚡ *Action:* Removing & banning @${authorNum} from re-joining, and restoring the Owner...`,
            mentions: [author, ...removedOwners]
          });
        } catch {}

        try {
          await sock.groupParticipantsUpdate(groupJid, [author], "remove");
        } catch {}

        // 2. Re-add the Owner(s) back to the group
        for (const ownerJid of removedOwners) {
          try {
            const addRes = await sock.groupParticipantsUpdate(groupJid, [ownerJid], "add");
            const status = Array.isArray(addRes) ? String(addRes[0]?.status || "") : "";

            if (status === "403" || status === "408" || status === "409") {
              const code = await sock.groupInviteCode(groupJid);
              await sock.sendMessage(ownerJid, {
                text:
                  `🛡️ *ANTI-OWNER KICK PROTECTION*\n\n` +
                  `Someone (@${authorNum}) removed you from a group, so I kicked and banned them from re-adding! ✅\n` +
                  `Your privacy settings prevented auto-adding, so here is your invite link back:\n` +
                  `https://chat.whatsapp.com/${code}`
              });
            }
          } catch {
            try {
              const code = await sock.groupInviteCode(groupJid);
              await sock.sendMessage(ownerJid, {
                text:
                  `🛡️ *ANTI-OWNER KICK PROTECTION*\n\n` +
                  `Someone (@${authorNum}) removed you from a group, so I kicked and banned them! ✅\n` +
                  `Rejoin here: https://chat.whatsapp.com/${code}`
              });
            } catch {}
          }
        }
      }
    } catch {}
  });
}

module.exports = {
  pattern: "antiownerkick",
  alias: ["aok", "ownerprotect", "unbanattacker"],
  type: "owner",
  desc: "Kick & ban anyone who removes a Bot Owner from re-adding (.antiownerkick / .unbanattacker)",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachAntiOwnerKickListener(sock);
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim().toLowerCase();

    const cfg = loadConfig();

    // Unban an attacker in the current group (.unbanattacker 91xxxx)
    if (cmdName === "unbanattacker") {
      if (!jid.endsWith("@g.us")) return send("❌ *Use this command inside the group!*");
      const targetNum = cleanNum(arg);
      if (!targetNum) return send("📌 *Usage:* `.unbanattacker 919876543210`");

      const list = cfg.bannedByGroup[jid] || [];
      if (!list.includes(targetNum)) {
        return send(`ℹ️ *${targetNum} is not in this group's ban list.*`);
      }
      cfg.bannedByGroup[jid] = list.filter((n) => n !== targetNum);
      saveConfig(cfg);
      return send(`✅ *${targetNum} has been unbanned and can now be added back to this group!*`);
    }

    if (arg === "on") {
      cfg.enabled = true;
      saveConfig(cfg);
      return send("✅ *Anti-Owner Kick & Re-Add Ban ENABLED!*");
    }
    if (arg === "off") {
      cfg.enabled = false;
      saveConfig(cfg);
      return send("⭕ *Anti-Owner Kick Protection DISABLED!*");
    }

    const st = cfg.enabled ? "ON ✅" : "OFF ⭕";
    const bannedCount = (cfg.bannedByGroup[jid] || []).length;
    return send(
      `🛡️ *Anti-Owner Kick Status:* ${st}\n` +
      `🚫 *Banned Attackers in this group:* ${bannedCount}\n\n` +
      `• *Usage:* \`.antiownerkick on\` / \`off\`\n` +
      `• *Unban:* \`.unbanattacker <number>\``
    );
  }
};

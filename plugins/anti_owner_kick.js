const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_anti_owner_kick.json");

// Protected Owner Numbers
const OWNER_NUMBERS = ["918086165391", "917907228818"];

function loadConfig() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return { enabled: true };
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
      if (!groupJid || !groupJid.endsWith("@g.us")) return;
      if (action !== "remove" || !Array.isArray(participants)) return;

      // Find if any removed participant is one of the Bot Owners
      const removedOwners = participants.filter((p) => isProtectedOwner(p));
      if (removedOwners.length === 0) return;

      // Ignore if the owner left by themselves or removed by another owner/bot itself
      const botNum = cleanNum(sock.user?.id);
      const botLidNum = cleanNum(sock.user?.lid);
      const authorNum = cleanNum(author);

      if (!authorNum) return;
      if (authorNum === botNum || (botLidNum && authorNum === botLidNum)) return;
      if (isProtectedOwner(author)) return;

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

      // 1. Kick the attacker who removed the owner
      try {
        await sock.sendMessage(groupJid, {
          text:
            `🚨 *ANTI-OWNER KICK TRIGGERED!*\n\n` +
            `⚠️ @${authorNum} dared to remove the *Bot Owner*!\n` +
            `⚡ *Action:* Removing @${authorNum} and restoring the Owner...`,
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

          // If privacy blocks direct add (403/408), DM the group invite link to the owner
          if (status === "403" || status === "408" || status === "409") {
            const code = await sock.groupInviteCode(groupJid);
            await sock.sendMessage(ownerJid, {
              text:
                `🛡️ *ANTI-OWNER KICK PROTECTION*\n\n` +
                `Someone (@${authorNum}) removed you from a group, so I kicked them out! ✅\n` +
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
                `Someone (@${authorNum}) removed you from a group, so I kicked them out! ✅\n` +
                `Rejoin here: https://chat.whatsapp.com/${code}`
            });
          } catch {}
        }
      }
    } catch {}
  });
}

module.exports = {
  pattern: "antiownerkick",
  alias: ["aok", "ownerprotect"],
  type: "owner",
  desc: "Automatically kick anyone who removes a Bot Owner from a group and re-add the Owner",
  async execute({ sock, msg, jid, isOwner, text }) {
    attachAntiOwnerKickListener(sock);
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const arg = (text || raw.split(/\s+/)[1] || "").trim().toLowerCase();

    const cfg = loadConfig();
    if (arg === "on") {
      cfg.enabled = true;
      saveConfig(cfg);
      return send("✅ *Anti-Owner Kick Protection ENABLED!*\n_(Anyone who removes an Owner will be kicked immediately)_");
    }
    if (arg === "off") {
      cfg.enabled = false;
      saveConfig(cfg);
      return send("⭕ *Anti-Owner Kick Protection DISABLED!*");
    }

    const st = cfg.enabled ? "ON ✅" : "OFF ⭕";
    return send(
      `🛡️ *Anti-Owner Kick Status:* ${st}\n\n` +
      `• *Protected Owners:* ${OWNER_NUMBERS.join(", ")}\n` +
      `• *Usage:* \`.antiownerkick on\` or \`.antiownerkick off\``
    );
  }
};

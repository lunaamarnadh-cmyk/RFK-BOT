async function isGroupAdmin(sock, groupJid, userJid) {
  if (!groupJid || !userJid) return false;
  const cleanUser = userJid.split(":")[0].split("@")[0];
  try {
    const meta = await sock.groupMetadata(groupJid);
    return (meta.participants || []).some((p) => {
      const pNum = (p.id || "").split(":")[0].split("@")[0];
      return pNum === cleanUser && (p.admin === "admin" || p.admin === "superadmin");
    });
  } catch {
    return false;
  }
}

module.exports = {
  pattern: "kick",
  alias: ["remove", "delete", "del"],
  type: "admin",
  desc: "Kick members (.kick) and delete messages (.delete / .del) in groups",
  async execute({ sock, msg, jid, isOwner }) {
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
    const ctx = msg.message?.extendedTextMessage?.contextInfo || {};

    // 1. .delete / .del Command
    if (cmdName === "delete" || cmdName === "del") {
      if (!ctx.stanzaId) {
        return send("🗑️ *Reply to the message you want to delete with `.delete` or `.del`!*");
      }
      try {
        await sock.sendMessage(jid, {
          delete: {
            remoteJid: jid,
            fromMe: false,
            id: ctx.stanzaId,
            participant: ctx.participant
          }
        });
      } catch {
        return send("❌ *Failed to delete message. Make sure I am an admin!*");
      }
      return;
    }

    // 2. .kick / .remove Command
    if (cmdName === "kick" || cmdName === "remove") {
      const mentioned = ctx.mentionedJid || [];
      let usersToKick = [];

      if (mentioned.length > 0) {
        usersToKick = mentioned;
      } else if (ctx.participant) {
        usersToKick = [ctx.participant];
      }

      if (usersToKick.length === 0) {
        return send("👤 *Mention (`@user`) or reply to the user you want to kick!*");
      }

      const botNum = (sock.user?.id || "").split(":")[0].split("@")[0];
      const botLidNum = (sock.user?.lid || "").split(":")[0].split("@")[0];

      const tryingToKickBot = usersToKick.some((u) => {
        const uNum = u.split(":")[0].split("@")[0];
        return (botNum && uNum === botNum) || (botLidNum && uNum === botLidNum);
      });

      if (tryingToKickBot) {
        return send("❌ *Cannot kick myself!*");
      }

      try {
        await sock.groupParticipantsUpdate(jid, usersToKick, "remove");
        const tags = usersToKick.map((u) => `@${u.split(":")[0].split("@")[0]}`);
        await sock.sendMessage(
          jid,
          {
            text: `✅ ${tags.join(", ")} *has been kicked from the group.*`,
            mentions: usersToKick
          },
          { quoted: msg }
        );
      } catch {
        return send("❌ *Failed to kick user(s). Make sure I am a group admin!*");
      }
    }
  }
};

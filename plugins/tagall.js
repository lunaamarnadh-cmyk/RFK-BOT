module.exports = [
    {
        pattern: "tagall",
        alias: ["all", "everyone", "hidetag"],
        type: "group",
        async execute({ sock, msg, jid, text, reply }) {
            if (!jid.endsWith("@g.us")) {
                return reply("❌ *ഈ കമാൻഡ് ഗ്രൂപ്പുകളിൽ മാത്രമേ ഉപയോഗിക്കാൻ കഴിയൂ!*");
            }

            try {
                const groupMeta = await sock.groupMetadata(jid);
                const participants = groupMeta.participants || [];
                const mentions = participants.map((p) => p.id);

                const bodyText = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
                if (bodyText.startsWith("hidetag") || bodyText.startsWith(".hidetag")) {
                    const msgText = text || "📢 *Attention Everyone!*";
                    return await sock.sendMessage(jid, { text: msgText, mentions }, { quoted: msg });
                }

                let tagText = `╭━━━〔 ☭ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂* ☭ 〕━━━╮\n`;
                tagText += `┃ 👥 *Group:* ${groupMeta.subject}\n`;
                tagText += `┃ 📊 *Members:* ${participants.length}\n`;
                if (text) tagText += `┃ 💬 *Message:* ${text}\n`;
                tagText += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;

                participants.forEach((p, i) => {
                    const num = p.id.split("@")[0].split(":")[0];
                    tagText += `${i + 1}. @${num}\n`;
                });

                await sock.sendMessage(
                    jid,
                    {
                        text: tagText,
                        mentions
                    },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("Tagall error:", err.message);
                await reply(`❌ *Error:* ${err.message}`);
            }
        }
    },
    {
        pattern: "mee",
        alias: ["tagmee", "me"],
        type: "tools",
        async execute({ sock, msg, jid, sender }) {
            const target = sender || msg.key.participant || jid;
            const num = target.split("@")[0].split(":")[0];

            await sock.sendMessage(
                jid,
                {
                    text: `@${num}`,
                    mentions: [target]
                },
                { quoted: msg }
            );
        }
    }
];

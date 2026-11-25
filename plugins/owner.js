module.exports = [
    {
        pattern: "owner",
        alias: ["creator", "dev", "rfk"],
        type: "main",
        async execute({ sock, msg, jid }) {
            const ownerNumber = "917907228818";
            const ownerName = "𝐑𝐅𝐊 𝐂𝐇𝐄𝐊𝐔𝐓𝐇𝐀𝐀𝐍";
            const youtubeLink = "https://youtube.com/@rfkmod4333";
            const whatsappLink = "https://wa.me/917907228818";

            // 1. Owner Contact Card (vCard)
            const vcard =
                "BEGIN:VCARD\n" +
                "VERSION:3.0\n" +
                `FN:${ownerName}\n` +
                "ORG:RFK MODS;\n" +
                `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
                "END:VCARD";

            await sock.sendMessage(
                jid,
                {
                    contacts: {
                        displayName: ownerName,
                        contacts: [{ vcard }]
                    }
                },
                { quoted: msg }
            );

            // 2. YouTube & WhatsApp Links Message
            const caption =
                `╭━━━〔 *乂 𝐑𝐅𝐊 𝐁𝐎𝐓 𝐎𝐖𝐍𝐄𝐑 乂* 〕━━━╮\n` +
                `┃\n` +
                `┃ 👤 *Name:* ${ownerName}\n` +
                `┃ 📱 *Number:* +${ownerNumber}\n` +
                `┃\n` +
                `┃ 🎬 *YouTube Channel:*\n` +
                `┃ ${youtubeLink}\n` +
                `┃\n` +
                `┃ 💬 *WhatsApp Link:*\n` +
                `┃ ${whatsappLink}\n` +
                `┃\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━╯`;

            await sock.sendMessage(
                jid,
                {
                    text: caption,
                    contextInfo: {
                        externalAdReply: {
                            title: "𝐑𝐅𝐊 𝐌𝐎𝐃𝐒 • 𝐎𝐟𝐟𝐢𝐜𝐢𝐚𝐥",
                            body: "Tap to subscribe on YouTube",
                            thumbnailUrl: "https://files.catbox.moe/c6gg07.jpg",
                            sourceUrl: youtubeLink,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                },
                { quoted: msg }
            );
        }
    }
];

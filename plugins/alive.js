const fs = require("fs");
const path = require("path");

const imgPath = path.join(__dirname, "../bot_photo.jpg");
const ALIVE_IMAGE = process.env.ALIVE_IMG || "";

module.exports = {
    pattern: "alive",
    alias: ["bot", "online"],
    type: "main",
    async execute({ sock, msg, jid, pushname, uptime }) {
        const caption =
            `╭━━━〔 ☭ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂* ☭ 〕━━━╮\n` +
            `┃ 👋 *ഹലോ ${pushname || "User"}!*\n` +
            `┃ ✅ *Status* : Online & Active\n` +
            `┃ ⏳ *Uptime* : ${uptime}\n` +
            `┃ ⚙️ *Mode*   : ${process.env.MODE || "public"}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━╯\n` +
            `📋 കമാൻഡുകൾ കാണാൻ *\`.menu\`* അയക്കുക.`;

        try {
            if (fs.existsSync(imgPath)) {
                await sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption }, { quoted: msg });
            } else if (ALIVE_IMAGE) {
                await sock.sendMessage(jid, { image: { url: ALIVE_IMAGE }, caption }, { quoted: msg });
            } else {
                await sock.sendMessage(jid, { text: caption }, { quoted: msg });
            }
        } catch {
            await sock.sendMessage(jid, { text: caption }, { quoted: msg });
        }
    }
};

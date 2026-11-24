const fs = require("fs");
const path = require("path");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const imgPath = path.join(__dirname, "../bot_photo.jpg");
const DEFAULT_URL = process.env.MENU_IMG || process.env.ALIVE_IMG || "";

module.exports = [
    {
        pattern: "setimg",
        alias: ["setphoto", "setmenu", "setalive"],
        type: "owner",
        async execute({ msg, reply, isOwner }) {
            if (!isOwner) return;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const imgMsg = quoted?.imageMessage || msg.message?.imageMessage;

            if (!imgMsg) {
                return reply("📸 *ഉപയോഗം:* വാട്‌സാപ്പിൽ ഏതെങ്കിലും ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി *`.setimg`* എന്ന് അയക്കുക.");
            }

            try {
                const stream = await downloadContentFromMessage(imgMsg, "image");
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }
                fs.writeFileSync(imgPath, buffer);
                return reply("✅ *ഫോട്ടോ ലൈവ് ആയി മാറ്റിയിട്ടുണ്ട്!*\nഇനി *`.menu`* അല്ലെങ്കിൽ *`.alive`* അയച്ചു നോക്കൂ.");
            } catch (err) {
                return reply("❌ ഫോട്ടോ മാറ്റാൻ സാധിച്ചില്ല: " + err.message);
            }
        }
    },
    {
        pattern: "menu",
        alias: ["help", "list", "commands"],
        type: "main",
        async execute({ sock, msg, jid, pushname, commands, uptime }) {
            const senderName = pushname || "User";

            let menuText =
                `╭━━━〔 ☭ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂* ☭ 〕━━━╮\n` +
                `┃ 👤 *User*    : ${senderName}\n` +
                `┃ 🤖 *Bot*     : RFK-BOT MD\n` +
                `┃ ⏳ *Uptime*  : ${uptime}\n` +
                `┃ ⚙️ *Mode*    : ${process.env.MODE || "public"}\n` +
                `┃ 📦 *Plugins* : ${commands.size}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
                `📋 *AVAILABLE COMMANDS:*\n\n`;

            const grouped = {};
            for (const [cmdName, cmdObj] of commands.entries()) {
                const category = (cmdObj.type || "general").toUpperCase();
                if (!grouped[category]) grouped[category] = [];
                if (!grouped[category].includes(cmdObj.pattern)) {
                    grouped[category].push(cmdObj.pattern);
                }
            }

            for (const [cat, list] of Object.entries(grouped)) {
                menuText += `╭──「 *${cat}* 」\n`;
                list.forEach((c) => {
                    menuText += `│ ▸ \`.${c}\`\n`;
                });
                menuText += `╰──────────────\n\n`;
            }

            menuText += `⚡ *Powered by 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒*`;

            try {
                if (fs.existsSync(imgPath)) {
                    await sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption: menuText }, { quoted: msg });
                } else if (DEFAULT_URL) {
                    await sock.sendMessage(jid, { image: { url: DEFAULT_URL }, caption: menuText }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
                }
            } catch {
                await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
            }
        }
    }
];

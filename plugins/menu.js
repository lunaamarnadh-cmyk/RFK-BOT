const fs = require("fs");
const path = require("path");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const imgPath = path.join(__dirname, "../bot_photo.jpg");
const vidPath = path.join(__dirname, "../bot_video.mp4");
const DEFAULT_URL = process.env.MENU_IMG || process.env.ALIVE_IMG || "https://files.catbox.moe/gg4pf9.mp4";

module.exports = [
    {
        pattern: "setimg",
        alias: ["setphoto", "setmenu", "setalive"],
        type: "owner",
        async execute({ msg, reply, isOwner, args }) {
            if (!isOwner) return;

            if ((args?.[0] || "").toLowerCase() === "reset") {
                if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
                if (fs.existsSync(vidPath)) fs.unlinkSync(vidPath);
                return reply("✅ *ഡിഫോൾട്ട് വീഡിയോ അനിമേഷനിലേക്ക് മാറ്റിയിട്ടുണ്ട്!*");
            }

            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const imgMsg = quoted?.imageMessage || msg.message?.imageMessage;
            const vidMsg = quoted?.videoMessage || msg.message?.videoMessage;

            if (!imgMsg && !vidMsg) {
                return reply("📸 *ഉപയോഗം:* വാട്‌സാപ്പിൽ ഏതെങ്കിലും *ഫോട്ടോയ്ക്കോ വീഡിയോയ്ക്കോ* റിപ്ലൈ ആയി *`.setimg`* എന്ന് അയക്കുക.\n*(പഴയ വീഡിയോയിലേക്ക് തിരികെ പോകാൻ `.setimg reset` അയക്കുക)*");
            }

            try {
                if (vidMsg) {
                    const stream = await downloadContentFromMessage(vidMsg, "video");
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
                    fs.writeFileSync(vidPath, buffer);
                    return reply("✅ *മെനു വീഡിയോ അനിമേഷൻ ലൈവ് ആയി മാറ്റിയിട്ടുണ്ട്!*\nഇനി *`.menu`* അയച്ചു നോക്കൂ.");
                } else {
                    const stream = await downloadContentFromMessage(imgMsg, "image");
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    if (fs.existsSync(vidPath)) fs.unlinkSync(vidPath);
                    fs.writeFileSync(imgPath, buffer);
                    return reply("✅ *ഫോട്ടോ ലൈവ് ആയി മാറ്റിയിട്ടുണ്ട്!*\nഇനി *`.menu`* അല്ലെങ്കിൽ *`.alive`* അയച്ചു നോക്കൂ.");
                }
            } catch (err) {
                return reply("❌ മാറ്റാൻ സാധിച്ചില്ല: " + err.message);
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
                if (fs.existsSync(vidPath)) {
                    await sock.sendMessage(jid, { video: fs.readFileSync(vidPath),  caption: menuText }, { quoted: msg });
                } else if (fs.existsSync(imgPath)) {
                    await sock.sendMessage(jid, { image: fs.readFileSync(imgPath), caption: menuText }, { quoted: msg });
                } else if (DEFAULT_URL) {
                    const isVideo = /\.(mp4|gif|mkv|webm)(\?.*)?$/i.test(DEFAULT_URL);
                    if (isVideo) {
                        await sock.sendMessage(jid, { video: { url: DEFAULT_URL },  caption: menuText }, { quoted: msg });
                    } else {
                        await sock.sendMessage(jid, { image: { url: DEFAULT_URL }, caption: menuText }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
                }
            } catch {
                await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
            }
        }
    }
];

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const config = require("../config");

const dbPath = path.join(__dirname, "mention_data.json");

// Default data with your links & custom quoted card
if (!fs.existsSync(dbPath)) {
    fs.writeJsonSync(dbPath, {
        enabled: true,
        type: "audio",
        urls: [
            "https://lokixer.onrender.com/file/aqcyuwloivpip.mp4",
            "https://lokixer.onrender.com/file/ucwkbsoldleij.mp4",
            "https://lokixer.onrender.com/file/eumvohmdcwuml.mp4",
            "https://lokixer.onrender.com/file/fcrjqrherlatk.mp4",
            "https://lokixer.onrender.com/file/shviuorcjynew.mp4",
            "https://lokixer.onrender.com/file/yuqxhuyqtochc.mp4",
            "https://lokixer.onrender.com/file/pybjhkbpprpyr.mp4",
            "https://lokixer.onrender.com/file/bbbcdpyudnshq.mp4",
            "https://lokixer.onrender.com/file/upzsgfuoxllsh.mp4",
            "https://lokixer.onrender.com/file/hkvxuzaiilqxd.mp4",
            "https://lokixer.onrender.com/file/oueygkwnnbwmn.mp4",
            "https://lokixer.onrender.com/file/bmiycqfrhfrjw.mp4",
            "https://lokixer.onrender.com/file/tvxljfgssbawv.mp4",
            "https://lokixer.onrender.com/file/ludpblypyxgio.mp4",
            "https://lokixer.onrender.com/file/uoeespshesinb.mp4",
            "https://lokixer.onrender.com/file/sbmmgqhzyvmjc.mp4",
            "https://lokixer.onrender.com/file/rcmygyeegkbdy.mp4"
        ],
        options: {
            ptt: true,
            waveform: [0, 99, 0, 99, 99, 0, 99, 0],
            quoted: {
                key: {
                    fromMe: false,
                    participant: "0@s.whatsapp.net",
                    remoteJid: "status@broadcast"
                },
                message: {
                    contactMessage: {
                        displayName: "RFK-BOT-MD",
                        vcard: "BEGIN:VCARD\nVERSION:3.0\nN:XL;RFK,;;;\nFN:RFK,\nitem1.TEL;waid=918848047689:918848047689\nitem1.X-ABLabel:Ponsel\nEND:VCARD",
                        jpegThumbnailUrl: "https://files.catbox.moe/c6gg07.jpg"
                    }
                }
            }
        }
    });
}

module.exports = [
    // 1. Auto-Reply when Mentioned / Tagged
    {
        on: "message",
        async execute({ sock, msg, jid, fromMe }) {
            if (fromMe) return;
            const data = fs.readJsonSync(dbPath);
            if (!data.enabled || !data.urls || !data.urls.length) return;

            const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const ownerJid = config.OWNER_NUMBER + "@s.whatsapp.net";

            const contextInfo =
                msg.message?.extendedTextMessage?.contextInfo ||
                msg.message?.imageMessage?.contextInfo ||
                msg.message?.videoMessage?.contextInfo ||
                {};

            const mentioned = contextInfo.mentionedJid || [];
            const quotedParticipant = contextInfo.participant || "";

            const isTagged =
                mentioned.includes(botId) ||
                mentioned.includes(ownerJid) ||
                quotedParticipant === botId ||
                quotedParticipant === ownerJid;

            if (isTagged) {
                const randomUrl = data.urls[Math.floor(Math.random() * data.urls.length)];
                const opts = data.options || {};

                // Fetch thumbnail buffer if jpegThumbnailUrl is set
                let quotedMsg = opts.quoted || msg;
                if (quotedMsg?.message?.contactMessage?.jpegThumbnailUrl && !quotedMsg.message.contactMessage.jpegThumbnail) {
                    try {
                        const thumbRes = await axios.get(quotedMsg.message.contactMessage.jpegThumbnailUrl, { responseType: "arraybuffer" });
                        quotedMsg = JSON.parse(JSON.stringify(quotedMsg));
                        quotedMsg.message.contactMessage.jpegThumbnail = Buffer.from(thumbRes.data);
                    } catch (e) {}
                }

                const messagePayload =
                    data.type === "video"
                        ? { video: { url: randomUrl }, caption: opts.caption || "" }
                        : {
                              audio: { url: randomUrl },
                              mimetype: "audio/mp4",
                              ptt: opts.ptt !== undefined ? opts.ptt : true,
                              waveform: opts.waveform || [0, 99, 0, 99, 99, 0, 99, 0]
                          };

                await sock.sendMessage(jid, messagePayload, { quoted: quotedMsg });
            }
        }
    },

    // 2. .mention command (Supports your exact format!)
    {
        pattern: "mention",
        type: "manage",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            const data = fs.readJsonSync(dbPath);

            if (!text) {
                return reply(
                    `🎵 *RFK MENTION SETTINGS*\n\n` +
                    `• *Status:* ${data.enabled ? "✅ ON" : "❌ OFF"}\n` +
                    `• *Type:* ${data.type}\n` +
                    `• *Total Songs:* ${data.urls.length}\n\n` +
                    `*Usage:*\n` +
                    `• \`.mention on\` / \`.mention off\`\n` +
                    `• \`.mention get\` (നിലവിലെ സെറ്റിംഗ്സ് കാണാൻ)\n` +
                    `• \`.mention url1 url2 type/audio {"ptt":true,...}\``
                );
            }

            if (text.toLowerCase() === "on") {
                data.enabled = true;
                fs.writeJsonSync(dbPath, data);
                return reply("✅ *Mention Auto-Reply ON!*");
            }

            if (text.toLowerCase() === "off") {
                data.enabled = false;
                fs.writeJsonSync(dbPath, data);
                return reply("❌ *Mention Auto-Reply OFF!*");
            }

            if (text.toLowerCase() === "get") {
                return reply(`📋 *Current Mention Config:*\n\n${data.urls.join(",")} type/${data.type} ${JSON.stringify(data.options)}`);
            }

            // Parse URLs, type/audio or type/video, and JSON options
            const urlMatches = text.match(/https?:\/\/[^\s,"{}]+/g);
            if (urlMatches && urlMatches.length > 0) {
                data.urls = urlMatches;
                data.enabled = true;

                const typeMatch = text.match(/type\/(audio|video)/i);
                if (typeMatch) {
                    data.type = typeMatch[1].toLowerCase();
                }

                const jsonStart = text.indexOf("{");
                if (jsonStart !== -1) {
                    try {
                        data.options = JSON.parse(text.slice(jsonStart));
                    } catch (e) {
                        return reply(`⚠️ URLs സേവ് ചെയ്തു, പക്ഷേ JSON ഫോർമാറ്റിൽ ചെറിയ തെറ്റുണ്ട്: ${e.message}`);
                    }
                }

                fs.writeJsonSync(dbPath, data);
                return reply(`✅ *Mention Updated!* (${data.urls.length} links saved as *${data.type}*)`);
            }

            return reply("❌ ശരിയായ URL നൽകുക!");
        }
    }
];

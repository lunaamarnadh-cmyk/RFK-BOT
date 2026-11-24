
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const axios = require("axios");

const dbPath = path.join(__dirname, "mention_data.json");

function getData() {
    if (!fs.existsSync(dbPath)) {
        const defaultData = {
            enabled: false,
            type: "audio",
            urls: [],
            options: {
                ptt: true,
                waveform: [0, 99, 0, 99, 99, 0, 99, 0]
            }
        };
        fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
        return defaultData;
    }
    return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveData(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

async function convertToVoiceNote(url) {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
    const tmpDir = os.tmpdir();
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inPath = path.join(tmpDir, `${id}_in`);
    const outPath = path.join(tmpDir, `${id}_out.ogg`);

    fs.writeFileSync(inPath, Buffer.from(res.data));

    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -y -i "${inPath}" -vn -c:a libopus -b:a 48k -ac 1 -ar 48000 "${outPath}"`,
            (err) => {
                try { fs.unlinkSync(inPath); } catch {}
                if (err) {
                    try { fs.unlinkSync(outPath); } catch {}
                    return reject(err);
                }
                const audioBuf = fs.readFileSync(outPath);
                try { fs.unlinkSync(outPath); } catch {}
                resolve(audioBuf);
            }
        );
    });
}

module.exports = [
    // 1. Auto-Reply when Mentioned / Tagged
    {
        on: "message",
        async execute({ sock, msg, jid, fromMe }) {
            const data = getData();
            if (!data.enabled || !data.urls || !data.urls.length) return;

            const botNum = (sock.user?.id || "").split(":")[0].split("@")[0];
            const botLid = (sock.user?.lid || "").split(":")[0].split("@")[0];
            const ownerNum = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");

            const m =
                msg.message?.ephemeralMessage?.message ||
                msg.message?.viewOnceMessage?.message ||
                msg.message;

            const contextInfo =
                m?.extendedTextMessage?.contextInfo ||
                m?.imageMessage?.contextInfo ||
                m?.videoMessage?.contextInfo ||
                {};

            const mentioned = contextInfo.mentionedJid || [];
            const quotedParticipant = (contextInfo.participant || "").split(":")[0].split("@")[0];

            const isTargetNum = (num) =>
                Boolean(num) && (num === botNum || num === botLid || num === ownerNum);

            const isTagged =
                mentioned.some((id) => isTargetNum(id.split(":")[0].split("@")[0])) ||
                isTargetNum(quotedParticipant);

            if (!isTagged) return;
            if (fromMe && !mentioned.length) return;

            // .jpg thumbnail URLs ഒഴിവാക്കി ശരിയായ ഓഡിയോ/വീഡിയോ ലിങ്ക് മാത്രം എടുക്കുന്നു
            const validUrls = data.urls.filter((u) => !/\.(jpg|jpeg|png|webp)$/i.test(u));
            if (!validUrls.length) return;

            const randomUrl = validUrls[Math.floor(Math.random() * validUrls.length)];
            const opts = data.options || {};

            let quotedMsg = opts.quoted || msg;
            if (quotedMsg?.message?.contactMessage?.jpegThumbnailUrl && !quotedMsg.message.contactMessage.jpegThumbnail) {
                try {
                    const thumbRes = await axios.get(quotedMsg.message.contactMessage.jpegThumbnailUrl, { responseType: "arraybuffer" });
                    quotedMsg = JSON.parse(JSON.stringify(quotedMsg));
                    quotedMsg.message.contactMessage.jpegThumbnail = Buffer.from(thumbRes.data);
                } catch {}
            }

            try {
                if (data.type === "video") {
                    await sock.sendMessage(
                        jid,
                        { video: { url: randomUrl }, caption: opts.caption || "" },
                        { quoted: quotedMsg }
                    );
                } else {
                    const oggBuffer = await convertToVoiceNote(randomUrl);
                    await sock.sendMessage(
                        jid,
                        {
                            audio: oggBuffer,
                            mimetype: "audio/ogg; codecs=opus",
                            ptt: opts.ptt !== undefined ? opts.ptt : true,
                            waveform: opts.waveform || [0, 99, 0, 99, 99, 0, 99, 0]
                        },
                        { quoted: quotedMsg }
                    );
                }
            } catch (err) {
                console.error("Mention send error:", err.message);
            }
        }
    },

    // 2. .mention command
    {
        pattern: "mention",
        type: "manage",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            const data = getData();

            if (!text) {
                return reply(
                    `🎵 *RFK MENTION SETTINGS*\n\n` +
                    `• *Status:* ${data.enabled ? "✅ ON" : "❌ OFF"}\n` +
                    `• *Type:* ${data.type}\n` +
                    `• *Total Songs:* ${data.urls.length}\n\n` +
                    `*Usage:*\n` +
                    `• \`mention on\` / \`mention off\`\n` +
                    `• \`mention clear\`\n` +
                    `• \`mention get\`\n` +
                    `• \`mention url1 url2 type/audio {"ptt":true,...}\``
                );
            }

            const cmd = text.trim().toLowerCase();

            if (cmd === "on") {
                data.enabled = true;
                saveData(data);
                return reply("✅ *Mention Auto-Reply ON!*");
            }

            if (cmd === "off") {
                data.enabled = false;
                saveData(data);
                return reply("❌ *Mention Auto-Reply OFF!*");
            }

            if (cmd === "clear") {
                data.urls = [];
                data.enabled = false;
                saveData(data);
                return reply("🗑️ *എല്ലാ Mention ലിങ്കുകളും ക്ലിയർ ചെയ്തു!*");
            }

            if (cmd === "get") {
                if (!data.urls.length) return reply("⚠️ നിലവിൽ ലിങ്കുകളൊന്നും സേവ് ചെയ്തിട്ടില്ല.");
                return reply(`📋 *Current Mention Config:*\n\n${data.urls.join(" ")} type/${data.type} ${JSON.stringify(data.options)}`);
            }

            // JSON ഭാഗത്തിന് മുൻപുള്ള ഭാഗത്ത് നിന്ന് മാത്രം ലിങ്കുകൾ എടുക്കുന്നു (thumbnail URL കയറാതിരിക്കാൻ)
            const jsonStart = text.indexOf("{");
            const urlPart = jsonStart !== -1 ? text.slice(0, jsonStart) : text;
            const urlMatches = urlPart.match(/https?:\/\/[^\s,"{}]+/g);

            if (urlMatches && urlMatches.length > 0) {
                data.urls = urlMatches;
                data.enabled = true;

                const typeMatch = urlPart.match(/type\/(audio|video)/i);
                if (typeMatch) {
                    data.type = typeMatch[1].toLowerCase();
                }

                if (jsonStart !== -1) {
                    try {
                        data.options = JSON.parse(text.slice(jsonStart));
                    } catch (e) {
                        return reply(`⚠️ URLs സേവ് ചെയ്തു, പക്ഷേ JSON ഫോർമാറ്റിൽ ചെറിയ തെറ്റുണ്ട്: ${e.message}`);
                    }
                }

                saveData(data);
                return reply(`✅ *Mention Updated!* (${data.urls.length} links saved as *${data.type}*)`);
            }

            return reply("❌ ശരിയായ URL നൽകുക!");
        }
    }
];

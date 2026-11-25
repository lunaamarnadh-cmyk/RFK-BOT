const fs = require("fs");
const path = require("path");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const STATUS_FILE = path.join(__dirname, "../autostatus.json");

function getStatusConfig() {
    if (fs.existsSync(STATUS_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
            return {
                enabled: data.enabled !== undefined ? data.enabled : true,
                save: data.save !== undefined ? data.save : true
            };
        } catch {}
    }
    return { enabled: true, save: true };
}

function saveStatusConfig(data) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

async function downloadMedia(msgContent, type) {
    const stream = await downloadContentFromMessage(msgContent, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

module.exports = [
    {
        on: "status",
        async execute({ sock, msg }) {
            const cfg = getStatusConfig();
            if (msg.key.fromMe) return;

            // 1. Auto Status View
            if (cfg.enabled) {
                try {
                    await sock.readMessages([msg.key]);
                } catch (err) {
                    console.error("Auto status view error:", err.message);
                }
            }

            // 2. Auto Status Save
            if (cfg.save && msg.message) {
                const sender = msg.key.participant || msg.participant;
                if (!sender || sender === "status@broadcast") return;

                const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                const pushName = msg.pushName || sender.split("@")[0];
                const senderNum = sender.split("@")[0];

                const m =
                    msg.message?.ephemeralMessage?.message ||
                    msg.message?.viewOnceMessage?.message ||
                    msg.message;

                try {
                    if (m?.imageMessage) {
                        const buffer = await downloadMedia(m.imageMessage, "image");
                        const caption = m.imageMessage.caption || "";
                        await sock.sendMessage(myJid, {
                            image: buffer,
                            caption: `📥 *Auto Status Saved*\n👤 *From:* ${pushName} (+${senderNum})\n${caption ? `📝 *Caption:* ${caption}` : ""}`
                        });
                    } else if (m?.videoMessage) {
                        const buffer = await downloadMedia(m.videoMessage, "video");
                        const caption = m.videoMessage.caption || "";
                        await sock.sendMessage(myJid, {
                            video: buffer,
                            caption: `📥 *Auto Status Saved*\n👤 *From:* ${pushName} (+${senderNum})\n${caption ? `📝 *Caption:* ${caption}` : ""}`
                        });
                    } else if (m?.audioMessage) {
                        const buffer = await downloadMedia(m.audioMessage, "audio");
                        await sock.sendMessage(myJid, {
                            audio: buffer,
                            mimetype: "audio/mp4",
                            ptt: m.audioMessage.ptt || false
                        });
                        await sock.sendMessage(myJid, {
                            text: `📥 *Audio Status Saved*\n👤 *From:* ${pushName} (+${senderNum})`
                        });
                    }
                } catch (err) {
                    console.error("Auto status save error:", err.message);
                }
            }
        }
    },
    {
        pattern: "autostatus",
        alias: ["statusview", "asv", "statussave"],
        type: "owner",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            const cfg = getStatusConfig();
            const arg = (text || "").trim().toLowerCase();

            if (arg === "on") {
                cfg.enabled = true;
                saveStatusConfig(cfg);
                return reply("✅ *Auto Status View ON ആക്കിയിട്ടുണ്ട്!*");
            }
            if (arg === "off") {
                cfg.enabled = false;
                saveStatusConfig(cfg);
                return reply("❌ *Auto Status View OFF ആക്കിയിട്ടുണ്ട്!*");
            }
            if (arg === "save on") {
                cfg.save = true;
                saveStatusConfig(cfg);
                return reply("✅ *Auto Status Save ON ആക്കിയിട്ടുണ്ട്!*");
            }
            if (arg === "save off") {
                cfg.save = false;
                saveStatusConfig(cfg);
                return reply("❌ *Auto Status Save OFF ആക്കിയിട്ടുണ്ട്!*");
            }

            return reply(
                `👁️ *Auto Status View:* ${cfg.enabled ? "ON ✅" : "OFF ❌"}\n` +
                `📥 *Auto Status Save:* ${cfg.save ? "ON ✅" : "OFF ❌"}\n\n` +
                `*കമാൻഡുകൾ:*\n` +
                `• \`.autostatus on / off\` (Status View)\n` +
                `• \`.autostatus save on / off\` (Status Save)`
            );
        }
    }
];

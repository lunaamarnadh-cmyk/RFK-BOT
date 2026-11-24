const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");

async function uploadToCatbox(buffer, filename) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, { filename });

    const res = await axios.post("https://catbox.moe/user/api.php", form, {
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });
    return res.data.trim();
}

module.exports = {
    pattern: "url",
    alias: ["tourl", "upload", "link"],
    type: "tools",
    async execute({ sock, msg, jid, reply }) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted || msg.message;

        const m =
            targetMsg?.ephemeralMessage?.message ||
            targetMsg?.viewOnceMessage?.message ||
            targetMsg;

        let mediaType = null;
        let mediaObj = null;
        let ext = "bin";

        if (m?.audioMessage) {
            mediaType = "audio";
            mediaObj = m.audioMessage;
            ext = "mp3";
        } else if (m?.videoMessage) {
            mediaType = "video";
            mediaObj = m.videoMessage;
            ext = "mp4";
        } else if (m?.imageMessage) {
            mediaType = "image";
            mediaObj = m.imageMessage;
            ext = "jpg";
        } else if (m?.stickerMessage) {
            mediaType = "sticker";
            mediaObj = m.stickerMessage;
            ext = "webp";
        } else if (m?.documentMessage) {
            mediaType = "document";
            mediaObj = m.documentMessage;
            ext = (mediaObj.fileName || "file.bin").split(".").pop();
        }

        if (!mediaType || !mediaObj) {
            return reply("❌ *ഏതെങ്കിലും ഓഡിയോ, വോയ്‌സ് നോട്ട്, വീഡിയോ അല്ലെങ്കിൽ ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.url` എന്ന് അയക്കുക!*");
        }

        const waitMsg = await sock.sendMessage(jid, { text: "⏳ *Uploading to server...*" }, { quoted: msg });

        try {
            const stream = await downloadContentFromMessage(mediaObj, mediaType);
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            const directUrl = await uploadToCatbox(buffer, `rfk_${Date.now()}.${ext}`);

            await sock.sendMessage(
                jid,
                {
                    text: `✅ *Direct Link Ready!*\n\n${directUrl}`,
                    edit: waitMsg.key
                }
            );
        } catch (err) {
            console.error("URL upload error:", err.message);
            await sock.sendMessage(
                jid,
                {
                    text: `❌ *Upload Failed:* ${err.message}`,
                    edit: waitMsg.key
                }
            );
        }
    }
};

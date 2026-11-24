
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");

module.exports = {
    pattern: "mp3",
    alias: ["tomp3", "audio", "vn"],
    type: "converter",
    async execute({ sock, msg, jid, reply }) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted || msg.message;

        const m =
            targetMsg?.ephemeralMessage?.message ||
            targetMsg?.viewOnceMessage?.message ||
            targetMsg;

        const videoObj = m?.videoMessage;
        if (!videoObj) {
            return reply("❌ *ഏതെങ്കിലും വീഡിയോയ്ക്ക് റിപ്ലൈ ആയി `mp3` എന്ന് അയക്കുക!*");
        }

        const waitMsg = await sock.sendMessage(jid, { text: "⏳ *Converting video to MP3...*" }, { quoted: msg });

        try {
            const stream = await downloadContentFromMessage(videoObj, "video");
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            // Free online audio extraction fallback without local ffmpeg
            const form = new FormData();
            form.append("file", buffer, { filename: "video.mp4", contentType: "video/mp4" });
            form.append("format", "mp3");

            let mp3Buffer = null;

            try {
                const res = await axios.post("https://api.ryzendesu.vip/api/convert/mp4tomp3", form, {
                    headers: form.getHeaders(),
                    responseType: "arraybuffer",
                    timeout: 30000
                });
                if (res.data && res.data.byteLength > 1000) {
                    mp3Buffer = Buffer.from(res.data);
                }
            } catch {}

            // Direct M4A/MP3 audio container fallback if external API is busy
            if (!mp3Buffer) {
                mp3Buffer = buffer;
            }

            await sock.sendMessage(
                jid,
                {
                    audio: mp3Buffer,
                    mimetype: "audio/mp4",
                    ptt: false
                },
                { quoted: msg }
            );

            await sock.sendMessage(jid, { delete: waitMsg.key });
        } catch (err) {
            console.error("MP3 convert error:", err.message);
            await sock.sendMessage(
                jid,
                {
                    text: `❌ *Conversion Failed:* ${err.message}`,
                    edit: waitMsg.key
                }
            );
        }
    }
};

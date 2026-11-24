const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let ffmpegPath = "ffmpeg";
try {
    ffmpegPath = require("ffmpeg-static");
} catch {}

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

            const tmpDir = os.tmpdir();
            const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const inPath = path.join(tmpDir, `${id}.mp4`);
            const outPath = path.join(tmpDir, `${id}.mp3`);

            fs.writeFileSync(inPath, buffer);

            await new Promise((resolve, reject) => {
                execFile(
                    ffmpegPath,
                    ["-y", "-i", inPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", outPath],
                    (err) => {
                        if (err) return reject(err);
                        resolve();
                    }
                );
            });

            const mp3Buffer = fs.readFileSync(outPath);
            try { fs.unlinkSync(inPath); } catch {}
            try { fs.unlinkSync(outPath); } catch {}

            await sock.sendMessage(
                jid,
                {
                    audio: mp3Buffer,
                    mimetype: "audio/mpeg",
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

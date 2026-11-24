const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

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

        const id = Date.now();
        const inputPath = path.join("/tmp", `in_${id}.mp4`);
        const outputPath = path.join("/tmp", `out_${id}.mp3`);

        try {
            const stream = await downloadContentFromMessage(videoObj, "video");
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            fs.writeFileSync(inputPath, Buffer.concat(chunks));

            await new Promise((resolve, reject) => {
                exec(`ffmpeg -y -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 192k "${outputPath}"`, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            const mp3Buffer = fs.readFileSync(outputPath);

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
        } finally {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        }
    }
};

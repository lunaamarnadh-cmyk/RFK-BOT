const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

let ffmpegPath = "ffmpeg";
try {
    ffmpegPath = require("ffmpeg-static");
} catch {}

async function downloadMedia(msgContent, type) {
    const stream = await downloadContentFromMessage(msgContent, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath, args, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout);
        });
    });
}

module.exports = [
    {
        pattern: "sticker",
        alias: ["s", "stiker"],
        type: "converter",
        async execute({ sock, msg, jid, reply }) {
            const m =
                msg.message?.ephemeralMessage?.message ||
                msg.message?.viewOnceMessage?.message ||
                msg.message;

            const quoted = m?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target =
                quoted?.ephemeralMessage?.message ||
                quoted?.viewOnceMessage?.message ||
                quoted ||
                m;

            const isImage = Boolean(target?.imageMessage);
            const isVideo = Boolean(target?.videoMessage);

            if (!isImage && !isVideo) {
                return reply("❌ *ഏതെങ്കിലും ഒരു ഫോട്ടോയ്‌ക്കോ വീഡിയോയ്ക്കോ Reply ആയി `.sticker` എന്ന് അയക്കുക!*");
            }

            const tmpDir = os.tmpdir();
            const id = Date.now();
            const inputPath = path.join(tmpDir, `in_${id}.${isImage ? "jpg" : "mp4"}`);
            const outputPath = path.join(tmpDir, `out_${id}.webp`);

            try {
                const buffer = await downloadMedia(
                    isImage ? target.imageMessage : target.videoMessage,
                    isImage ? "image" : "video"
                );
                fs.writeFileSync(inputPath, buffer);

                if (isImage) {
                    await runFFmpeg([
                        "-i", inputPath,
                        "-vf", "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white@0.0",
                        "-vcodec", "libwebp",
                        "-lossless", "1",
                        "-q:v", "80",
                        "-preset", "default",
                        "-an",
                        "-vsync", "0",
                        outputPath
                    ]);
                } else {
                    // വലിയ HD/4K വീഡിയോകളെയും ആദ്യത്തെ 6 സെക്കൻഡ് കട്ട് ചെയ്ത് പിക്സൽ ലിമിറ്റ് എറർ ഇല്ലാതെ സ്റ്റിക്കറാക്കാൻ
                    await runFFmpeg([
                        "-i", inputPath,
                        "-t", "6",
                        "-vf", "fps=15,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:-1:-1:color=white@0.0",
                        "-vcodec", "libwebp",
                        "-lossless", "0",
                        "-compression_level", "6",
                        "-q:v", "50",
                        "-loop", "0",
                        "-preset", "default",
                        "-an",
                        "-vsync", "0",
                        outputPath
                    ]);
                }

                const webpBuffer = fs.readFileSync(outputPath);
                await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: msg });
            } catch (err) {
                console.error("Sticker Error:", err.message);
                await reply(`❌ *Sticker Error:* ${err.message}`);
            } finally {
                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            }
        }
    }
];

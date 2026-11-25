const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

try {
    process.env.FFMPEG_PATH = require("ffmpeg-static");
} catch {}

async function downloadMedia(msgContent, type) {
    const stream = await downloadContentFromMessage(msgContent, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
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

            try {
                const buffer = await downloadMedia(
                    isImage ? target.imageMessage : target.videoMessage,
                    isImage ? "image" : "video"
                );

                const sticker = new Sticker(buffer, {
                    pack: "乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂",
                    author: "𝐑𝐅𝐊 𝐌𝐎𝐃𝐒",
                    type: StickerTypes.FULL,
                    quality: 50
                });

                const stickerBuffer = await sticker.toBuffer();

                await sock.sendMessage(
                    jid,
                    { sticker: stickerBuffer },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("Sticker Error:", err.message);
                await reply(`❌ *വീഡിയോ സ്റ്റിക്കർ Error:* ${err.message}`);
            }
        }
    }
];

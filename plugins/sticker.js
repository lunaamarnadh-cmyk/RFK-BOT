const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const PACK_NAME = "乂𝐑𝐅𝐊 𝐁𝐎𝐓乂";
const AUTHOR_NAME = "𝐑𝐅𝐊 𝐌𝐎𝐃𝐒";

async function downloadMedia(mediaObj, mediaType) {
    const stream = await downloadContentFromMessage(mediaObj, mediaType);
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

module.exports = {
    pattern: "sticker",
    alias: ["s", "st", "take", "wm"],
    type: "converter",
    async execute({ sock, msg, jid, text, reply }) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted || msg.message;

        const m =
            targetMsg?.ephemeralMessage?.message ||
            targetMsg?.viewOnceMessage?.message ||
            targetMsg;

        let mediaType = null;
        let mediaObj = null;

        if (m?.imageMessage) {
            mediaType = "image";
            mediaObj = m.imageMessage;
        } else if (m?.videoMessage) {
            mediaType = "video";
            mediaObj = m.videoMessage;
        } else if (m?.stickerMessage) {
            mediaType = "sticker";
            mediaObj = m.stickerMessage;
        }

        if (!mediaType || !mediaObj) {
            return reply("❌ *ഏതെങ്കിലും ഫോട്ടോയ്ക്കോ, വീഡിയോയ്ക്കോ, സ്റ്റിക്കറിനോ റിപ്ലൈ ആയി `sticker` അല്ലെങ്കിൽ `s` എന്ന് അയക്കുക!*");
        }

        try {
            const buffer = await downloadMedia(mediaObj, mediaType);

            // Custom pack|author if provided (e.g., take MyPack|MyName)
            let pack = PACK_NAME;
            let author = AUTHOR_NAME;
            if (text && text.includes("|")) {
                const parts = text.split("|");
                pack = parts[0].trim() || PACK_NAME;
                author = parts[1].trim() || AUTHOR_NAME;
            } else if (text && text.trim()) {
                pack = text.trim();
            }

            const sticker = new Sticker(buffer, {
                pack,
                author,
                type: StickerTypes.FULL,
                quality: 70
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });
        } catch (err) {
            console.error("Sticker error:", err.message);
            await reply(`❌ *Sticker Error:* ${err.message}`);
        }
    }
};

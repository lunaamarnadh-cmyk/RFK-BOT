const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");

async function downloadMedia(msgContent, type) {
    const stream = await downloadContentFromMessage(msgContent, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function getGoogleTTS(text, lang = "en") {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    const { data } = await axios.get(url, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": "Mozilla/5.0"
        }
    });
    return Buffer.from(data);
}

module.exports = [
    // 1. ഓഡിയോ/വീഡിയോ ഫയലിനെ Voice Message (PTT) ആക്കാൻ (.ptt / .vn)
    {
        pattern: "ptt",
        alias: ["vn", "voice", "tovn"],
        type: "converter",
        async execute({ sock, msg, jid, reply }) {
            const quoted =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const target =
                quoted?.ephemeralMessage?.message ||
                quoted?.viewOnceMessage?.message ||
                quoted;

            if (!target || (!target.audioMessage && !target.videoMessage && !target.documentMessage)) {
                return reply("❌ *ഏതെങ്കിലും ഒരു ഓഡിയോ അല്ലെങ്കിൽ വീഡിയോ മെസ്സേജിന് Reply ആയി `.ptt` എന്ന് അയക്കുക!*");
            }

            try {
                let buffer;
                if (target.audioMessage) {
                    buffer = await downloadMedia(target.audioMessage, "audio");
                } else if (target.videoMessage) {
                    buffer = await downloadMedia(target.videoMessage, "video");
                } else if (target.documentMessage) {
                    buffer = await downloadMedia(target.documentMessage, "document");
                }

                await sock.sendMessage(
                    jid,
                    {
                        audio: buffer,
                        mimetype: "audio/mp4",
                        ptt: true
                    },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("PTT Error:", err.message);
                await reply("❌ *വോയിസ് മെസ്സേജ് ആക്കാൻ സാധിച്ചില്ല!*");
            }
        }
    },

    // 2. Text to Speech - ഇംഗ്ലീഷ് / പൊതുവായ ഭാഷ (.tts)
    {
        pattern: "tts",
        alias: ["say", "speak"],
        type: "tools",
        async execute({ sock, msg, jid, text, reply }) {
            const quotedText =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

            const input = (text || quotedText || "").trim();
            if (!input) {
                return reply("❌ *വോയിസ് ആക്കേണ്ട വാചകം നൽകുക!*\n\n*ഉദാഹരണം:* `.tts Hello guys welcome to RFK BOT`");
            }

            // .tts ml <text> എന്ന രീതിയിലും ഭാഷ മാറ്റാം
            let lang = "en";
            let speechText = input;
            const parts = input.split(" ");
            if (parts[0].length === 2 && ["ml", "hi", "ta", "ar", "en"].includes(parts[0].toLowerCase()) && parts.length > 1) {
                lang = parts[0].toLowerCase();
                speechText = parts.slice(1).join(" ");
            }

            try {
                const audioBuffer = await getGoogleTTS(speechText.slice(0, 200), lang);
                await sock.sendMessage(
                    jid,
                    {
                        audio: audioBuffer,
                        mimetype: "audio/mp4",
                        ptt: true
                    },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("TTS Error:", err.message);
                await reply("❌ *TTS വോയിസ് നിർമ്മിക്കാൻ സാധിച്ചില്ല!*");
            }
        }
    },

    // 3. Malayalam Text to Speech (.mtts)
    {
        pattern: "mtts",
        alias: ["maltts", "mltts"],
        type: "tools",
        async execute({ sock, msg, jid, text, reply }) {
            const quotedText =
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

            const input = (text || quotedText || "").trim();
            if (!input) {
                return reply("❌ *മലയാളം വാചകം നൽകുക!*\n\n*ഉദാഹരണം:* `.mtts നമസ്കാരം കൂട്ടുകാരെ`");
            }

            try {
                const audioBuffer = await getGoogleTTS(input.slice(0, 200), "ml");
                await sock.sendMessage(
                    jid,
                    {
                        audio: audioBuffer,
                        mimetype: "audio/mp4",
                        ptt: true
                    },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("MTTS Error:", err.message);
                await reply("❌ *മലയാളം TTS നിർമ്മിക്കാൻ സാധിച്ചില്ല!*");
            }
        }
    }
];

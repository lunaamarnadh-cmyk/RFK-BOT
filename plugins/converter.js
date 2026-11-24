const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");

async function downloadMedia(msg, type) {
    const stream = await downloadContentFromMessage(msg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

module.exports = [
    // 1. View Once Opener (.vv)
    {
        pattern: "vv",
        type: "whatsapp",
        async execute({ sock, msg, jid, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return reply("❌ ഒരു View Once ഫോട്ടോക്കോ വീഡിയോക്കോ റിപ്ലൈ ആയി `.vv` അയക്കുക!");

            const viewOnceMsg =
                quoted.viewOnceMessageV2?.message ||
                quoted.viewOnceMessage?.message ||
                quoted;

            if (viewOnceMsg.imageMessage) {
                const buffer = await downloadMedia(viewOnceMsg.imageMessage, "image");
                return sock.sendMessage(jid, { image: buffer, caption: viewOnceMsg.imageMessage.caption || "🔓 *Opened by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            }
            if (viewOnceMsg.videoMessage) {
                const buffer = await downloadMedia(viewOnceMsg.videoMessage, "video");
                return sock.sendMessage(jid, { video: buffer, caption: viewOnceMsg.videoMessage.caption || "🔓 *Opened by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            }
            if (viewOnceMsg.audioMessage) {
                const buffer = await downloadMedia(viewOnceMsg.audioMessage, "audio");
                return sock.sendMessage(jid, { audio: buffer, mimetype: "audio/mp4", ptt: true }, { quoted: msg });
            }
            return reply("❌ ഇത് ഒരു View Once മെസേജ് അല്ല!");
        }
    },

    // 2. Status & Media Saver (.save)
    {
        pattern: "save",
        type: "misc",
        async execute({ sock, msg, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return reply("❌ സേവ് ചെയ്യേണ്ട സ്റ്റാറ്റസിനോ മെസേജിനോ റിപ്ലൈ ആയി `.save` അയക്കുക!");

            const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

            if (quoted.imageMessage) {
                const buffer = await downloadMedia(quoted.imageMessage, "image");
                return sock.sendMessage(myJid, { image: buffer, caption: quoted.imageMessage.caption || "✅ *Saved by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" });
            }
            if (quoted.videoMessage) {
                const buffer = await downloadMedia(quoted.videoMessage, "video");
                return sock.sendMessage(myJid, { video: buffer, caption: quoted.videoMessage.caption || "✅ *Saved by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" });
            }
            if (quoted.conversation || quoted.extendedTextMessage?.text) {
                const txt = quoted.conversation || quoted.extendedTextMessage.text;
                return sock.sendMessage(myJid, { text: `📝 *Saved Text:*\n\n${txt}` });
            }
            return reply("❌ ഈ മെസേജ് സേവ് ചെയ്യാൻ കഴിയില്ല!");
        }
    },

    // 3. Google Translate (.trt)
    {
        pattern: "trt",
        type: "converter",
        async execute({ msg, text, reply }) {
            const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "";
            const lang = text.split(" ")[0] || "ml";
            const query = text.split(" ").slice(1).join(" ") || quotedText;

            if (!query) return reply("❌ ഉപയോഗിക്കേണ്ട രീതി: `.trt ml Hello how are you` (അല്ലെങ്കിൽ ഒരു മെസേജിന് റിപ്ലൈ ആയി `.trt ml`)");
            try {
                const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(query)}`);
                const translated = res.data[0].map(item => item[0]).join("");
                reply(`🌐 *Translated (${lang}):*\n\n${translated}`);
            } catch (e) {
                reply(`❌ Translation Error: ${e.message}`);
            }
        }
    },

    // 4. Text to Speech (.tts)
    {
        pattern: "tts",
        type: "converter",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ ശബ്ദമാക്കി മാറ്റേണ്ട വാചകം നൽകുക! (ഉദാ: `.tts Namaskaram RFK`)");
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ml&client=tw-ob`;
            await sock.sendMessage(jid, { audio: { url: ttsUrl }, mimetype: "audio/mp4", ptt: true }, { quoted: msg });
        }
    },

    // 5. Fancy Stylish Text (.fancy)
    {
        pattern: "fancy",
        type: "converter",
        async execute({ text, reply }) {
            if (!text) return reply("❌ സ്റ്റൈൽ മാറ്റേണ്ട പേര് നൽകുക! (ഉദാ: `.fancy RFK BOT`)");
            const bold = text.replace(/[A-Za-z]/g, c => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 119737 : 119743)));
            const mono = text.replace(/[A-Za-z]/g, c => String.fromCodePoint(c.charCodeAt(0) + (c >= "a" ? 120361 : 120367)));
            reply(`✨ *Fancy Styles:*\n\n1. 乂${bold}乂\n2. ☭ ${mono} ☭\n3. 『 ${text.toUpperCase()} 』`);
        }
    }
];

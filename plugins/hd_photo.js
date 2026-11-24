const axios = require("axios");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function getBuffer(obj) {
    const stream = await downloadContentFromMessage(obj, "image");
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

async function uploadToCatbox(buffer) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", buffer, { filename: "image.jpg" });

    const res = await axios.post("https://catbox.moe/user/api.php", form, {
        headers: form.getHeaders(),
        timeout: 20000
    });
    return res.data.trim();
}

module.exports = {
    pattern: "hd",
    alias: ["enhance", "upscale", "remini", "4k"],
    type: "tools",
    async execute({ sock, msg, jid, reply }) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const img = quoted?.imageMessage || msg.message?.imageMessage;

        if (!img) {
            return reply("❌ *HD ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.hd` അല്ലെങ്കിൽ `.enhance` എന്ന് അയക്കുക!*");
        }

        const waitMsg = await sock.sendMessage(jid, { text: "✨ *Enhancing image to HD quality...*" }, { quoted: msg });

        try {
            const rawBuffer = await getBuffer(img);
            const imgUrl = await uploadToCatbox(rawBuffer);

            let hdBuffer = null;

            // API 1: Siputzx Upscale
            try {
                const res1 = await axios.get(`https://api.siputzx.my.id/api/iloveimg/upscale?image=${encodeURIComponent(imgUrl)}`, {
                    responseType: "arraybuffer",
                    timeout: 30000
                });
                if (res1.data && res1.data.byteLength > 5000) {
                    hdBuffer = Buffer.from(res1.data);
                }
            } catch {}

            // API 2: Fallback Remini API
            if (!hdBuffer) {
                try {
                    const res2 = await axios.get(`https://api.ryzendesu.vip/api/ai/remini?url=${encodeURIComponent(imgUrl)}`, {
                        responseType: "arraybuffer",
                        timeout: 30000
                    });
                    if (res2.data && res2.data.byteLength > 5000) {
                        hdBuffer = Buffer.from(res2.data);
                    }
                } catch {}
            }

            if (!hdBuffer) {
                return await sock.sendMessage(jid, {
                    text: "❌ *HD സെർവർ ഇപ്പോൾ തിരക്കിലാണ്, അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക!*",
                    edit: waitMsg.key
                });
            }

            await sock.sendMessage(jid, {
                image: hdBuffer,
                caption: "✨ *HD Enhanced by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*"
            }, { quoted: msg });

            await sock.sendMessage(jid, { delete: waitMsg.key });
        } catch (err) {
            console.error("HD Photo Error:", err.message);
            await sock.sendMessage(jid, {
                text: `❌ *HD Error:* ${err.message}`,
                edit: waitMsg.key
            });
        }
    }
};

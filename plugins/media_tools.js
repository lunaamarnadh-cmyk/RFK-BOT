const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

async function getBuffer(obj, type) {
    const stream = await downloadContentFromMessage(obj, type);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

module.exports = [
    // 1. .photo (Convert Sticker to Image)
    {
        pattern: "photo",
        alias: ["toimg"],
        type: "converter",
        async execute({ sock, msg, jid, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const stk = quoted?.stickerMessage;
            if (!stk) return reply("❌ *ഏതെങ്കിലും സ്റ്റിക്കറിന് റിപ്ലൈ ആയി `.photo` എന്ന് അയക്കുക!*");

            const id = Date.now();
            const inP = path.join("/tmp", `st_${id}.webp`);
            const outP = path.join("/tmp", `img_${id}.png`);
            try {
                fs.writeFileSync(inP, await getBuffer(stk, "sticker"));
                await new Promise((res, rej) => exec(`ffmpeg -y -i "${inP}" "${outP}"`, err => err ? rej(err) : res()));
                await sock.sendMessage(jid, { image: fs.readFileSync(outP), caption: "✅ *Converted by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) { reply(`❌ Error: ${e.message}`); }
            finally { if (fs.existsSync(inP)) fs.unlinkSync(inP); if (fs.existsSync(outP)) fs.unlinkSync(outP); }
        }
    },

    // 2. .circle (Make Round/Circle Sticker)
    {
        pattern: "circle",
        type: "converter",
        async execute({ sock, msg, jid, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const img = quoted?.imageMessage || msg.message?.imageMessage;
            if (!img) return reply("❌ *ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.circle` എന്ന് അയക്കുക!*");

            const id = Date.now();
            const inP = path.join("/tmp", `c_in_${id}.jpg`);
            const outP = path.join("/tmp", `c_out_${id}.webp`);
            try {
                fs.writeFileSync(inP, await getBuffer(img, "image"));
                const cmd = `ffmpeg -y -i "${inP}" -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba,geq=lum='p(X,Y)':a='if(gt(pow(X-256,2)+pow(Y-256,2),pow(256,2)),0,255)'" "${outP}"`;
                await new Promise((res, rej) => exec(cmd, err => err ? rej(err) : res()));
                await sock.sendMessage(jid, { sticker: fs.readFileSync(outP) }, { quoted: msg });
            } catch (e) { reply(`❌ Error: ${e.message}`); }
            finally { if (fs.existsSync(inP)) fs.unlinkSync(inP); if (fs.existsSync(outP)) fs.unlinkSync(outP); }
        }
    },

    // 3. .gif (Convert Video to GIF)
    {
        pattern: "gif",
        type: "converter",
        async execute({ sock, msg, jid, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const vid = quoted?.videoMessage || msg.message?.videoMessage;
            if (!vid) return reply("❌ *വീഡിയോയ്ക്ക് റിപ്ലൈ ആയി `.gif` എന്ന് അയക്കുക!*");

            const buf = await getBuffer(vid, "video");
            await sock.sendMessage(jid, { video: buf, gifPlayback: true, caption: "🎞️ *GIF by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
        }
    },

    // 4. .trim (Trim Audio/Video: .trim 00:00:05 00:00:20)
    {
        pattern: "trim",
        type: "converter",
        async execute({ sock, msg, jid, text, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const media = quoted?.audioMessage || quoted?.videoMessage;
            if (!media) return reply("❌ *ഓഡിയോയ്ക്കോ വീഡിയോയ്ക്കോ റിപ്ലൈ ആയി `.trim 00:00:00 00:00:15` എന്ന് അയക്കുക!*");

            const args = text.trim().split(/\s+/);
            if (args.length < 2) return reply("❌ ഉദാഹരണം: `.trim 00:00:05 00:00:20`");

            const isVid = Boolean(quoted?.videoMessage);
            const id = Date.now();
            const inP = path.join("/tmp", `tr_in_${id}.${isVid ? "mp4" : "mp3"}`);
            const outP = path.join("/tmp", `tr_out_${id}.${isVid ? "mp4" : "mp3"}`);

            try {
                fs.writeFileSync(inP, await getBuffer(media, isVid ? "video" : "audio"));
                await new Promise((res, rej) => exec(`ffmpeg -y -i "${inP}" -ss ${args[0]} -to ${args[1]} -c copy "${outP}"`, err => err ? rej(err) : res()));
                if (isVid) {
                    await sock.sendMessage(jid, { video: fs.readFileSync(outP) }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { audio: fs.readFileSync(outP), mimetype: "audio/mpeg" }, { quoted: msg });
                }
            } catch (e) { reply(`❌ Trim Error: ${e.message}`); }
            finally { if (fs.existsSync(inP)) fs.unlinkSync(inP); if (fs.existsSync(outP)) fs.unlinkSync(outP); }
        }
    },

    // 5. .dlt (Delete any message)
    {
        pattern: "dlt",
        alias: ["delete"],
        type: "whatsapp",
        async execute({ sock, msg, jid, reply, isOwner }) {
            if (!isOwner) return;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            if (!ctx?.stanzaId) return reply("❌ *ഡിലീറ്റ് ചെയ്യേണ്ട മെസ്സേജിന് റിപ്ലൈ ആയി `.dlt` എന്ന് അയക്കുക!*");

            await sock.sendMessage(jid, {
                delete: {
                    remoteJid: jid,
                    fromMe: ctx.participant === (sock.user.id.split(":")[0] + "@s.whatsapp.net"),
                    id: ctx.stanzaId,
                    participant: ctx.participant
                }
            });
        }
    }
];

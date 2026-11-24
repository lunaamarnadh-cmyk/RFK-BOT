const axios = require("axios");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

let antiViewOnceEnabled = false;

async function getBuffer(obj, type) {
    const stream = await downloadContentFromMessage(obj, type);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

module.exports = [
    // 1. Background Anti-ViewOnce Listener
    {
        on: "message",
        async execute({ sock, msg, jid }) {
            try {
                if (!antiViewOnceEnabled || !msg.message || msg.key.fromMe) return;

                const vo =
                    msg.message?.viewOnceMessage?.message ||
                    msg.message?.viewOnceMessageV2?.message ||
                    msg.message?.viewOnceMessageV2Extension?.message;

                if (!vo) return;

                const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                const sender = msg.key.participant || jid;

                if (vo.imageMessage) {
                    const buf = await getBuffer(vo.imageMessage, "image");
                    await sock.sendMessage(myJid, {
                        image: buf,
                        caption: `👁️ *ANTI-VIEWONCE IMAGE*\n👤 *From:* @${sender.split("@")[0]}\n${vo.imageMessage.caption || ""}`,
                        mentions: [sender]
                    });
                } else if (vo.videoMessage) {
                    const buf = await getBuffer(vo.videoMessage, "video");
                    await sock.sendMessage(myJid, {
                        video: buf,
                        caption: `👁️ *ANTI-VIEWONCE VIDEO*\n👤 *From:* @${sender.split("@")[0]}\n${vo.videoMessage.caption || ""}`,
                        mentions: [sender]
                    });
                }
            } catch (e) {
                console.error("Anti-ViewOnce error:", e.message);
            }
        }
    },

    // 2. .antiviewones on/off
    {
        pattern: "antiviewones",
        alias: ["antivo", "antiviewonce"],
        type: "manage",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            if (text.toLowerCase() === "on") {
                antiViewOnceEnabled = true;
                return reply("✅ *Anti-ViewOnce ON ആക്കി!* (View Once ഫോട്ടോ/വീഡിയോ നിങ്ങളുടെ ചാറ്റിലേക്ക് വരും)");
            }
            if (text.toLowerCase() === "off") {
                antiViewOnceEnabled = false;
                return reply("❌ *Anti-ViewOnce OFF ആക്കി!*");
            }
            reply(`നിലവിൽ Anti-ViewOnce: *${antiViewOnceEnabled ? "ON" : "OFF"}*\nമാറ്റാൻ: \`.antiviewones on\` അല്ലെങ്കിൽ \`.antiviewones off\``);
        }
    },

    // 3. .spotify (Download Spotify Song by Link or Name)
    {
        pattern: "spotify",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ *Spotify ലിങ്കോ പാട്ടിന്റെ പേരോ നൽകുക!*");
            await reply("🎧 *Fetching from Spotify...*");
            try {
                let trackUrl = text.trim();
                if (!trackUrl.includes("open.spotify.com")) {
                    const sRes = await axios.get(`https://api.siputzx.my.id/api/s/spotify?query=${encodeURIComponent(trackUrl)}`);
                    trackUrl = sRes.data?.data?.[0]?.external_urls?.spotify || sRes.data?.data?.[0]?.url;
                    if (!trackUrl) return reply("❌ Spotify-ൽ പാട്ട് കണ്ടെത്താനായില്ല!");
                }

                const { data } = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(trackUrl)}`);
                const dlUrl = data?.data?.download || data?.data?.url;
                const title = data?.data?.title || "Spotify_Track";

                if (!dlUrl) return reply("❌ ഡൗൺലോഡ് ലിങ്ക് ലഭിച്ചില്ല!");

                await sock.sendMessage(jid, {
                    audio: { url: dlUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${title}.mp3`
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *Spotify Error:* ${e.message}`);
            }
        }
    },

    // 4. .enhance (HD Image Upscaler)
    {
        pattern: "enhance",
        alias: ["hd", "remini"],
        type: "tools",
        async execute({ sock, msg, jid, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const img = quoted?.imageMessage || msg.message?.imageMessage;
            if (!img) return reply("❌ *HD ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.enhance` എന്ന് അയക്കുക!*");

            await reply("✨ *Enhancing photo to HD...*");
            try {
                const buf = await getBuffer(img, "image");
                const form = new FormData();
                form.append("reqtype", "fileupload");
                form.append("fileToUpload", buf, { filename: "photo.jpg" });

                const uploadRes = await axios.post("https://catbox.moe/user/api.php", form, {
                    headers: form.getHeaders()
                });
                const imgUrl = uploadRes.data.trim();

                const { data } = await axios.get(`https://api.siputzx.my.id/api/iloveimg/upscale?image=${encodeURIComponent(imgUrl)}`, {
                    responseType: "arraybuffer"
                });

                await sock.sendMessage(jid, {
                    image: Buffer.from(data),
                    caption: "✨ *Enhanced to HD by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*"
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *Enhance Error:* ${e.message}`);
            }
        }
    },

    // 5. .find (Identify Song from Audio/Video Clip)
    {
        pattern: "find",
        alias: ["shazam", "whatsong"],
        type: "search",
        async execute({ msg, reply }) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const media = quoted?.audioMessage || quoted?.videoMessage;
            if (!media) return reply("❌ *ഏതെങ്കിലും ഓഡിയോയ്ക്കോ വീഡിയോയ്ക്കോ റിപ്ലൈ ആയി `.find` എന്ന് അയക്കുക!*");

            await reply("🎵 *Identifying song...*");
            try {
                const isVid = Boolean(quoted?.videoMessage);
                const buf = await getBuffer(media, isVid ? "video" : "audio");

                const form = new FormData();
                form.append("reqtype", "fileupload");
                form.append("fileToUpload", buf, { filename: isVid ? "clip.mp4" : "clip.mp3" });

                const up = await axios.post("https://catbox.moe/user/api.php", form, { headers: form.getHeaders() });
                const mediaUrl = up.data.trim();

                const { data } = await axios.get(`https://api.siputzx.my.id/api/tools/shazam?url=${encodeURIComponent(mediaUrl)}`);
                const res = data?.data;
                if (!res || !res.title) return reply("❌ ഈ പാട്ട് തിരിച്ചറിയാൻ കഴിഞ്ഞില്ല!");

                reply(`🎶 *SONG FOUND!*\n\n🎵 *Title:* ${res.title}\n🎤 *Artist:* ${res.artist || "Unknown"}\n💿 *Album:* ${res.album || "Unknown"}`);
            } catch (e) {
                reply(`❌ *Find Error:* ${e.message}`);
            }
        }
    }
];
      

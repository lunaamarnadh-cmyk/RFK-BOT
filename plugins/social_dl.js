const axios = require("axios");

module.exports = [
    // 1. .song / .play / .yta (YouTube Audio Downloader)
    {
        pattern: "song",
        alias: ["play", "yta"],
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ *പാട്ടിന്റെ പേരോ YouTube ലിങ്കോ നൽകുക!* (ഉദാ: `.song Sakhavinte Sakhiyakanam`)");
            await reply(`🔍 *Searching:* _${text}_ ...`);

            try {
                let videoUrl = text.trim();
                let title = text.trim();

                if (!videoUrl.includes("youtu.be") && !videoUrl.includes("youtube.com")) {
                    const sRes = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(text)}`);
                    const first = sRes.data?.data?.[0];
                    if (!first) return reply("❌ പാട്ട് കണ്ടെത്താനായില്ല!");
                    videoUrl = first.url;
                    title = first.title || text;
                }

                const { data } = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`);
                const dlUrl = data?.data?.dl || data?.result?.download_url;
                if (!dlUrl) return reply("❌ ഓഡിയോ ഡൗൺലോഡ് ലിങ്ക് ലഭിച്ചില്ല!");

                await sock.sendMessage(jid, {
                    audio: { url: dlUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${title}.mp3`
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *Song Error:* ${e.message}`);
            }
        }
    },

    // 2. .ytv (YouTube Video Downloader)
    {
        pattern: "ytv",
        alias: ["ytmp4"],
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ *YouTube വീഡിയോ ലിങ്കോ പേരോ നൽകുക!*");
            await reply("⏳ *Downloading YouTube video...*");

            try {
                let videoUrl = text.trim();
                if (!videoUrl.includes("youtu.be") && !videoUrl.includes("youtube.com")) {
                    const sRes = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(text)}`);
                    const first = sRes.data?.data?.[0];
                    if (!first) return reply("❌ വീഡിയോ കണ്ടെത്താനായില്ല!");
                    videoUrl = first.url;
                }

                const { data } = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(videoUrl)}`);
                const dlUrl = data?.data?.dl || data?.result?.download_url;
                const title = data?.data?.title || "YouTube Video";
                if (!dlUrl) return reply("❌ വീഡിയോ ലിങ്ക് ലഭിച്ചില്ല!");

                await sock.sendMessage(jid, {
                    video: { url: dlUrl },
                    caption: `🎬 *${title}*\n\n_Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂_`
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *YTV Error:* ${e.message}`);
            }
        }
    },

    // 3. .insta (Instagram Reels/Video Downloader)
    {
        pattern: "insta",
        alias: ["ig", "reel"],
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("instagram.com")) {
                return reply("❌ *ശരിയായ Instagram ലിങ്ക് നൽകുക!*");
            }
            await reply("⏳ *Downloading Instagram media...*");
            try {
                const { data } = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(text.trim())}`);
                const mediaUrl = data?.data?.[0]?.url;
                if (!mediaUrl) return reply("❌ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാനായില്ല!");

                await sock.sendMessage(jid, {
                    video: { url: mediaUrl },
                    caption: "✅ *Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*"
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *Insta Error:* ${e.message}`);
            }
        }
    },

    // 4. .fb (Facebook Video Downloader)
    {
        pattern: "fb",
        alias: ["facebook"],
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || (!text.includes("facebook.com") && !text.includes("fb.watch"))) {
                return reply("❌ *ശരിയായ Facebook വീഡിയോ ലിങ്ക് നൽകുക!*");
            }
            await reply("⏳ *Downloading Facebook video...*");
            try {
                const { data } = await axios.get(`https://api.siputzx.my.id/api/d/fbdl?url=${encodeURIComponent(text.trim())}`);
                const vidUrl = data?.data?.hd || data?.data?.sd || data?.data?.[0]?.url;
                if (!vidUrl) return reply("❌ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാനായില്ല!");

                await sock.sendMessage(jid, {
                    video: { url: vidUrl },
                    caption: "✅ *Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*"
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *FB Error:* ${e.message}`);
            }
        }
    },

    // 5. .pinterest (Pinterest Image Search)
    {
        pattern: "pinterest",
        alias: ["pin"],
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ *സെർച്ച് ചെയ്യേണ്ട പേര് നൽകുക!* (ഉദാ: `.pin dark neon wallpaper`)");
            try {
                const { data } = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
                const imgs = data?.data;
                if (!imgs || imgs.length === 0) return reply("❌ ചിത്രങ്ങൾ കണ്ടെത്താനായില്ല!");

                const randomImg = imgs[Math.floor(Math.random() * Math.min(imgs.length, 10))];
                const imgUrl = randomImg?.images_url || randomImg?.image || randomImg;
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `📌 *Pinterest:* ${text}`
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ *Pinterest Error:* ${e.message}`);
            }
        }
    }
];

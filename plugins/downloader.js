const axios = require("axios");

module.exports = [
    // Instagram Reels & Post Downloader
    {
        pattern: "insta",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("instagram.com")) return reply("❌ ദയവായി ഒരു Instagram ലിങ്ക് നൽകുക!");
            await reply("⏳ *Downloading Instagram Media...*");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(text.trim())}`);
                const media = res.data?.data?.[0];
                if (!media || !media.url) return reply("❌ വീഡിയോ കണ്ടെത്താനായില്ല!");
                await sock.sendMessage(jid, { video: { url: media.url }, caption: "📥 *Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // TikTok Downloader (No Watermark)
    {
        pattern: "tiktok",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("tiktok.com")) return reply("❌ ദയവായി ഒരു TikTok ലിങ്ക് നൽകുക!");
            await reply("⏳ *Downloading TikTok Video...*");
            try {
                const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(text.trim())}`);
                const videoUrl = res.data?.data?.play;
                if (!videoUrl) return reply("❌ വീഡിയോ ലഭ്യമല്ല!");
                await sock.sendMessage(jid, { video: { url: videoUrl }, caption: `📥 *${res.data.data.title || "TikTok Video"}*\n_乂𝐑𝐅𝐊 𝐁𝐎𝐓乂_` }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // Facebook Video Downloader
    {
        pattern: "fb",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("http")) return reply("❌ ദയവായി ഒരു Facebook ലിങ്ക് നൽകുക!");
            await reply("⏳ *Downloading Facebook Video...*");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(text.trim())}`);
                const hd = res.data?.data?.hd || res.data?.data?.sd;
                if (!hd) return reply("❌ വീഡിയോ ലഭ്യമല്ല!");
                await sock.sendMessage(jid, { video: { url: hd }, caption: "📥 *Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // YouTube Song / Audio (.play / .yta)
    {
        pattern: "play",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ പാട്ടിന്റെ പേര് നൽകുക! (ഉദാ: `.play Sakhavinte Sakhiyakanam`)");
            await reply(`🔎 *Searching:* _${text}_...`);
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(text)}`);
                const first = res.data?.data?.[0];
                if (!first) return reply("❌ പാട്ട് കണ്ടെത്താനായില്ല!");
                const dl = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(first.url)}`);
                const audioUrl = dl.data?.data?.dl;
                if (!audioUrl) return reply("❌ ഓഡിയോ ഡൗൺലോഡ് ചെയ്യാനായില്ല!");
                await sock.sendMessage(jid, {
                    audio: { url: audioUrl },
                    mimetype: "audio/mp4",
                    fileName: `${first.title}.mp3`
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // YouTube Video (.video)
    {
        pattern: "video",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ വീഡിയോയുടെ പേരോ ലിങ്കോ നൽകുക!");
            await reply(`⏳ *Fetching Video:* _${text}_...`);
            try {
                let targetUrl = text.trim();
                if (!targetUrl.startsWith("http")) {
                    const search = await axios.get(`https://api.siputzx.my.id/api/s/youtube?query=${encodeURIComponent(text)}`);
                    targetUrl = search.data?.data?.[0]?.url;
                }
                if (!targetUrl) return reply("❌ വീഡിയോ കണ്ടെത്താനായില്ല!");
                const dl = await axios.get(`https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(targetUrl)}`);
                const videoUrl = dl.data?.data?.dl;
                if (!videoUrl) return reply("❌ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാനായില്ല!");
                await sock.sendMessage(jid, { video: { url: videoUrl }, caption: "📥 *Downloaded by 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // Pinterest Image / Video Downloader
    {
        pattern: "pinterest",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ Pinterest ലിങ്കോ സെർച്ച് വാക്കോ നൽകുക!");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}`);
                const img = res.data?.data?.[0]?.images_url;
                if (!img) return reply("❌ ചിത്രം കണ്ടെത്താനായില്ല!");
                await sock.sendMessage(jid, { image: { url: img }, caption: "📥 *Pinterest - 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // MediaFire Downloader
    {
        pattern: "mediafire",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("mediafire.com")) return reply("❌ MediaFire ലിങ്ക് നൽകുക!");
            await reply("⏳ *Fetching MediaFire File...*");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/mediafire?url=${encodeURIComponent(text.trim())}`);
                const file = res.data?.data;
                if (!file || !file.downloadLink) return reply("❌ ഫയൽ ലഭ്യമല്ല!");
                await sock.sendMessage(jid, {
                    document: { url: file.downloadLink },
                    fileName: file.fileName || "RFK_File",
                    mimetype: "application/octet-stream"
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // GitHub Repo Zip Downloader (.gitdl)
    {
        pattern: "gitdl",
        type: "download",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text || !text.includes("github.com")) return reply("❌ GitHub Repository ലിങ്ക് നൽകുക!");
            try {
                const cleanUrl = text.trim().replace(/\/$/, "").replace(/\.git$/, "");
                const zipUrl = `${cleanUrl}/archive/refs/heads/main.zip`;
                const repoName = cleanUrl.split("/").pop();
                await sock.sendMessage(jid, {
                    document: { url: zipUrl },
                    fileName: `${repoName}.zip`,
                    mimetype: "application/zip"
                }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    }
];
                  

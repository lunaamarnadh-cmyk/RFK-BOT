
const axios = require("axios");

// Instagram Direct Embed / GraphQL Scraper (Works on Cloud Servers without API blocks)
async function scrapeInstagramDirect(url) {
    try {
        const cleanUrl = url.split("?")[0].replace(/\/$/, "");
        const match = cleanUrl.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) return null;
        const shortcode = match[2];

        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const { data: html } = await axios.get(embedUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            },
            timeout: 15000
        });

        const videoMatch = html.match(/"video_url":"([^"]+)"/);
        if (videoMatch && videoMatch[1]) {
            return videoMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
        }

        const displayMatch = html.match(/"display_url":"([^"]+)"/);
        if (displayMatch && displayMatch[1]) {
            return displayMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
        }
    } catch {
        return null;
    }
    return null;
}

async function fetchMedia(url, platform) {
    if (platform === "insta") {
        // Method 1: Direct Instagram Embed Scraper
        const directUrl = await scrapeInstagramDirect(url);
        if (directUrl) return directUrl;

        // Method 2: Backup APIs
        const instaApis = [
            async () => {
                const res = await axios.get(`https://api.vreden.my.id/api/igdownload?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.result?.data || res.data?.result;
                if (Array.isArray(data) && data.length > 0) return data[0].url || data[0].download_link;
                return null;
            },
            async () => {
                const res = await axios.get(`https://api.davidcyriltech.my.id/instagram?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                return res.data?.downloadUrl || res.data?.result?.[0]?.url || null;
            },
            async () => {
                const res = await axios.get(`https://bk9.fun/download/instagram?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.BK9;
                if (Array.isArray(data) && data.length > 0) return data[0].url;
                return null;
            }
        ];

        for (const api of instaApis) {
            try {
                const videoUrl = await api();
                if (videoUrl) return videoUrl;
            } catch {
                continue;
            }
        }
        throw new Error("വീഡിയോ ലിങ്ക് ലഭ്യമല്ല. അക്കൗണ്ട് Private അല്ലെന്ന് ഉറപ്പുവരുത്തുക.");
    } else {
        // Facebook APIs
        const fbApis = [
            async () => {
                const res = await axios.get(`https://api.davidcyriltech.my.id/facebook?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                return res.data?.video?.hd || res.data?.video?.sd || res.data?.result?.hd || null;
            },
            async () => {
                const res = await axios.get(`https://bk9.fun/download/fb?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                return res.data?.BK9?.hd || res.data?.BK9?.sd || null;
            },
            async () => {
                const res = await axios.get(`https://api.vreden.my.id/api/fbdl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                return res.data?.result?.hd || res.data?.result?.sd || null;
            }
        ];

        for (const api of fbApis) {
            try {
                const videoUrl = await api();
                if (videoUrl) return videoUrl;
            } catch {
                continue;
            }
        }
        throw new Error("Facebook വീഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല, ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പുവരുത്തുക.");
    }
}

module.exports = [
    {
        pattern: "insta",
        alias: ["ig", "instagram", "reels"],
        type: "downloader",
        async execute({ sock, msg, jid, text, reply }) {
            const url = text?.trim();
            if (!url || !url.includes("instagram.com")) {
                return reply("❌ *ദയവായി ഒരു ശരിയായ Instagram ലിങ്ക് നൽകുക!*\nഉദാഹരണം: `.insta https://www.instagram.com/reel/...`");
            }

            try {
                await reply("⏳ *Instagram വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*");
                const mediaUrl = await fetchMedia(url, "insta");

                const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl);
                if (isImage) {
                    await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                }
            } catch (err) {
                console.error("Insta Error:", err.message);
                await reply(`❌ *Insta Error:* ${err.message}`);
            }
        }
    },
    {
        pattern: "fb",
        alias: ["facebook", "fbdl"],
        type: "downloader",
        async execute({ sock, msg, jid, text, reply }) {
            const url = text?.trim();
            if (!url || (!url.includes("facebook.com") && !url.includes("fb.watch"))) {
                return reply("❌ *ദയവായി ഒരു ശരിയായ Facebook വീഡിയോ ലിങ്ക് നൽകുക!*\nഉദാഹരണം: `.fb https://www.facebook.com/...`");
            }

            try {
                await reply("⏳ *Facebook വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*");
                const mediaUrl = await fetchMedia(url, "fb");

                await sock.sendMessage(
                    jid,
                    {
                        video: { url: mediaUrl },
                        caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*"
                    },
                    { quoted: msg }
                );
            } catch (err) {
                console.error("FB Error:", err.message);
                await reply(`❌ *FB Error:* ${err.message}`);
            }
        }
    }
];

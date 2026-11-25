
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

async function resolveInstaUrl(url) {
    if (url.includes("/share/")) {
        try {
            const res = await axios.get(url, {
                headers: { "User-Agent": "Mozilla/5.0" },
                maxRedirects: 5,
                timeout: 15000
            });
            return res.request?.res?.responseUrl || url;
        } catch (e) {
            return e.request?.res?.responseUrl || url;
        }
    }
    return url;
}

// Exact Jarvis-MD Instagram Downloader Logic (igexport.com)
async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    const isReel = /\/(reel|reels|tv)\//i.test(url);
    const endpoints = isReel
        ? [
              `https://igexport.com/api/ig-reels/?url=${encodeURIComponent(url)}`,
              `https://igexport.com/api/ig-downloader/?url=${encodeURIComponent(url)}`
          ]
        : [
              `https://igexport.com/api/ig-downloader/?url=${encodeURIComponent(url)}`,
              `https://igexport.com/api/ig-reels/?url=${encodeURIComponent(url)}`
          ];

    for (const apiUrl of endpoints) {
        try {
            const { data } = await axios.get(apiUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Referer": "https://igexport.com/id/video-download/"
                },
                timeout: 20000
            });

            const results = [];

            // Format 1: data.items array (Carousel / Multiple posts / Reels)
            if (Array.isArray(data?.data?.items) && data.data.items.length > 0) {
                for (const item of data.data.items) {
                    const mediaUrl = item?.videoUrl || item?.url || item?.imageUrl;
                    if (mediaUrl) {
                        const isImg = !item?.videoUrl && (item?.type === "image" || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl));
                        results.push({ type: isImg ? "image" : "video", url: mediaUrl });
                    }
                }
            }
            // Format 2: Single data.videoUrl
            else if (data?.data?.videoUrl) {
                results.push({ type: "video", url: data.data.videoUrl });
            }
            // Format 3: Single data.imageUrl
            else if (data?.data?.imageUrl) {
                results.push({ type: "image", url: data.data.imageUrl });
            }

            if (results.length > 0) {
                const downloaded = [];
                for (const item of results) {
                    const buffer = await fetchBuffer(item.url);
                    downloaded.push({ type: item.type, buffer });
                }
                return downloaded;
            }
        } catch {}
    }

    throw new Error("Instagram API-യിൽ നിന്ന് മീഡിയ ലഭിച്ചില്ല (ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പാക്കുക).");
}

async function getFbMedia(url) {
    const res = await axios.get(url, {
        headers: {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Site": "none"
        },
        timeout: 15000
    });
    const html = res.data || "";
    const hd = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
    const sd = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);
    const raw = hd?.[1] || sd?.[1];
    if (raw) return raw.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\/g, "");
    throw new Error("Facebook വീഡിയോ ലിങ്ക് ലഭിച്ചില്ല.");
}

module.exports = [
    {
        pattern: "insta",
        alias: ["ig", "instagram", "reels", "reel"],
        type: "downloader",
        async execute({ sock, msg, jid, text, reply }) {
            const url = text?.trim();
            if (!url || !url.includes("instagram.com")) {
                return reply("❌ *ദയവായി ഒരു ശരിയായ Instagram ലിങ്ക് നൽകുക!*\nഉദാഹരണം: `.insta https://www.instagram.com/reel/...`");
            }
            try {
                await reply("⏳ *Instagram മീഡിയ ഡൗൺലോഡ് ചെയ്യുന്നു...*");
                const items = await getInstaMedia(url);

                for (const media of items) {
                    if (media.type === "image") {
                        await sock.sendMessage(jid, { image: media.buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                    } else {
                        await sock.sendMessage(jid, { video: media.buffer, mimetype: "video/mp4", caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                    }
                }
            } catch (err) {
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
                const mediaUrl = await getFbMedia(url);
                const buffer = await fetchBuffer(mediaUrl);
                await sock.sendMessage(jid, { video: buffer, mimetype: "video/mp4", caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
            } catch (err) {
                await reply(`❌ *FB Error:* ${err.message}`);
            }
        }
    }
];

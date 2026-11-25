
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

async function resolveInstaUrl(url) {
    if (url.includes("/share/")) {
        try {
            const res = await axios.get(url, {
                headers: { "User-Agent": UA },
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

// 1. IronMan API (Used by Jarvis-MD)
async function tryIronManApi(url) {
    const endpoints = [
        `https://ironman.koyeb.app/ironman/dl/ig?url=${encodeURIComponent(url)}`,
        `https://ironman.koyeb.app/ironman/ig/dl?url=${encodeURIComponent(url)}`,
        `https://ironman.koyeb.app/ironman/dl/insta?url=${encodeURIComponent(url)}`
    ];
    for (const ep of endpoints) {
        try {
            const { data } = await axios.get(ep, { headers: { "User-Agent": UA }, timeout: 15000 });
            const items = data?.result || data?.media || data?.data || (Array.isArray(data) ? data : null);
            if (Array.isArray(items) && items.length > 0) {
                const mediaUrl = items[0]?.url || items[0]?.download_url || items[0];
                if (typeof mediaUrl === "string" && mediaUrl.startsWith("http")) {
                    const isImg = items[0]?.type === "image" || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl);
                    return { type: isImg ? "image" : "video", url: mediaUrl };
                }
            }
            const single = data?.url || data?.videoUrl || data?.download;
            if (typeof single === "string" && single.startsWith("http")) {
                return { type: "video", url: single };
            }
        } catch {}
    }
    return null;
}

// 2. SaveIG / RapidCDN Scraper API
async function trySaveIgApi(url) {
    try {
        const res = await axios.post(
            "https://saveig.app/api/ajaxSearch",
            new URLSearchParams({ q: url, t: "media", lang: "en" }).toString(),
            {
                headers: {
                    "User-Agent": UA,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Origin": "https://saveig.app",
                    "Referer": "https://saveig.app/en",
                    "X-Requested-With": "XMLHttpRequest"
                },
                timeout: 15000
            }
        );
        const html = res.data?.data || "";
        const vidMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download Video"/i) ||
                         html.match(/href="(https:\/\/d\.rapidcdn\.app[^"]+)"/i);
        if (vidMatch?.[1]) {
            return { type: "video", url: vidMatch[1].replace(/&amp;/g, "&") };
        }
        const imgMatch = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download Image"/i);
        if (imgMatch?.[1]) {
            return { type: "image", url: imgMatch[1].replace(/&amp;/g, "&") };
        }
    } catch {}
    return null;
}

// 3. SnapSave / V3 API
async function trySnapSaveApi(url) {
    try {
        const res = await axios.post(
            "https://v3.saveig.app/api/ajaxSearch",
            new URLSearchParams({ q: url, t: "media", lang: "en" }).toString(),
            {
                headers: {
                    "User-Agent": UA,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Origin": "https://saveig.app",
                    "Referer": "https://saveig.app/en"
                },
                timeout: 15000
            }
        );
        const html = res.data?.data || "";
        const match = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download Video"/i);
        if (match?.[1]) {
            return { type: "video", url: match[1].replace(/&amp;/g, "&") };
        }
    } catch {}
    return null;
}

// 4. Gifted / Siputzx / NexOracle Public Bot APIs
async function tryPublicBotApis(url) {
    const apis = [
        `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`,
        `https://api.giftedtech.web.id/api/download/instadl?apikey=gifted&url=${encodeURIComponent(url)}`
    ];
    for (const apiUrl of apis) {
        try {
            const { data } = await axios.get(apiUrl, { headers: { "User-Agent": UA }, timeout: 15000 });
            const list = data?.data || data?.result;
            if (Array.isArray(list) && list.length > 0) {
                const u = list[0]?.url || list[0]?.download_url;
                if (u) return { type: "video", url: u };
            } else if (list?.url || list?.download_url) {
                return { type: "video", url: list.url || list.download_url };
            }
        } catch {}
    }
    return null;
}

async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    const result =
        (await tryIronManApi(url)) ||
        (await trySaveIgApi(url)) ||
        (await trySnapSaveApi(url)) ||
        (await tryPublicBotApis(url));

    if (!result || !result.url) {
        throw new Error("വീഡിയോ ലഭിച്ചില്ല. ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പാക്കുക.");
    }

    const buffer = await fetchBuffer(result.url);
    return { type: result.type, buffer };
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
                await reply("⏳ *Instagram വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*");
                const media = await getInstaMedia(url);

                if (media.type === "image") {
                    await sock.sendMessage(jid, { image: media.buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { video: media.buffer, mimetype: "video/mp4", caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
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

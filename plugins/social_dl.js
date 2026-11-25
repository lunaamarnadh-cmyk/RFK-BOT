
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

// 1. SaveIG with dynamic k_token extraction (Returns full MP4 with Audio)
async function trySaveIgWithToken(url) {
    try {
        const home = await axios.get("https://saveig.app/en", {
            headers: { "User-Agent": UA },
            timeout: 10000
        });
        const htmlHome = home.data || "";
        const kExp = htmlHome.match(/k_exp\s*=\s*"([^"]+)"/)?.[1] || "";
        const kToken = htmlHome.match(/k_token\s*=\s*"([^"]+)"/)?.[1] || "";

        const payload = new URLSearchParams({
            q: url,
            t: "media",
            lang: "en",
            ...(kExp && { k_exp: kExp }),
            ...(kToken && { k_token: kToken })
        }).toString();

        const res = await axios.post("https://v3.saveig.app/api/ajaxSearch", payload, {
            headers: {
                "User-Agent": UA,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": "https://saveig.app",
                "Referer": "https://saveig.app/en",
                "X-Requested-With": "XMLHttpRequest"
            },
            timeout: 15000
        });

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

// 2. Working WhatsApp Bot REST APIs (BK9, Ryzendesu, Vreden, DavidCyril, IronMan)
async function tryBotRestApis(url) {
    const encoded = encodeURIComponent(url);
    const apis = [
        `https://bk9.fun/download/instagram?url=${encoded}`,
        `https://api.ryzendesu.vip/api/downloader/igdl?url=${encoded}`,
        `https://api.vreden.my.id/api/igdownload?url=${encoded}`,
        `https://apis.davidcyriltech.my.id/instagram?url=${encoded}`,
        `https://ironman.koyeb.app/ironman/dl/ig?url=${encoded}`
    ];

    for (const apiUrl of apis) {
        try {
            const { data } = await axios.get(apiUrl, {
                headers: { "User-Agent": UA },
                timeout: 15000
            });

            // Handle various response structures
            const candidates = [
                data?.BK9,
                data?.result?.data,
                data?.result,
                data?.data,
                data?.media,
                Array.isArray(data) ? data : null
            ].filter(Boolean);

            for (const item of candidates) {
                if (Array.isArray(item) && item.length > 0) {
                    const first = item[0];
                    const mediaUrl = first?.url || first?.download_url || first?.video || first?.link || (typeof first === "string" ? first : null);
                    if (mediaUrl && mediaUrl.startsWith("http")) {
                        const isImg = first?.type === "image" || /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl);
                        return { type: isImg ? "image" : "video", url: mediaUrl };
                    }
                } else if (typeof item === "object") {
                    const mediaUrl = item?.url || item?.download_url || item?.video || item?.videoUrl || item?.link;
                    if (mediaUrl && mediaUrl.startsWith("http")) {
                        return { type: "video", url: mediaUrl };
                    }
                }
            }
        } catch {}
    }
    return null;
}

async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    const result = (await tryBotRestApis(url)) || (await trySaveIgWithToken(url));

    if (!result || !result.url) {
        throw new Error("API-കളിൽ നിന്ന് വീഡിയോ ലഭിച്ചില്ല. അൽപസമയത്തിന് ശേഷം വീണ്ടും ശ്രമിക്കുക.");
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

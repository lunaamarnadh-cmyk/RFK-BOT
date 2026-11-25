
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

// Extract Instagram Shortcode from any link (/reel/, /reels/, /p/, /tv/)
function extractShortcode(url) {
    const clean = url.split("?")[0].replace(/\/$/, "");
    const match = clean.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
}

// Convert Instagram Shortcode to Media ID
function shortcodeToMediaId(shortcode) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mediaId = BigInt(0);
    for (let i = 0; i < shortcode.length; i++) {
        mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(shortcode[i]));
    }
    return mediaId.toString();
}

// 1. Official Instagram Private/Web API using IG_COOKIE (100% Working on Render/Railway)
async function fetchInstaWithCookie(url) {
    const shortcode = extractShortcode(url);
    if (!shortcode) throw new Error("ലിങ്ക് ശരിയല്ല.");

    const cookie = process.env.IG_COOKIE || "";
    const mediaId = shortcodeToMediaId(shortcode);

    // Endpoint 1: Instagram Mobile Info API
    try {
        const res = await axios.get(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: {
                "User-Agent": "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)",
                "X-IG-App-ID": "936619743392459",
                "Cookie": cookie
            },
            timeout: 15000
        });

        const item = res.data?.items?.[0];
        if (item) {
            if (item.video_versions?.length > 0) return item.video_versions[0].url;
            if (item.carousel_media?.[0]?.video_versions?.length > 0) return item.carousel_media[0].video_versions[0].url;
            if (item.carousel_media?.[0]?.image_versions2?.candidates?.length > 0) return item.carousel_media[0].image_versions2.candidates[0].url;
            if (item.image_versions2?.candidates?.length > 0) return item.image_versions2.candidates[0].url;
        }
    } catch {}

    // Endpoint 2: GraphQL Web Info API
    const res2 = await axios.get(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
        headers: {
            "User-Agent": UA,
            "X-IG-App-ID": "936619743392459",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": `https://www.instagram.com/reel/${shortcode}/`,
            "Cookie": cookie
        },
        timeout: 15000
    });

    const item2 = res2.data?.items?.[0];
    if (item2) {
        if (item2.video_versions?.length > 0) return item2.video_versions[0].url;
        if (item2.image_versions2?.candidates?.length > 0) return item2.image_versions2.candidates[0].url;
    }

    throw new Error("IG_COOKIE സെറ്റ് ചെയ്യാത്തതുകൊണ്ടോ കാലാവധി കഴിഞ്ഞതുകൊണ്ടോ ആണ് Instagram ബ്ലോക്ക് ചെയ്യുന്നത്.");
}

// 2. Facebook Direct HTML Meta / Graph Scraper (No external API needed)
async function fetchFbDirect(url) {
    const res = await axios.get(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Fetch-Site": "none"
        },
        timeout: 15000
    });

    const html = res.data || "";
    const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/hd_src:"([^"]+)"/);
    const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/sd_src:"([^"]+)"/);

    const rawUrl = (hdMatch && hdMatch[1]) || (sdMatch && sdMatch[1]);
    if (rawUrl) {
        return rawUrl.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\/g, "");
    }
    throw new Error("Facebook വീഡിയോ ലിങ്ക് ലഭിച്ചില്ല. വീഡിയോ പബ്ലിക് ആണെന്ന് ഉറപ്പുവരുത്തുക.");
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
                const mediaUrl = await fetchInstaWithCookie(url);
                const buffer = await fetchBuffer(mediaUrl);

                const isImage = /\.(jpg|jpeg|png|webp)(\?|$)/i.test(mediaUrl);
                if (isImage) {
                    await sock.sendMessage(jid, { image: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { video: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
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
                const mediaUrl = await fetchFbDirect(url);
                const buffer = await fetchBuffer(mediaUrl);

                await sock.sendMessage(
                    jid,
                    {
                        video: buffer,
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

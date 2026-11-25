
const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Helper to download media as Buffer so WhatsApp/Baileys never fails with 403
async function downloadBuffer(mediaUrl) {
    const res = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: {
            "User-Agent": UA,
            "Accept": "*/*",
            "Referer": "https://www.instagram.com/"
        },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

// 1. Instagram Multi-Method Downloader
async function getInstaMedia(url) {
    const cleanUrl = url.split("?")[0].trim();

    const methods = [
        // Method 1: GiftedTech API
        async () => {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/instadl?apikey=gifted&url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            if (Array.isArray(r) && r[0]?.download_url) return r[0].download_url;
            if (r?.download_url) return r.download_url;
            return null;
        },
        // Method 2: Dark-Yasiya API
        async () => {
            const res = await axios.get(`https://www.dark-yasiya-api.site/download/ig?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const data = res.data?.result?.data;
            if (Array.isArray(data) && data[0]?.url) return data[0].url;
            return null;
        },
        // Method 3: NexOracle API
        async () => {
            const res = await axios.get(`https://api.nexoracle.com/downloader/insta?apikey=free_key@maher_apis&url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            if (Array.isArray(r) && r[0]?.url) return r[0].url;
            if (r?.url) return r.url;
            return null;
        },
        // Method 4: SaveIG / V3 HTML Form Scraper
        async () => {
            const form = new URLSearchParams();
            form.append("q", cleanUrl);
            form.append("t", "media");
            form.append("lang", "en");

            const res = await axios.post("https://v3.saveig.app/api/ajaxSearch", form.toString(), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "User-Agent": UA,
                    "Origin": "https://saveig.app",
                    "Referer": "https://saveig.app/"
                },
                timeout: 15000
            });

            const html = res.data?.data || "";
            const match = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download Video"/i) ||
                          html.match(/href="(https:\/\/d\.rapidcdn\.app[^"]+)"/i) ||
                          html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i);
            return match ? match[1].replace(/&amp;/g, "&") : null;
        },
        // Method 5: FastDL / SnapInsta Form Scraper
        async () => {
            const form = new URLSearchParams();
            form.append("url", cleanUrl);
            form.append("action", "post");

            const res = await axios.post("https://indown.io/download", form.toString(), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "User-Agent": UA,
                    "Referer": "https://indown.io/"
                },
                timeout: 15000
            });

            const html = res.data || "";
            const match = html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i);
            return match ? match[1].replace(/&amp;/g, "&") : null;
        }
    ];

    let lastErr = "No response";
    for (let i = 0; i < methods.length; i++) {
        try {
            const link = await methods[i]();
            if (link && link.startsWith("http")) {
                console.log(`[Insta] Success via Method ${i + 1}`);
                return link;
            }
        } catch (e) {
            lastErr = e.message;
        }
    }
    throw new Error(`ഡൗൺലോഡ് പരാജയപ്പെട്ടു (${lastErr}). അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.`);
}

// 2. Facebook Multi-Method Downloader
async function getFbMedia(url) {
    const cleanUrl = url.trim();

    const methods = [
        // Method 1: GiftedTech FB API
        async () => {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/fbdl?apikey=gifted&url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            return r?.hd_video || r?.sd_video || r?.url || null;
        },
        // Method 2: Dark-Yasiya FB API
        async () => {
            const res = await axios.get(`https://www.dark-yasiya-api.site/download/fb?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            return r?.hd || r?.sd || null;
        },
        // Method 3: FSave Form Scraper
        async () => {
            const form = new URLSearchParams();
            form.append("q", cleanUrl);
            form.append("vt", "home");

            const res = await axios.post("https://fsave.io/api/ajaxSearch", form.toString(), {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "User-Agent": UA,
                    "Origin": "https://fsave.io",
                    "Referer": "https://fsave.io/"
                },
                timeout: 15000
            });

            const html = res.data?.data || "";
            const match = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download 720p/i) ||
                          html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download 360p/i) ||
                          html.match(/href="(https:\/\/[^"]+\.mp4[^"]*)"/i);
            return match ? match[1].replace(/&amp;/g, "&") : null;
        }
    ];

    let lastErr = "No response";
    for (let i = 0; i < methods.length; i++) {
        try {
            const link = await methods[i]();
            if (link && link.startsWith("http")) {
                console.log(`[FB] Success via Method ${i + 1}`);
                return link;
            }
        } catch (e) {
            lastErr = e.message;
        }
    }
    throw new Error(`Facebook വീഡിയോ ലഭിച്ചില്ല (${lastErr}).`);
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
                const mediaUrl = await getInstaMedia(url);
                const buffer = await downloadBuffer(mediaUrl);

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
                const mediaUrl = await getFbMedia(url);
                const buffer = await downloadBuffer(mediaUrl);

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


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

// Multi-Mirror Cobalt + Direct Scraper (Works for both Instagram & Facebook)
async function getSocialMediaUrl(url) {
    const cleanUrl = url.split("?")[0].trim();

    // 1. Try Multiple Public Cobalt Instances (Most reliable for IG & FB)
    const cobaltMirrors = [
        "https://cobalt-api.kwiatekmiki.com/",
        "https://cobalt.api.timelessnesses.me/",
        "https://api.cobalt.best/",
        "https://cobalt-backend.canine.tools/"
    ];

    for (const mirror of cobaltMirrors) {
        try {
            const res = await axios.post(
                mirror,
                { url: cleanUrl, videoQuality: "720", filenameStyle: "basic" },
                {
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "User-Agent": UA
                    },
                    timeout: 12000
                }
            );
            const data = res.data;
            if (data?.url) return data.url;
            if (Array.isArray(data?.picker) && data.picker.length > 0) {
                return data.picker[0].url;
            }
        } catch {
            continue;
        }
    }

    // 2. Fallback APIs
    const backupApis = [
        async () => {
            const res = await axios.get(`https://api.agatz.xyz/api/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const d = res.data?.data;
            return Array.isArray(d) && d[0]?.url ? d[0].url : d?.url || null;
        },
        async () => {
            const res = await axios.get(`https://api.agatz.xyz/api/facebook?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            return res.data?.data?.hd || res.data?.data?.sd || null;
        },
        async () => {
            const res = await axios.get(`https://api.vreden.web.id/api/igdownload?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const d = res.data?.result?.data;
            return Array.isArray(d) && d[0]?.url ? d[0].url : null;
        },
        async () => {
            const res = await axios.get(`https://api.vreden.web.id/api/fbdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            return res.data?.result?.hd || res.data?.result?.sd || null;
        }
    ];

    for (const api of backupApis) {
        try {
            const link = await api();
            if (link && link.startsWith("http")) return link;
        } catch {
            continue;
        }
    }

    throw new Error("മീഡിയ ലിങ്ക് ലഭ്യമായില്ല. ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പുവരുത്തി വീണ്ടും ശ്രമിക്കുക.");
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
                const mediaUrl = await getSocialMediaUrl(url);
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
                const mediaUrl = await getSocialMediaUrl(url);
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

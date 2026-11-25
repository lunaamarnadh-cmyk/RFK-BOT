const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Download media as Buffer so WhatsApp sends it reliably without 403 errors
async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

// Jarvis / Jawad-MD Style Multi-API Instagram Downloader
async function getInstaUrl(url) {
    const cleanUrl = url.split("?")[0].trim();
    const apis = [
        async () => {
            const res = await axios.get(`https://api.davidcyriltech.my.id/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            return res.data?.downloadUrl || res.data?.result?.[0]?.url || null;
        },
        async () => {
            const res = await axios.get(`https://bk9.fun/download/instagram?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const data = res.data?.BK9;
            return Array.isArray(data) && data.length > 0 ? data[0].url : null;
        },
        async () => {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/instadl?apikey=gifted&url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            if (Array.isArray(r) && r[0]?.download_url) return r[0].download_url;
            return r?.download_url || null;
        },
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const data = res.data?.data;
            return Array.isArray(data) && data.length > 0 ? data[0].url : null;
        }
    ];

    for (const api of apis) {
        try {
            const link = await api();
            if (link && link.startsWith("http")) return link;
        } catch {
            continue;
        }
    }
    throw new Error("Instagram വീഡിയോ ലഭ്യമല്ല. അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.");
}

// Jarvis / Jawad-MD Style Multi-API Facebook Downloader
async function getFbUrl(url) {
    const cleanUrl = url.trim();
    const apis = [
        async () => {
            const res = await axios.get(`https://api.davidcyriltech.my.id/facebook?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            return res.data?.video?.hd || res.data?.video?.sd || res.data?.result?.hd || null;
        },
        async () => {
            const res = await axios.get(`https://bk9.fun/download/fb?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            return res.data?.BK9?.hd || res.data?.BK9?.sd || null;
        },
        async () => {
            const res = await axios.get(`https://api.giftedtech.web.id/api/download/fbdl?apikey=gifted&url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const r = res.data?.result;
            return r?.hd_video || r?.sd_video || r?.url || null;
        },
        async () => {
            const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(cleanUrl)}`, { timeout: 15000 });
            const data = res.data?.data;
            if (Array.isArray(data) && data.length > 0) return data[0].url;
            return data?.hd || data?.sd || null;
        }
    ];

    for (const api of apis) {
        try {
            const link = await api();
            if (link && link.startsWith("http")) return link;
        } catch {
            continue;
        }
    }
    throw new Error("Facebook വീഡിയോ ലഭ്യമല്ല. ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പുവരുത്തുക.");
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
                const mediaUrl = await getInstaUrl(url);
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
                const mediaUrl = await getFbUrl(url);
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

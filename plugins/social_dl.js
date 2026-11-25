
const axios = require("axios");

async function fetchMedia(url, platform) {
    const apis = platform === "insta"
        ? [
            async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.data;
                if (Array.isArray(data) && data.length > 0) return data[0].url;
                return null;
            },
            async () => {
                const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.data;
                if (Array.isArray(data) && data.length > 0) return data[0].url;
                return null;
            },
            async () => {
                const res = await axios.post(
                    "https://api.cobalt.tools/",
                    { url, videoQuality: "720" },
                    { headers: { Accept: "application/json", "Content-Type": "application/json" }, timeout: 15000 }
                );
                return res.data?.url || res.data?.picker?.[0]?.url || null;
            }
        ]
        : [
            async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.data;
                if (Array.isArray(data) && data.length > 0) return data[0].url;
                return data?.hd || data?.sd || null;
            },
            async () => {
                const res = await axios.get(`https://api.ryzendesu.vip/api/downloader/fbdl?url=${encodeURIComponent(url)}`, { timeout: 15000 });
                const data = res.data?.data;
                if (Array.isArray(data) && data.length > 0) return data[0].url;
                return null;
            },
            async () => {
                const res = await axios.post(
                    "https://api.cobalt.tools/",
                    { url, videoQuality: "720" },
                    { headers: { Accept: "application/json", "Content-Type": "application/json" }, timeout: 15000 }
                );
                return res.data?.url || null;
            }
        ];

    for (const api of apis) {
        try {
            const videoUrl = await api();
            if (videoUrl) return videoUrl;
        } catch {
            continue;
        }
    }
    throw new Error("നിലവിൽ സെർവറുകൾ തിരക്കിലാണ്, അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.");
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

                await sock.sendMessage(
                    jid,
                    {
                        video: { url: mediaUrl },
                        caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*"
                    },
                    { quoted: msg }
                );
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

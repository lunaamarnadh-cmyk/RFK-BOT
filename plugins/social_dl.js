
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

function extractShortcode(url) {
    const clean = url.split("?")[0].replace(/\/$/, "");
    const match = clean.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[2] : null;
}

function shortcodeToMediaId(shortcode) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mediaId = BigInt(0);
    for (let i = 0; i < shortcode.length; i++) {
        mediaId = mediaId * BigInt(64) + BigInt(alphabet.indexOf(shortcode[i]));
    }
    return mediaId.toString();
}

// Primary: Instagram API with Audio+Video DASH Merge
async function getInstaMedia(url) {
    const shortcode = extractShortcode(url);
    if (!shortcode) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    const cookie = (process.env.IG_COOKIE || "sessionid=51476036011%3AMYbtaqpKPGa9Zs%3A2%3AAYmIznW-I_7-zSt6MZwN49aWQEjDmHLnQZa4zMx6vg;").trim();
    const mediaId = shortcodeToMediaId(shortcode);

    if (cookie) {
        try {
            const res = await axios.get(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
                headers: {
                    "User-Agent": "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)",
                    "X-IG-App-ID": "936619743392459",
                    "Cookie": cookie.includes("sessionid=") ? cookie : `sessionid=${cookie};`
                },
                timeout: 15000
            });
            const item = res.data?.items?.[0];
            if (item) {
                const mediaObj = item.video_versions ? item : (item.carousel_media?.[0] || item);

                // DASH Audio + Video Merge (Fixes No-Sound Reels)
                if (mediaObj.video_dash_manifest && mediaObj.video_versions?.length > 0) {
                    const manifest = mediaObj.video_dash_manifest;
                    const audioMatch = manifest.match(/<AdaptationSet[^>]*contentType="audio"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i) ||
                                       manifest.match(/<Representation[^>]*mimeType="audio\/mp4"[\s\S]*?<BaseURL>([^<]+)<\/BaseURL>/i);

                    if (audioMatch?.[1]) {
                        const audioUrl = audioMatch[1].replace(/&amp;/g, "&");
                        const videoUrl = mediaObj.video_versions[0].url;
                        return { type: "dash", videoUrl, audioUrl };
                    }
                }

                if (mediaObj.video_versions?.length > 0) {
                    return { type: "video", url: mediaObj.video_versions[0].url };
                }
                if (mediaObj.image_versions2?.candidates?.length > 0) {
                    return { type: "image", url: mediaObj.image_versions2.candidates[0].url };
                }
            }
        } catch (e) {
            console.error("Cookie API error:", e.message);
        }
    }

    // Fallback: Direct Embed Page Regex
    try {
        const embedRes = await axios.get(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
            headers: { "User-Agent": UA },
            timeout: 15000
        });
        const html = embedRes.data || "";
        const vMatch = html.match(/"video_url":"([^"]+)"/);
        if (vMatch?.[1]) {
            return { type: "video", url: vMatch[1].replace(/\\u0026/g, "&").replace(/\\/g, "") };
        }
    } catch {}

    throw new Error(
        cookie
            ? "IG_COOKIE കാലാവധി കഴിഞ്ഞു. പുതിയ sessionid അപ്‌ഡേറ്റ് ചെയ്യുക."
            : "Render/Railway-യിൽ IG_COOKIE സെറ്റ് ചെയ്തിട്ടില്ല! sessionid ചേർക്കുക."
    );
}

// Merge Video and Audio using FFmpeg
async function mergeVideoAudio(videoUrl, audioUrl) {
    const id = Date.now();
    const vPath = path.join("/tmp", `ig_v_${id}.mp4`);
    const aPath = path.join("/tmp", `ig_a_${id}.m4a`);
    const outPath = path.join("/tmp", `ig_out_${id}.mp4`);

    try {
        const [vBuf, aBuf] = await Promise.all([fetchBuffer(videoUrl), fetchBuffer(audioUrl)]);
        fs.writeFileSync(vPath, vBuf);
        fs.writeFileSync(aPath, aBuf);

        await execPromise(`ffmpeg -y -i "${vPath}" -i "${aPath}" -c:v copy -c:a aac -shortest "${outPath}"`);
        const finalBuffer = fs.readFileSync(outPath);
        return finalBuffer;
    } finally {
        [vPath, aPath, outPath].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
}

// Facebook Direct Scraper
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
    throw new Error("Facebook വീഡിയോ ലിങ്ക് ലഭിച്ചില്ല (ലിങ്ക് പബ്ലിക് ആണെന്ന് ഉറപ്പാക്കുക).");
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

                if (media.type === "dash") {
                    const buffer = await mergeVideoAudio(media.videoUrl, media.audioUrl);
                    await sock.sendMessage(jid, { video: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                } else if (media.type === "image") {
                    const buffer = await fetchBuffer(media.url);
                    await sock.sendMessage(jid, { image: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
                } else {
                    const buffer = await fetchBuffer(media.url);
                    await sock.sendMessage(jid, { video: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
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
                await sock.sendMessage(jid, { video: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
            } catch (err) {
                await reply(`❌ *FB Error:* ${err.message}`);
            }
        }
    }
];

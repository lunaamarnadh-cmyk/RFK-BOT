
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*", "Referer": "https://www.instagram.com/" },
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

function extractAudioFromDash(manifest) {
    if (!manifest) return null;
    const xml = manifest
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');

    const audioSets = xml.match(/<AdaptationSet[\s\S]*?<\/AdaptationSet>/gi) || [];
    for (const set of audioSets) {
        if (/audio/i.test(set)) {
            const urlMatch = set.match(/<BaseURL>([^<]+)<\/BaseURL>/i);
            if (urlMatch?.[1]) return urlMatch[1].trim();
        }
    }
    return null;
}

async function getInstaMedia(url) {
    const shortcode = extractShortcode(url);
    if (!shortcode) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    const rawCookie = (process.env.IG_COOKIE || "sessionid=51476036011%3AMYbtaqpKPGa9Zs%3A2%3AAYmIznW-I_7-zSt6MZwN49aWQEjDmHLnQZa4zMx6vg;").trim();
    const cookieHeader = rawCookie.includes("sessionid=") ? rawCookie : `sessionid=${rawCookie};`;
    const mediaId = shortcodeToMediaId(shortcode);

    // Method 1: Instagram GraphQL Query (Returns direct video_url WITH audio)
    try {
        const gqlRes = await axios.post(
            "https://www.instagram.com/api/graphql",
            new URLSearchParams({
                variables: JSON.stringify({ shortcode }),
                doc_id: "10015901848480474",
                lsd: "AVqbxe3J_YA"
            }).toString(),
            {
                headers: {
                    "User-Agent": UA,
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-IG-App-ID": "936619743392459",
                    "X-FB-LSD": "AVqbxe3J_YA",
                    "X-ASBD-ID": "129477",
                    "Cookie": cookieHeader,
                    "Origin": "https://www.instagram.com",
                    "Referer": `https://www.instagram.com/reel/${shortcode}/`
                },
                timeout: 15000
            }
        );

        const mediaData = gqlRes.data?.data?.xdt_shortcode_media;
        if (mediaData) {
            if (mediaData.is_video && mediaData.video_url) {
                return { type: "video", url: mediaData.video_url };
            }
            if (mediaData.edge_sidecar_to_children?.edges?.length > 0) {
                const firstNode = mediaData.edge_sidecar_to_children.edges[0].node;
                if (firstNode.is_video && firstNode.video_url) {
                    return { type: "video", url: firstNode.video_url };
                }
            }
        }
    } catch (e) {
        console.error("GraphQL error:", e.message);
    }

    // Method 2: Mobile API + DASH Audio/Video Merge
    if (rawCookie) {
        try {
            const res = await axios.get(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
                headers: {
                    "User-Agent": "Instagram 317.0.0.34.109 Android (34/14; 420dpi; 1080x2400; samsung; SM-S918B; dm3q; qcom; en_US; 562236835)",
                    "X-IG-App-ID": "936619743392459",
                    "Cookie": cookieHeader
                },
                timeout: 15000
            });
            const item = res.data?.items?.[0];
            if (item) {
                const mediaObj = item.video_versions ? item : (item.carousel_media?.[0] || item);
                if (mediaObj.video_versions?.length > 0) {
                    const videoUrl = mediaObj.video_versions[0].url;
                    let audioUrl = mediaObj.audio_versions?.[0]?.url ||
                                   extractAudioFromDash(mediaObj.video_dash_manifest) ||
                                   item.clips_metadata?.music_info?.music_asset_info?.progressive_download_url ||
                                   item.clips_metadata?.original_sound_info?.progressive_download_url ||
                                   null;

                    if (audioUrl) {
                        return { type: "dash", videoUrl, audioUrl };
                    }
                    return { type: "video", url: videoUrl };
                }
                if (mediaObj.image_versions2?.candidates?.length > 0) {
                    return { type: "image", url: mediaObj.image_versions2.candidates[0].url };
                }
            }
        } catch (e) {
            console.error("Mobile API error:", e.message);
        }
    }

    // Method 3: Embed Page Fallback
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

    throw new Error("Instagram വീഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല (പുതിയ sessionid നൽകുക).");
}

async function mergeVideoAudio(videoUrl, audioUrl) {
    const id = Date.now();
    const vPath = path.join("/tmp", `ig_v_${id}.mp4`);
    const aPath = path.join("/tmp", `ig_a_${id}.m4a`);
    const outPath = path.join("/tmp", `ig_out_${id}.mp4`);

    try {
        const [vBuf, aBuf] = await Promise.all([fetchBuffer(videoUrl), fetchBuffer(audioUrl)]);
        fs.writeFileSync(vPath, vBuf);
        fs.writeFileSync(aPath, aBuf);

        await execPromise(`ffmpeg -y -i "${vPath}" -i "${aPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest "${outPath}"`);
        return fs.readFileSync(outPath);
    } finally {
        [vPath, aPath, outPath].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
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

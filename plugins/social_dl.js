
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const YTDLP_PATH = "/tmp/yt-dlp";
const COOKIE_FILE = "/tmp/ig_cookies.txt";

const DEFAULT_SESSION_ID = "51476036011%3Ata0MM4GaNSuNAl%3A27%3AAYlcHJUN1WdLpQmL8X1df5-iarxrZZhgmqu42Jt6hg";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*", "Referer": "https://www.instagram.com/" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

async function ensureYtDlp() {
    if (fs.existsSync(YTDLP_PATH)) return YTDLP_PATH;
    const binUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
    const res = await axios.get(binUrl, { responseType: "arraybuffer", timeout: 60000 });
    fs.writeFileSync(YTDLP_PATH, Buffer.from(res.data));
    fs.chmodSync(YTDLP_PATH, 0o755);
    return YTDLP_PATH;
}

function getSessionInfo() {
    const rawCookie = (process.env.IG_COOKIE || DEFAULT_SESSION_ID).trim();
    if (!rawCookie || rawCookie === "NEW_SESSION_ID_HERE") return { sessionVal: null, userId: null };
    const match = rawCookie.match(/sessionid=([^;]+)/);
    const sessionVal = match ? match[1] : rawCookie.replace(/;/g, "");
    const userId = sessionVal.split("%3A")[0] || sessionVal.split(":")[0] || "";
    return { sessionVal, userId };
}

function writeCookieFile() {
    const { sessionVal, userId } = getSessionInfo();
    if (!sessionVal) return null;

    const lines = [
        "# Netscape HTTP Cookie File",
        `.instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t${sessionVal}`
    ];
    if (userId) {
        lines.push(`.instagram.com\tTRUE\t/\tTRUE\t2147483647\tds_user_id\t${userId}`);
    }
    fs.writeFileSync(COOKIE_FILE, lines.join("\n"));
    return COOKIE_FILE;
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

// Recursively search any Instagram API JSON object for audio / music URLs
function findAudioUrlInJson(obj) {
    if (!obj || typeof obj !== "object") return null;

    if (typeof obj.progressive_download_url === "string" && obj.progressive_download_url.startsWith("http")) {
        return obj.progressive_download_url;
    }
    if (typeof obj.audio_url === "string" && obj.audio_url.startsWith("http")) {
        return obj.audio_url;
    }
    if (typeof obj.video_dash_manifest === "string") {
        const xml = obj.video_dash_manifest.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        const sets = xml.match(/<AdaptationSet[\s\S]*?<\/AdaptationSet>/gi) || [];
        for (const s of sets) {
            if (/audio|mp4a/i.test(s)) {
                const m = s.match(/<BaseURL>([^<]+)<\/BaseURL>/i);
                if (m?.[1]) return m[1].trim();
            }
        }
    }

    for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val && typeof val === "object") {
            const found = findAudioUrlInJson(val);
            if (found) return found;
        }
    }
    return null;
}

// Fetch separate music/audio track if reel video came without sound
async function fetchSeparateAudioBuffer(url) {
    const { sessionVal, userId } = getSessionInfo();
    const cookieHeader = sessionVal ? `sessionid=${sessionVal}; ds_user_id=${userId};` : "";
    const shortcode = extractShortcode(url);

    // 1. Try yt-dlp audio-only extraction first
    try {
        const ytdlp = await ensureYtDlp();
        const cookies = writeCookieFile();
        const aId = `aud_${Date.now()}`;
        const aOut = `/tmp/${aId}.%(ext)s`;
        const cookieFlag = cookies ? `--cookies "${cookies}"` : "";
        await execPromise(`"${ytdlp}" ${cookieFlag} -f "ba" --no-warnings -o "${aOut}" "${url}"`, { timeout: 30000 });
        const files = fs.readdirSync("/tmp").filter(f => f.startsWith(`${aId}.`));
        if (files.length > 0) {
            const fPath = path.join("/tmp", files[0]);
            const buf = fs.readFileSync(fPath);
            fs.unlinkSync(fPath);
            if (buf.length > 1000) return buf;
        }
    } catch {}

    // 2. Try Mobile API JSON deep search for music_asset_info / progressive_download_url
    if (shortcode && cookieHeader) {
        try {
            const mediaId = shortcodeToMediaId(shortcode);
            const res = await axios.get(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
                headers: {
                    "User-Agent": "Instagram 317.0.0.34.109 Android (34/14; 420dpi; 1080x2400; samsung; SM-S918B; dm3q; qcom; en_US; 562236835)",
                    "X-IG-App-ID": "936619743392459",
                    "Cookie": cookieHeader
                },
                timeout: 15000
            });
            const audioUrl = findAudioUrlInJson(res.data);
            if (audioUrl) return await fetchBuffer(audioUrl);
        } catch {}
    }

    // 3. Try GraphQL JSON deep search
    if (shortcode) {
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
                        "Cookie": cookieHeader
                    },
                    timeout: 15000
                }
            );
            const audioUrl = findAudioUrlInJson(gqlRes.data);
            if (audioUrl) return await fetchBuffer(audioUrl);
        } catch {}
    }

    return null;
}

async function fileHasAudio(filePath) {
    try {
        const { stdout } = await execPromise(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`);
        return stdout.trim().includes("audio");
    } catch {
        return false;
    }
}

async function processVideoFile(inputPath, url) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fixedPath = `/tmp/wa_${id}.mp4`;
    const tempAudioPath = `/tmp/wa_aud_${id}.m4a`;
    const mergedPath = `/tmp/wa_mrg_${id}.mp4`;

    try {
        // Convert to WhatsApp-compatible H.264 + AAC
        await execPromise(
            `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${fixedPath}"`,
            { timeout: 60000 }
        );

        const hasAudio = await fileHasAudio(fixedPath);
        if (hasAudio) {
            return { buffer: fs.readFileSync(fixedPath), source: "yt-dlp (Audio Verified ✅)" };
        }

        // Video has NO audio stream -> Fetch separate music/audio track and merge!
        const audioBuf = await fetchSeparateAudioBuffer(url);
        if (audioBuf) {
            fs.writeFileSync(tempAudioPath, audioBuf);
            await execPromise(
                `ffmpeg -y -i "${fixedPath}" -i "${tempAudioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart "${mergedPath}"`,
                { timeout: 60000 }
            );
            if (fs.existsSync(mergedPath) && (await fileHasAudio(mergedPath))) {
                return { buffer: fs.readFileSync(mergedPath), source: "yt-dlp + Music Track Merged ✅" };
            }
        }

        return { buffer: fs.readFileSync(fixedPath), source: "yt-dlp (Original Silent Reel)" };
    } finally {
        [inputPath, fixedPath, tempAudioPath, mergedPath].forEach(f => {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        });
    }
}

async function runYtDlp(url, useCookies = true) {
    const ytdlp = await ensureYtDlp();
    const cookies = useCookies ? writeCookieFile() : null;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outTemplate = `/tmp/ig_${id}.%(ext)s`;

    const cookieFlag = cookies ? `--cookies "${cookies}"` : "";
    const cmd = `"${ytdlp}" ${cookieFlag} -f "b[acodec!=none]/bv*+ba/b" --merge-output-format mp4 --no-warnings -o "${outTemplate}" "${url}"`;

    await execPromise(cmd, { timeout: 60000 });

    const basePrefix = `ig_${id}.`;
    const files = fs.readdirSync("/tmp").filter(f => f.startsWith(basePrefix));
    if (files.length > 0) {
        const fullPath = path.join("/tmp", files[0]);
        const isImg = /\.(jpg|jpeg|png|webp)$/i.test(files[0]);
        if (isImg) {
            const buf = fs.readFileSync(fullPath);
            fs.unlinkSync(fullPath);
            return { type: "image", buffer: buf, source: "yt-dlp Image" };
        }
        const { buffer, source } = await processVideoFile(fullPath, url);
        return { type: "video", buffer, source };
    }
    throw new Error("Output file not created");
}

async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    try {
        return await runYtDlp(url, true);
    } catch (err1) {
        try {
            return await runYtDlp(url, false);
        } catch (err2) {
            if (err1.message.includes("401")) {
                throw new Error("Instagram sessionid കാലാവധി കഴിഞ്ഞു (401 Unauthorized). പുതിയ sessionid അപ്‌ഡേറ്റ് ചെയ്യുക.");
            }
            throw new Error(err2.stderr || err2.message);
        }
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

                if (media.type === "image") {
                    await sock.sendMessage(jid, { image: media.buffer, caption: `✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*\n_Source: ${media.source}_` }, { quoted: msg });
                } else {
                    await sock.sendMessage(jid, { video: media.buffer, mimetype: "video/mp4", caption: `✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*\n_Source: ${media.source}_` }, { quoted: msg });
                }
            } catch (err) {
                await reply(`❌ *Insta Error:* ${err.message.slice(0, 300)}`);
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

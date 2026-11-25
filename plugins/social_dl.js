
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

async function fileHasAudio(filePath) {
    try {
        const { stdout } = await execPromise(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`);
        return stdout.trim().includes("audio");
    } catch {
        return false;
    }
}

// Residential Proxy APIs fallback for Copyrighted/Licensed Music Reels
async function fetchViaExternalProxyApi(url) {
    // 1. Try SnapSave / RapidAPI style public scraper (indown / saveig)
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
        const match = html.match(/href="(https:\/\/[^"]+)"[^>]*title="Download Video"/i) ||
                      html.match(/href="(https:\/\/d\.rapidcdn\.app[^"]+)"/i);
        if (match?.[1]) {
            const cleanUrl = match[1].replace(/&amp;/g, "&");
            const buf = await fetchBuffer(cleanUrl);
            if (buf.length > 50000) return { buffer: buf, source: "SaveIG Proxy (Audio ✅)" };
        }
    } catch {}

    // 2. Try Instagram Web Embed / Page HTML `clips_music_attribution_info` or `video_url`
    try {
        const shortcode = extractShortcode(url);
        if (shortcode) {
            const res = await axios.get(`https://www.instagram.com/reel/${shortcode}/?__a=1&__d=dis`, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                    "X-IG-App-ID": "936619743392459"
                },
                timeout: 15000
            });
            const jsonStr = JSON.stringify(res.data || {});
            const progMatch = jsonStr.match(/"progressive_download_url":"(https:[^"]+)"/);
            if (progMatch?.[1]) {
                const audioUrl = progMatch[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
                const audioBuf = await fetchBuffer(audioUrl);
                if (audioBuf.length > 10000) return { audioBuffer: audioBuf };
            }
        }
    } catch {}

    return null;
}

async function processVideoFile(inputPath, url) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fixedPath = `/tmp/wa_${id}.mp4`;
    const tempAudioPath = `/tmp/wa_aud_${id}.m4a`;
    const mergedPath = `/tmp/wa_mrg_${id}.mp4`;

    try {
        await execPromise(
            `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${fixedPath}"`,
            { timeout: 60000 }
        );

        const hasAudio = await fileHasAudio(fixedPath);
        if (hasAudio) {
            return { buffer: fs.readFileSync(fixedPath), source: "yt-dlp (Audio Verified ✅)" };
        }

        // Video has NO audio -> Try External Proxy API for Licensed Music Reels
        const proxyResult = await fetchViaExternalProxyApi(url);
        if (proxyResult?.buffer) {
            return proxyResult;
        }
        if (proxyResult?.audioBuffer) {
            fs.writeFileSync(tempAudioPath, proxyResult.audioBuffer);
            await execPromise(
                `ffmpeg -y -i "${fixedPath}" -i "${tempAudioPath}" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 128k -shortest -movflags +faststart "${mergedPath}"`,
                { timeout: 60000 }
            );
            if (fs.existsSync(mergedPath) && (await fileHasAudio(mergedPath))) {
                return { buffer: fs.readFileSync(mergedPath), source: "yt-dlp + Web Music Merged ✅" };
            }
        }

        return { buffer: fs.readFileSync(fixedPath), source: "yt-dlp (Licensed Audio Blocked by IG)" };
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

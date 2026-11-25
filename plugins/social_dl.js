
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

function writeCookieFile() {
    const rawCookie = (process.env.IG_COOKIE || DEFAULT_SESSION_ID).trim();
    if (!rawCookie || rawCookie === "NEW_SESSION_ID_HERE") return null;

    const match = rawCookie.match(/sessionid=([^;]+)/);
    const sessionVal = match ? match[1] : rawCookie.replace(/;/g, "");

    const content = [
        "# Netscape HTTP Cookie File",
        `.instagram.com\tTRUE\t/\tTRUE\t2147483647\tsessionid\t${sessionVal}`
    ].join("\n");

    fs.writeFileSync(COOKIE_FILE, content);
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

async function fileHasAudio(filePath) {
    try {
        const { stdout } = await execPromise(`ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`);
        return stdout.trim().includes("audio");
    } catch {
        return false;
    }
}

async function makeWhatsAppCompatible(inputPath) {
    const fixedPath = inputPath.replace(/\.[^.]+$/, "_wa.mp4");
    try {
        await execPromise(
            `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${fixedPath}"`,
            { timeout: 60000 }
        );
        const hasAudio = await fileHasAudio(fixedPath);
        const buf = fs.readFileSync(fixedPath);
        return { buffer: buf, hasAudio };
    } finally {
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(fixedPath)) fs.unlinkSync(fixedPath);
    }
}

async function runYtDlp(url, useCookies = true) {
    const ytdlp = await ensureYtDlp();
    const cookies = useCookies ? writeCookieFile() : null;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outTemplate = `/tmp/ig_${id}.%(ext)s`;

    const cookieFlag = cookies ? `--cookies "${cookies}"` : "";
    // Strictly prioritize formats WITH audio (acodec!=none), or merge bestvideo+bestaudio
    const cmd = `"${ytdlp}" ${cookieFlag} -f "b[acodec!=none]/bv*+ba[acodec!=none]/bv*+ba/b" --merge-output-format mp4 --no-warnings -o "${outTemplate}" "${url}"`;

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
        const { buffer, hasAudio } = await makeWhatsAppCompatible(fullPath);
        return {
            type: "video",
            buffer,
            hasAudio,
            source: hasAudio ? "yt-dlp (Audio Verified ✅)" : "yt-dlp (No Audio Stream)"
        };
    }
    throw new Error("Output file not created");
}

async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    // 1. Try WITH cookies
    try {
        const res = await runYtDlp(url, true);
        if (res.type === "image" || res.hasAudio) return res;

        // If cookie download had NO audio, try WITHOUT cookies (public embed/web often gives muxed audio+video!)
        try {
            const pubRes = await runYtDlp(url, false);
            if (pubRes.hasAudio) return pubRes;
        } catch {}

        return res;
    } catch (err1) {
        // 2. Fallback WITHOUT cookies
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

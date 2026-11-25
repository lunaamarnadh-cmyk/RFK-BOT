
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const YTDLP_PATH = "/tmp/yt-dlp";
const COOKIE_FILE = "/tmp/ig_cookies.txt";

async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": UA, "Accept": "*/*", "Referer": "https://www.instagram.com/" },
        timeout: 30000
    });
    return Buffer.from(res.data);
}

// Auto-download yt-dlp binary if not present
async function ensureYtDlp() {
    if (fs.existsSync(YTDLP_PATH)) return YTDLP_PATH;
    const binUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
    const res = await axios.get(binUrl, { responseType: "arraybuffer", timeout: 60000 });
    fs.writeFileSync(YTDLP_PATH, Buffer.from(res.data));
    fs.chmodSync(YTDLP_PATH, 0o755);
    return YTDLP_PATH;
}

// Create Netscape cookie file for yt-dlp from sessionid
function writeCookieFile() {
    const rawCookie = (process.env.IG_COOKIE || "sessionid=51476036011%3AMYbtaqpKPGa9Zs%3A2%3AAYmIznW-I_7-zSt6MZwN49aWQEjDmHLnQZa4zMx6vg;").trim();
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

async function downloadWithYtDlp(url) {
    const ytdlp = await ensureYtDlp();
    const cookies = writeCookieFile();
    const outTemplate = `/tmp/ig_${Date.now()}.%(ext)s`;
    const expectedMp4 = outTemplate.replace("%(ext)s", "mp4");

    try {
        // Force best video + best audio merged into mp4 using server's ffmpeg
        const cmd = `"${ytdlp}" --cookies "${cookies}" -f "bv*+ba/b" --merge-output-format mp4 --no-warnings -o "${outTemplate}" "${url}"`;
        await execPromise(cmd, { timeout: 60000 });

        if (fs.existsSync(expectedMp4)) {
            const buf = fs.readFileSync(expectedMp4);
            fs.unlinkSync(expectedMp4);
            return { type: "video", buffer: buf, source: "yt-dlp + FFmpeg (HD Audio)" };
        }

        // Check if it downloaded an image or differently named file
        const basePrefix = path.basename(outTemplate).split(".")[0];
        const files = fs.readdirSync("/tmp").filter(f => f.startsWith(basePrefix));
        if (files.length > 0) {
            const fullPath = path.join("/tmp", files[0]);
            const buf = fs.readFileSync(fullPath);
            const isImg = /\.(jpg|jpeg|png|webp)$/i.test(files[0]);
            fs.unlinkSync(fullPath);
            return { type: isImg ? "image" : "video", buffer: buf, source: "yt-dlp" };
        }
        throw new Error("Output file not created");
    } catch (e) {
        throw new Error(e.stderr || e.message);
    }
}

async function getInstaMedia(rawUrl) {
    const url = await resolveInstaUrl(rawUrl);
    if (!url.includes("instagram.com")) throw new Error("Instagram ലിങ്ക് ശരിയല്ല.");

    // Primary: yt-dlp with sessionid cookie + FFmpeg auto-merge
    return await downloadWithYtDlp(url);
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
                    await sock.sendMessage(jid, { video: media.buffer, caption: `✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*\n_Source: ${media.source}_` }, { quoted: msg });
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
                await sock.sendMessage(jid, { video: buffer, caption: "✅ *Downloaded by 乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂*" }, { quoted: msg });
            } catch (err) {
                await reply(`❌ *FB Error:* ${err.message}`);
            }
        }
    }
];

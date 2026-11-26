const axios = require("axios");

async function searchYouTube(query) {
  // If already a YouTube URL, extract video ID
  const ytMatch = query.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: "YouTube Media",
      duration: ""
    };
  }

  // Try yt-search if installed, otherwise scrape YouTube search results cleanly
  try {
    const yts = require("yt-search");
    const res = await yts(query);
    if (res?.videos?.length) {
      const v = res.videos[0];
      return {
        id: v.videoId,
        url: v.url,
        title: v.title,
        duration: v.timestamp || ""
      };
    }
  } catch {}

  const htmlRes = await axios.get(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36"
      },
      timeout: 15000
    }
  );
  const idMatch = String(htmlRes.data).match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
  if (!idMatch) return null;

  const titleMatch = String(htmlRes.data).match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
  return {
    id: idMatch[1],
    url: `https://www.youtube.com/watch?v=${idMatch[1]}`,
    title: titleMatch ? titleMatch[1] : query,
    duration: ""
  };
}

async function fetchDownloadUrl(ytUrl, type = "audio") {
  // API 1: Siputzx / Vreden / Ryzendesu public YT endpoints
  const endpoints =
    type === "audio"
      ? [
          `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(ytUrl)}`,
          `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(ytUrl)}`,
          `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(ytUrl)}`
        ]
      : [
          `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(ytUrl)}`,
          `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(ytUrl)}`,
          `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(ytUrl)}`
        ];

  for (const api of endpoints) {
    try {
      const { data } = await axios.get(api, { timeout: 25000 });
      const dl =
        data?.data?.dl ||
        data?.result?.download?.url ||
        data?.result?.url ||
        data?.url ||
        data?.download_url;
      const title =
        data?.data?.title ||
        data?.result?.title ||
        data?.title ||
        null;
      if (dl && typeof dl === "string" && dl.startsWith("http")) {
        return { dl, title };
      }
    } catch {}
  }
  return null;
}

module.exports = {
  pattern: "song",
  alias: ["play", "ytmp3", "video", "ytmp4"],
  type: "downloader",
  desc: "Download YouTube Audio (.song / .play) and Video (.video / .ytmp4)",
  async execute({ sock, msg, jid, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();

    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const query = (text || raw.replace(/^[.!\/#]\S+\s*/i, "")).trim();

    const isVideo = cmdName === "video" || cmdName === "ytmp4";

    if (!query) {
      return send(
        isVideo
          ? "🎬 *Usage:* `.video <song/video name or YouTube link>`\n*Example:* `.video Illuminati Aavesham`"
          : "🎵 *Usage:* `.song <song name or YouTube link>`\n*Example:* `.song Illuminati Aavesham`"
      );
    }

    try {
      await sock.sendMessage(jid, { react: { text: isVideo ? "🎬" : "🎵", key: msg.key } });
    } catch {}

    try {
      const videoInfo = await searchYouTube(query);
      if (!videoInfo) {
        return send("❌ *No matching YouTube results found!*");
      }

      await send(
        `⏳ *Downloading ${isVideo ? "Video" : "Audio"}...*\n\n` +
        `📌 *Title:* ${videoInfo.title}\n` +
        (videoInfo.duration ? `⏱️ *Duration:* ${videoInfo.duration}\n` : "") +
        `🔗 ${videoInfo.url}`
      );

      const mediaData = await fetchDownloadUrl(videoInfo.url, isVideo ? "video" : "audio");
      if (!mediaData || !mediaData.dl) {
        return send("❌ *Download server is currently busy. Please try again in a moment!*");
      }

      const finalTitle = mediaData.title || videoInfo.title || "RFK_Media";

      if (isVideo) {
        await sock.sendMessage(
          jid,
          {
            video: { url: mediaData.dl },
            mimetype: "video/mp4",
            caption: `🎬 *${finalTitle}*\n\n_Downloaded by RFK-BOT_`
          },
          { quoted: msg }
        );
      } else {
        await sock.sendMessage(
          jid,
          {
            audio: { url: mediaData.dl },
            mimetype: "audio/mpeg",
            ptt: false,
            fileName: `${finalTitle}.mp3`
          },
          { quoted: msg }
        );
      }
    } catch (e) {
      await send(`❌ *Download failed:* ${e.message}`);
    }
  }
};

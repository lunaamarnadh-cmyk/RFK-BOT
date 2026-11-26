const axios = require("axios");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function pickUrl(obj) {
  if (!obj || typeof obj !== "object") return null;
  const candidates = [
    obj.download,
    obj.dl_url,
    obj.dl,
    obj.downloadUrl,
    obj.downloadURL,
    obj.download_url,
    obj.mp4,
    obj.url,
    obj.video
  ];
  for (const u of candidates) {
    if (typeof u === "string" && /^https?:\/\//i.test(u) && !/googlevideo\.com/i.test(u)) {
      return u;
    }
  }
  return null;
}

async function searchYouTube(query) {
  const ytMatch = query.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
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
    { headers: { "User-Agent": UA }, timeout: 15000 }
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

async function fetchYouTubeMedia(ytUrl, isVideo = false) {
  const enc = encodeURIComponent(ytUrl);
  const endpoints = isVideo
    ? [
        `https://knightbotapi.stream/api/download/ytmp4?apikey=knight&format=720p&url=${enc}`,
        `https://api.princetechn.com/api/download/ytvideo?apikey=prince&quality=720&url=${enc}`,
        `https://eliteprotech-apis.zone.id/ytdown?url=${enc}&format=mp4`,
        `https://api.yupra.my.id/api/downloader/ytmp4?url=${enc}`,
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${enc}`,
        `https://api.siputzx.my.id/api/d/ytmp4?url=${enc}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${enc}`,
        `https://api.vreden.my.id/api/ytmp4?url=${enc}`
      ]
    : [
        `https://knightbotapi.stream/api/download/ytaudio?apikey=knight&format=128kbps&url=${enc}`,
        `https://yt-dl.officialhectormanuel.workers.dev?url=${enc}`,
        `https://api.princetechn.com/api/download/ytmp3?apikey=prince&url=${enc}`,
        `https://eliteprotech-apis.zone.id/ytdown?url=${enc}&format=mp3`,
        `https://api.yupra.my.id/api/downloader/ytmp3?url=${enc}`,
        `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${enc}`,
        `https://izumiiiiiiii.dpdns.org/downloader/youtube?url=${enc}&format=mp3`,
        `https://api.siputzx.my.id/api/d/ytmp3?url=${enc}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${enc}`
      ];

  for (const api of endpoints) {
    try {
      const { data } = await axios.get(api, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 25000
      });
      const root = data?.result || data?.data || data;
      const dl =
        (typeof data?.audio === "string" && data.audio.startsWith("http") ? data.audio : null) ||
        pickUrl(root) ||
        pickUrl(data);
      const title = root?.title || data?.title || null;
      if (dl) return { dl, title };
    } catch {}
  }
  return null;
}

async function fetchSocialMedia(url, platform) {
  const enc = encodeURIComponent(url);
  let endpoints = [];

  if (platform === "fb") {
    endpoints = [
      `https://knightbotapi.stream/api/download/facebook?apikey=knight&url=${enc}`,
      `https://api.siputzx.my.id/api/d/facebook?url=${enc}`,
      `https://api.ryzendesu.vip/api/downloader/fbdl?url=${enc}`
    ];
  } else if (platform === "tiktok") {
    endpoints = [
      `https://knightbotapi.stream/api/download/tiktok?apikey=knight&url=${enc}`,
      `https://api.siputzx.my.id/api/d/tiktok?url=${enc}`,
      `https://api.ryzendesu.vip/api/downloader/ttdl?url=${enc}`
    ];
  } else if (platform === "twitter") {
    endpoints = [
      `https://eliteprotech-apis.zone.id/x?url=${enc}`,
      `https://api.princetechn.com/api/download/twitter?apikey=prince&url=${enc}`,
      `https://api.siputzx.my.id/api/d/twitter?url=${enc}`
    ];
  }

  for (const api of endpoints) {
    try {
      const { data } = await axios.get(api, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 25000
      });
      const root = data?.result || data?.data || data;
      let dl = pickUrl(root) || pickUrl(data);
      if (!dl && Array.isArray(data?.videos) && data.videos[0]?.url) {
        dl = data.videos[0].url;
      }
      if (!dl && Array.isArray(root?.videoUrls) && root.videoUrls[0]?.url) {
        dl = root.videoUrls[0].url;
      }
      const title = root?.title || data?.title || `${platform.toUpperCase()} Video`;
      if (dl && /^https?:\/\//i.test(dl)) {
        return { dl, title };
      }
    } catch {}
  }
  return null;
}

module.exports = {
  pattern: "song",
  alias: ["play", "ytmp3", "video", "ytmp4", "fb", "facebook", "tiktok", "tt", "twitter", "x"],
  type: "downloader",
  desc: "Download YouTube Audio/Video, Facebook, TikTok & Twitter/X Videos",
  async execute({ sock, msg, jid, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();

    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const query = (text || raw.replace(/^[.!\/#]\S+\s*/i, "")).trim();

    // 1. Social Media Downloaders (.fb, .tiktok, .twitter)
    if (["fb", "facebook", "tiktok", "tt", "twitter", "x"].includes(cmdName)) {
      const platform =
        cmdName === "fb" || cmdName === "facebook"
          ? "fb"
          : cmdName === "tiktok" || cmdName === "tt"
          ? "tiktok"
          : "twitter";

      if (!query || !/^https?:\/\//i.test(query)) {
        return send(`📥 *Usage:* \`.${cmdName} <video link>\``);
      }

      try {
        await sock.sendMessage(jid, { react: { text: "📥", key: msg.key } });
      } catch {}

      await send(`⏳ *Downloading ${platform.toUpperCase()} video... Please wait!*`);
      const media = await fetchSocialMedia(query, platform);

      if (!media || !media.dl) {
        return send("❌ *Failed to download video. Please check the link or try again later!*");
      }

      return sock.sendMessage(
        jid,
        {
          video: { url: media.dl },
          mimetype: "video/mp4",
          caption: `🎬 *${media.title}*\n\n_Downloaded by RFK-BOT_`
        },
        { quoted: msg }
      );
    }

    // 2. YouTube Audio & Video Downloader
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

      const mediaData = await fetchYouTubeMedia(videoInfo.url, isVideo);
      if (!mediaData || !mediaData.dl) {
        return send("❌ *All download servers are currently busy. Please try again in a moment!*");
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

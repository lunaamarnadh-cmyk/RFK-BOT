const axios = require("axios");

function extractVideoId(url) {
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

async function searchYouTube(query) {
  const res = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const match = res.data.match(/var ytInitialData = ({.*?});<\/script>/);
  if (!match) return null;
  const data = JSON.parse(match[1]);
  const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      if (item.videoRenderer?.videoId) {
        return {
          videoId: item.videoRenderer.videoId,
          title: item.videoRenderer.title?.runs?.[0]?.text || "YouTube Media",
          url: `https://www.youtube.com/watch?v=${item.videoRenderer.videoId}`
        };
      }
    }
  }
  return null;
}

async function getDownloadUrl(ytUrl, type = "mp4") {
  const apis = [
    async () => {
      const { data } = await axios.get(`https://api.siputzx.my.id/api/d/yt${type === "mp3" ? "mp3" : "mp4"}?url=${encodeURIComponent(ytUrl)}`, { timeout: 20000 });
      return data?.data?.dl || data?.result?.download || data?.url;
    },
    async () => {
      const { data } = await axios.get(`https://api.vreden.my.id/api/yt${type === "mp3" ? "mp3" : "mp4"}?url=${encodeURIComponent(ytUrl)}`, { timeout: 20000 });
      return data?.result?.download?.url || data?.result?.url;
    },
    async () => {
      const { data } = await axios.post("https://api.cobalt.tools/", {
        url: ytUrl,
        downloadMode: type === "mp3" ? "audio" : "auto",
        audioFormat: "mp3",
        videoQuality: "720"
      }, {
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        timeout: 20000
      });
      return data?.url;
    }
  ];

  for (const fetchFn of apis) {
    try {
      const dlUrl = await fetchFn();
      if (dlUrl && dlUrl.startsWith("http")) return dlUrl;
    } catch {}
  }
  return null;
}

module.exports = [
  {
    pattern: "ytv",
    alias: ["ytmp4", "ytvideo", "yt"],
    desc: "Download YouTube Video (MP4)",
    type: "downloader",
    async execute({ sock, msg, jid, args, reply }) {
      const input = args.join(" ").trim();
      if (!input) {
        return reply("🎬 *ഉപയോഗം:*\n• *`.ytv <YouTube Link>`*\n• അല്ലെങ്കിൽ *`.ytv <പാട്ടിന്റെ/വീഡിയോയുടെ പേര്>`*");
      }

      await reply("⏳ *യൂട്യൂബ് വീഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*");

      try {
        let ytUrl = input;
        let title = "YouTube Video";

        if (!extractVideoId(input)) {
          const found = await searchYouTube(input);
          if (!found) return reply("❌ വീഡിയോ കണ്ടെത്താൻ സാധിച്ചില്ല.");
          ytUrl = found.url;
          title = found.title;
        }

        const dlUrl = await getDownloadUrl(ytUrl, "mp4");
        if (!dlUrl) {
          return reply("❌ ഇപ്പോൾ ഈ വീഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല. മറ്റൊരു ലിങ്ക് ശ്രമിക്കുകയോ അല്പം കഴിഞ്ഞ് നോക്കുകയോ ചെയ്യുക.");
        }

        await sock.sendMessage(
          jid,
          {
            video: { url: dlUrl },
            mimetype: "video/mp4",
            caption: `🎬 *${title}*\n⚡ *Powered by 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒*`
          },
          { quoted: msg }
        );
      } catch (err) {
        return reply("❌ വീഡിയോ അയക്കാൻ സാധിച്ചില്ല: " + err.message);
      }
    }
  },
  {
    pattern: "yta",
    alias: ["ytmp3", "song", "ytaudio"],
    desc: "Download YouTube Audio (MP3)",
    type: "downloader",
    async execute({ sock, msg, jid, args, reply }) {
      const input = args.join(" ").trim();
      if (!input) {
        return reply("🎵 *ഉപയോഗം:*\n• *`.yta <YouTube Link>`*\n• അല്ലെങ്കിൽ *`.song <പാട്ടിന്റെ പേര്>`*");
      }

      await reply("⏳ *യൂട്യൂബ് ഓഡിയോ ഡൗൺലോഡ് ചെയ്യുന്നു...*");

      try {
        let ytUrl = input;
        let title = "YouTube Audio";

        if (!extractVideoId(input)) {
          const found = await searchYouTube(input);
          if (!found) return reply("❌ ഓഡിയോ കണ്ടെത്താൻ സാധിച്ചില്ല.");
          ytUrl = found.url;
          title = found.title;
        }

        const dlUrl = await getDownloadUrl(ytUrl, "mp3");
        if (!dlUrl) {
          return reply("❌ ഇപ്പോൾ ഈ ഓഡിയോ ഡൗൺലോഡ് ചെയ്യാൻ സാധിച്ചില്ല. അല്പം കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.");
        }

        await sock.sendMessage(
          jid,
          {
            audio: { url: dlUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`
          },
          { quoted: msg }
        );
      } catch (err) {
        return reply("❌ ഓഡിയോ അയക്കാൻ സാധിച്ചില്ല: " + err.message);
      }
    }
  }
];

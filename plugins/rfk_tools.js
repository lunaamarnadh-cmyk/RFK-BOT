const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}

function addStickerExif(webpBuffer, packname, author) {
  try {
    const webp = require("node-webpmux");
    return (async () => {
      const img = new webp.Image();
      await img.load(webpBuffer);
      const json = {
        "sticker-pack-id": crypto.randomBytes(16).toString("hex"),
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        emojis: ["🔥"]
      };
      const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
      ]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
      const exif = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);
      img.exif = exif;
      return await img.save(null);
    })();
  } catch {
    return Promise.resolve(webpBuffer);
  }
}

module.exports = {
  pattern: "sticker",
  alias: ["s", "stik", "ai", "gpt", "gemini", "alive"],
  type: "general",
  desc: "Sticker Maker (RFK MODS), AI Assistant & Alive Status",
  async execute({ sock, msg, jid, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ""
    ).trim();

    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();
    const query = (text || raw.replace(/^[.!\/#]\S+\s*/i, "")).trim();

    // 1. .alive Command
    if (cmdName === "alive") {
      const usedRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const uptime = formatUptime(process.uptime());
      const aliveText =
        `🤖 *RFK-BOT IS ONLINE & ACTIVE!* 🔥\n\n` +
        `👑 *Brand:* RFK MODS\n` +
        `😈 *Edition:* RFK സൈബർ ചെകുത്താൻ\n` +
        `⏱️ *Uptime:* ${uptime}\n` +
        `💾 *RAM Used:* ${usedRam} MB\n` +
        `⚡ *Status:* Running Smoothly\n\n` +
        `📌 Type *.menu* to see all commands!`;
      return send(aliveText);
    }

    // 2. .ai / .gpt / .gemini Command
    if (cmdName === "ai" || cmdName === "gpt" || cmdName === "gemini") {
      if (!query) {
        return send("🤖 *Usage:* `.ai <your question>`\n*Example:* `.ai Write a short poem about Kerala`");
      }
      try {
        await sock.sendMessage(jid, { react: { text: "🤖", key: msg.key } });
      } catch {}

      try {
        const res = await axios.post(
          "https://text.pollinations.ai/",
          {
            messages: [
              {
                role: "system",
                content: "You are RFK-BOT AI created by RFK MODS. Give helpful, clear, and concise answers."
              },
              { role: "user", content: query }
            ],
            model: "openai"
          },
          { timeout: 20000 }
        );
        const answer = typeof res.data === "string" ? res.data.trim() : "";
        if (answer) {
          return send(`🤖 *RFK AI:*\n\n${answer}`);
        }
      } catch {}

      try {
        const fallback = await axios.get(
          `https://text.pollinations.ai/${encodeURIComponent(query)}`,
          { timeout: 15000 }
        );
        if (fallback.data) {
          return send(`🤖 *RFK AI:*\n\n${String(fallback.data).trim()}`);
        }
      } catch {}

      return send("❌ *AI server is busy right now. Please try again in a moment!*");
    }

    // 3. .sticker / .s Command
    if (cmdName === "sticker" || cmdName === "s" || cmdName === "stik") {
      let targetMsg = msg;
      const quotedInfo = msg.message?.extendedTextMessage?.contextInfo;
      if (quotedInfo?.quotedMessage) {
        targetMsg = {
          key: {
            remoteJid: jid,
            id: quotedInfo.stanzaId,
            participant: quotedInfo.participant
          },
          message: quotedInfo.quotedMessage
        };
      }

      const mediaMsg =
        targetMsg.message?.imageMessage ||
        targetMsg.message?.videoMessage ||
        targetMsg.message?.documentMessage;

      if (!mediaMsg) {
        return send("🎨 *Reply to an image or short video with `.s` or `.sticker`!*");
      }

      try {
        await sock.sendMessage(jid, { react: { text: "⏳", key: msg.key } });
      } catch {}

      const tmpDir = path.join("/tmp", "rfk_stickers");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      const stamp = Date.now();
      const inputPath = path.join(tmpDir, `in_${stamp}`);
      const outputPath = path.join(tmpDir, `out_${stamp}.webp`);

      try {
        const buffer = await downloadMediaMessage(
          targetMsg,
          "buffer",
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer) return send("❌ *Failed to download media. Please try again!*");

        fs.writeFileSync(inputPath, buffer);

        const isAnimated =
          mediaMsg.mimetype?.includes("gif") ||
          mediaMsg.mimetype?.includes("video") ||
          (mediaMsg.seconds && mediaMsg.seconds > 0);

        const cmd = isAnimated
          ? `ffmpeg -y -i "${inputPath}" -t 5 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 55 "${outputPath}"`
          : `ffmpeg -y -i "${inputPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 "${outputPath}"`;

        await new Promise((resolve, reject) => {
          exec(cmd, (err) => (err ? reject(err) : resolve()));
        });

        let webpBuf = fs.readFileSync(outputPath);
        webpBuf = await addStickerExif(webpBuf, "RFK MODS", "RFK സൈബർ ചെകുത്താൻ");

        await sock.sendMessage(jid, { sticker: webpBuf }, { quoted: msg });
      } catch (e) {
        await send("❌ *Sticker conversion failed! Make sure `ffmpeg` is installed.*");
      } finally {
        try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
        try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
      }
    }
  }
};

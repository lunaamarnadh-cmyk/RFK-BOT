const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const STYLE_DB = path.join(__dirname, "..", ".rfk_menu_style.json");
const MEDIA_DIR = path.join(__dirname, "..", "database");
const CUSTOM_VID = path.join(MEDIA_DIR, "menu_video.mp4");
const CUSTOM_IMG = path.join(MEDIA_DIR, "menu_image.jpg");

function getMenuConfig() {
  try {
    if (fs.existsSync(STYLE_DB)) {
      return JSON.parse(fs.readFileSync(STYLE_DB, "utf8"));
    }
  } catch {}
  return { style: 1, mediaUrl: "" };
}

function saveMenuConfig(cfg) {
  try {
    fs.writeFileSync(STYLE_DB, JSON.stringify(cfg, null, 2));
  } catch {}
}

// Auto-detect original menu video/image URL or local path from index.js or other plugins
function detectOriginalMenuMedia() {
  try {
    const rootDir = path.join(__dirname, "..");
    const filesToScan = [path.join(rootDir, "index.js")];
    const pluginsDir = path.join(rootDir, "plugins");
    if (fs.existsSync(pluginsDir)) {
      for (const f of fs.readdirSync(pluginsDir)) {
        if (f !== "menu_manager.js" && f.endsWith(".js")) {
          filesToScan.push(path.join(pluginsDir, f));
        }
      }
    }

    for (const file of filesToScan) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      // Check for video URL in menu block
      const vidUrlMatch = content.match(/video\s*:\s*\{\s*url\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/i);
      if (vidUrlMatch) return { type: "video", url: vidUrlMatch[1] };

      // Check for any mp4/catbox/github media URL
      const anyMp4 = content.match(/["'`](https?:\/\/[^"'`]+\.(?:mp4|gif|mov)(?:\?[^"'`]*)?)["'`]/i);
      if (anyMp4) return { type: "video", url: anyMp4[1] };

      // Check for image URL in menu block
      const imgUrlMatch = content.match(/image\s*:\s*\{\s*url\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/i);
      if (imgUrlMatch && /menu|alive|rfk/i.test(content)) {
        return { type: "image", url: imgUrlMatch[1] };
      }

      // Check local media files
      const localVid = content.match(/fs\.readFileSync\(["'`]([^"'`]+\.mp4)["'`]\)/i);
      if (localVid) {
        const resolved = path.resolve(path.dirname(file), localVid[1]);
        if (fs.existsSync(resolved)) return { type: "video", path: resolved };
      }
    }
  } catch {}
  return null;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

const MENU_SECTIONS = [
  {
    title: "🛡️ GROUP PROTECTION",
    cmds: [
      ".antilink on/off",
      ".antibot on/off",
      ".antitag on/off",
      ".antibadword on/off",
      ".antigroupmention on/off",
      ".welcome on/off"
    ]
  },
  {
    title: "👮 GROUP ADMIN TOOLS",
    cmds: [
      ".kick @user",
      ".delete / .del",
      ".resetwarn"
    ]
  },
  {
    title: "📥 DOWNLOADERS",
    cmds: [
      ".song <name/link>",
      ".video <name/link>",
      ".fb <link>",
      ".tiktok <link>",
      ".twitter <link>"
    ]
  },
  {
    title: "🤖 AI & MEDIA TOOLS",
    cmds: [
      ".ai <question>",
      ".sticker / .s",
      ".vv (View-Once Reveal)",
      ".tempmail / .checkmail",
      ".delmail"
    ]
  },
  {
    title: "👑 OWNER & AUTO SETTINGS",
    cmds: [
      ".antiviewonce on/off",
      ".autostatus on/off",
      ".antidelete on/off",
      ".anticall on/off",
      ".autoreact on/off",
      ".autotyping on/off",
      ".autoread on/off",
      ".pmblock on/off",
      ".menustyle <1-5>",
      ".setmenuvid (Reply video)",
      ".update / .updatenow",
      ".alive"
    ]
  }
];

function renderMenu(style, info) {
  const { userName, uptime, ram, dateStr, timeStr } = info;

  if (style === 2) {
    let txt =
      `✨ *RFK-BOT — MODERN MENU*\n` +
      `👤 User: *${userName}*\n` +
      `⏱️ Uptime: *${uptime}* | 💾 RAM: *${ram} MB*\n` +
      `📅 ${dateStr} • ${timeStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n`;
    for (const sec of MENU_SECTIONS) {
      txt += `*${sec.title}*\n`;
      txt += sec.cmds.map((c) => `  ◦ \`${c}\``).join("\n") + "\n\n";
    }
    txt += `_Use .menustyle <1-5> to change theme_`;
    return txt.trim();
  }

  if (style === 3) {
    let txt =
      `╔══════════════════════╗\n` +
      `║   👑 *RFK MODS BOT* 👑   ║\n` +
      `╠══════════════════════╣\n` +
      `║ 👤 *User:* ${userName}\n` +
      `║ ⏱️ *Uptime:* ${uptime}\n` +
      `║ 💾 *RAM:* ${ram} MB\n` +
      `╚══════════════════════╝\n\n`;
    for (const sec of MENU_SECTIONS) {
      txt += `╔══[ *${sec.title}* ]\n`;
      txt += sec.cmds.map((c) => `║ ◈ ${c}`).join("\n") + "\n";
      txt += `╚══════════════════\n\n`;
    }
    txt += `> *© RFK സൈബർ ചെകുത്താൻ*`;
    return txt.trim();
  }

  if (style === 4) {
    let txt = `⚡ *RFK-BOT COMMAND LIST* ⚡\n_Hello ${userName}! (${uptime})_\n\n`;
    for (const sec of MENU_SECTIONS) {
      txt += `*${sec.title}:*\n${sec.cmds.join("  •  ")}\n\n`;
    }
    txt += `_Tip: Type .menustyle 1 to 5 to switch layouts._`;
    return txt.trim();
  }

  if (style === 5) {
    let txt =
      "```" +
      `[ SYSTEM: RFK-BOT v2.0 ]\n` +
      `[ USER  : ${userName} ]\n` +
      `[ UPTIME: ${uptime} | RAM: ${ram}MB ]\n` +
      `====================================\n\n`;
    for (const sec of MENU_SECTIONS) {
      txt += `>> ${sec.title}\n`;
      txt += sec.cmds.map((c) => `   $ ${c}`).join("\n") + "\n\n";
    }
    txt += `====================================\n` + "```";
    return txt.trim();
  }

  // Style 1 (Default): Cyber Devil Box
  let txt =
    `╭━━━━━━━━━━━━━━━━━━━━╮\n` +
    `┃  😈 *RFK-BOT MENU* 😈  ┃\n` +
    `╰━━━━━━━━━━━━━━━━━━━━╯\n` +
    `╭────────────────────╮\n` +
    `│ 👤 *User:* ${userName}\n` +
    `│ 👑 *Edition:* RFK MODS\n` +
    `│ ⏱️ *Uptime:* ${uptime}\n` +
    `│ 💾 *RAM:* ${ram} MB\n` +
    `│ 📅 *Date:* ${dateStr}\n` +
    `╰────────────────────╯\n\n`;

  for (const sec of MENU_SECTIONS) {
    txt += `╭─「 *${sec.title}* 」\n`;
    txt += sec.cmds.map((c) => `│ ➢ \`${c}\``).join("\n") + "\n";
    txt += `╰────────────────────\n\n`;
  }
  txt += `🎨 *Change Style:* \`.menustyle 1\` to \`5\`\n> *Powered by RFK സൈബർ ചെകുത്താൻ*`;
  return txt.trim();
}

module.exports = {
  pattern: "menu",
  alias: ["help", "list", "commands", "menustyle", "setmenu", "setmenuvid", "setmenuimg"],
  type: "general",
  desc: "Display video menu (.menu), switch menu styles (.menustyle 1-5), or set custom menu video (.setmenuvid)",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.videoMessage?.caption ||
      msg.message?.imageMessage?.caption ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim();

    // 1. Set Custom Menu Video or Image (.setmenuvid / .setmenuimg)
    if (cmdName === "setmenuvid" || cmdName === "setmenuimg") {
      if (!isOwner) return send("❌ *Only Bot Owner can change the menu video/image!*");

      const cfg = getMenuConfig();
      if (arg && /^https?:\/\//i.test(arg)) {
        cfg.mediaUrl = arg;
        cfg.mediaType = cmdName === "setmenuimg" ? "image" : "video";
        saveMenuConfig(cfg);
        return send("✅ *Menu media URL updated successfully!*");
      }

      let targetMsg = msg;
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (ctx?.quotedMessage) {
        targetMsg = {
          key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant },
          message: ctx.quotedMessage
        };
      }

      const isVid = Boolean(targetMsg.message?.videoMessage);
      const isImg = Boolean(targetMsg.message?.imageMessage);
      if (!isVid && !isImg) {
        return send("🎬 *Reply to a video or photo with `.setmenuvid` (or pass a direct URL) to set it as the menu video!*");
      }

      try {
        if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
        const buf = await downloadMediaMessage(
          targetMsg,
          "buffer",
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        if (isVid) {
          fs.writeFileSync(CUSTOM_VID, buf);
          if (fs.existsSync(CUSTOM_IMG)) fs.unlinkSync(CUSTOM_IMG);
          return send("✅ *Custom Menu Video saved! Type `.menu` to see it.*");
        } else {
          fs.writeFileSync(CUSTOM_IMG, buf);
          if (fs.existsSync(CUSTOM_VID)) fs.unlinkSync(CUSTOM_VID);
          return send("✅ *Custom Menu Image saved! Type `.menu` to see it.*");
        }
      } catch (e) {
        return send(`❌ *Failed to save menu media:* ${e.message}`);
      }
    }

    // 2. Switch Menu Style (.menustyle 1-5)
    if (cmdName === "menustyle" || cmdName === "setmenu") {
      if (!isOwner) return send("❌ *Only Bot Owner can change the global menu style!*");
      const num = parseInt(arg, 10);
      if (![1, 2, 3, 4, 5].includes(num)) {
        const cur = getMenuConfig().style || 1;
        return send(
          `🎨 *RFK-BOT MENU STYLES*\n\n` +
          `Current Style: *#${cur}*\n\n` +
          `1️⃣ *Cyber Devil Box* (Default)\n` +
          `2️⃣ *Modern Minimal*\n` +
          `3️⃣ *Royal Double Border*\n` +
          `4️⃣ *Compact Bullet*\n` +
          `5️⃣ *Hacker Terminal*\n\n` +
          `📌 *Usage:* \`.menustyle 2\``
        );
      }
      const cfg = getMenuConfig();
      cfg.style = num;
      saveMenuConfig(cfg);
      return send(`✅ *Menu Style updated to Style #${num}!*\nType *\`.menu\`* to preview the new look.`);
    }

    // 3. Render & Send Menu WITH Video/Image
    const now = new Date();
    const info = {
      userName: msg.pushName || "User",
      uptime: formatUptime(process.uptime()),
      ram: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      dateStr: now.toLocaleDateString("en-IN"),
      timeStr: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    };

    const cfg = getMenuConfig();
    const menuText = renderMenu(cfg.style || 1, info);

    try {
      if (fs.existsSync(CUSTOM_VID)) {
        return await sock.sendMessage(
          jid,
          { video: fs.readFileSync(CUSTOM_VID), caption: menuText, gifPlayback: true },
          { quoted: msg }
        );
      }
      if (fs.existsSync(CUSTOM_IMG)) {
        return await sock.sendMessage(
          jid,
          { image: fs.readFileSync(CUSTOM_IMG), caption: menuText },
          { quoted: msg }
        );
      }
      if (cfg.mediaUrl) {
        const key = cfg.mediaType === "image" ? "image" : "video";
        return await sock.sendMessage(
          jid,
          { [key]: { url: cfg.mediaUrl }, caption: menuText, ...(key === "video" ? { gifPlayback: true } : {}) },
          { quoted: msg }
        );
      }

      const detected = detectOriginalMenuMedia();
      if (detected) {
        if (detected.path) {
          return await sock.sendMessage(
            jid,
            { video: fs.readFileSync(detected.path), caption: menuText, gifPlayback: true },
            { quoted: msg }
          );
        }
        if (detected.url) {
          const isImg = detected.type === "image";
          return await sock.sendMessage(
            jid,
            {
              [isImg ? "image" : "video"]: { url: detected.url },
              caption: menuText,
              ...(!isImg ? { gifPlayback: true } : {})
            },
            { quoted: msg }
          );
        }
      }
    } catch {}

    return send(menuText);
  }
};

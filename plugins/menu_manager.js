const fs = require("fs");
const path = require("path");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

const STYLE_DB = path.join(__dirname, "..", ".rfk_menu_style.json");
const MEDIA_DIR = path.join(__dirname, "..", "database", "user_menus");

function getMenuConfig() {
  try {
    if (fs.existsSync(STYLE_DB)) {
      const parsed = JSON.parse(fs.readFileSync(STYLE_DB, "utf8"));
      return {
        defaultStyle: parsed.defaultStyle || parsed.style || 1,
        defaultMediaUrl: parsed.defaultMediaUrl || parsed.mediaUrl || "",
        defaultMediaType: parsed.defaultMediaType || parsed.mediaType || "video",
        users: parsed.users || {}
      };
    }
  } catch {}
  return { defaultStyle: 1, defaultMediaUrl: "", defaultMediaType: "video", users: {} };
}

function saveMenuConfig(cfg) {
  try {
    fs.writeFileSync(STYLE_DB, JSON.stringify(cfg, null, 2));
  } catch {}
}

function cleanUserKey(jid) {
  return (jid || "").split(":")[0].split("@")[0].replace(/\D/g, "") || "default";
}

// Auto-detect original bot menu video/image URL or local path from index.js or other plugins
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

      const vidUrlMatch = content.match(/video\s*:\s*\{\s*url\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/i);
      if (vidUrlMatch) return { type: "video", url: vidUrlMatch[1] };

      const anyMp4 = content.match(/["'`](https?:\/\/[^"'`]+\.(?:mp4|gif|mov)(?:\?[^"'`]*)?)["'`]/i);
      if (anyMp4) return { type: "video", url: anyMp4[1] };

      const imgUrlMatch = content.match(/image\s*:\s*\{\s*url\s*:\s*["'`](https?:\/\/[^"'`]+)["'`]/i);
      if (imgUrlMatch && /menu|alive|rfk/i.test(content)) {
        return { type: "image", url: imgUrlMatch[1] };
      }

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
    title: "🎨 CUSTOMIZE YOUR MENU",
    cmds: [
      ".menustyle <1-5> (Your theme)",
      ".setmenuvid (Reply to any video)",
      ".setmenuimg (Reply to any photo)",
      ".resetmenu (Restore default video)"
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
      ".antiownerkick on/off",
      ".setprefix any/null",
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
    txt += `_Use .menustyle <1-5> or .setmenuvid to customize your own menu!_`;
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
    txt += `_Tip: Reply any video with .setmenuvid to set your own menu video!_`;
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
  txt += `🎨 *Customize:* \`.menustyle 1-5\` | \`.setmenuvid\`\n> *Powered by RFK സൈബർ ചെകുത്താൻ*`;
  return txt.trim();
}

module.exports = {
  pattern: "menu",
  alias: ["help", "list", "commands", "menustyle", "setmenu", "setmenuvid", "setmenuimg", "resetmenu"],
  type: "general",
  desc: "Display video menu (.menu) and let any user customize their own menu video/style (.setmenuvid / .menustyle)",
  async execute({ sock, msg, jid, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const senderJid = msg.key.participant || jid;
    const userKey = cleanUserKey(senderJid);

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.videoMessage?.caption ||
      msg.message?.imageMessage?.caption ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#?$~*+-]+/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim();

    const cfg = getMenuConfig();
    if (!cfg.users[userKey]) cfg.users[userKey] = {};

    // 1. Reset User's Custom Menu back to Default Video (.resetmenu)
    if (cmdName === "resetmenu") {
      delete cfg.users[userKey];
      saveMenuConfig(cfg);
      try {
        const uVid = path.join(MEDIA_DIR, `${userKey}.mp4`);
        const uImg = path.join(MEDIA_DIR, `${userKey}.jpg`);
        if (fs.existsSync(uVid)) fs.unlinkSync(uVid);
        if (fs.existsSync(uImg)) fs.unlinkSync(uImg);
      } catch {}
      return send("✅ *Your menu has been reset to the default RFK-BOT video & theme!*");
    }

    // 2. Set Personal Menu Video or Image (.setmenuvid / .setmenuimg) - Open to ALL users!
    if (cmdName === "setmenuvid" || cmdName === "setmenuimg") {
      if (arg && /^https?:\/\//i.test(arg)) {
        cfg.users[userKey].mediaUrl = arg;
        cfg.users[userKey].mediaType = cmdName === "setmenuimg" ? "image" : "video";
        saveMenuConfig(cfg);
        return send("✅ *Your personal menu media URL has been updated!*\nType `menu` to view it.");
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
        return send("🎬 *Reply to any video or photo with `.setmenuvid` (or pass a direct URL) to set it as YOUR personal menu video!*");
      }

      try {
        if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
        const buf = await downloadMediaMessage(
          targetMsg,
          "buffer",
          {},
          { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );
        const uVid = path.join(MEDIA_DIR, `${userKey}.mp4`);
        const uImg = path.join(MEDIA_DIR, `${userKey}.jpg`);

        if (isVid) {
          fs.writeFileSync(uVid, buf);
          if (fs.existsSync(uImg)) fs.unlinkSync(uImg);
          cfg.users[userKey].customFile = "video";
          saveMenuConfig(cfg);
          return send("✅ *Your personal Menu Video is saved!*\nType `menu` or `.menu` to see your custom video menu!");
        } else {
          fs.writeFileSync(uImg, buf);
          if (fs.existsSync(uVid)) fs.unlinkSync(uVid);
          cfg.users[userKey].customFile = "image";
          saveMenuConfig(cfg);
          return send("✅ *Your personal Menu Photo is saved!*\nType `menu` or `.menu` to see your custom photo menu!");
        }
      } catch (e) {
        return send(`❌ *Failed to save your menu media:* ${e.message}`);
      }
    }

    // 3. Switch Personal Menu Style (.menustyle 1-5) - Open to ALL users!
    if (cmdName === "menustyle" || cmdName === "setmenu") {
      const num = parseInt(arg, 10);
      const cur = cfg.users[userKey]?.style || cfg.defaultStyle || 1;
      if (![1, 2, 3, 4, 5].includes(num)) {
        return send(
          `🎨 *CUSTOMIZE YOUR MENU STYLE*\n\n` +
          `Your Current Style: *#${cur}*\n\n` +
          `1️⃣ *Cyber Devil Box* (Default)\n` +
          `2️⃣ *Modern Minimal*\n` +
          `3️⃣ *Royal Double Border*\n` +
          `4️⃣ *Compact Bullet*\n` +
          `5️⃣ *Hacker Terminal*\n\n` +
          `📌 *Usage:* \`.menustyle 2\` (Changes only YOUR menu!)`
        );
      }
      cfg.users[userKey].style = num;
      saveMenuConfig(cfg);
      return send(`✅ *Your personal Menu Style updated to Style #${num}!*\nType \`menu\` to preview.`);
    }

    // 4. Render & Send Menu (User's Custom Media -> Fallback to Bot Owner's Default Video)
    const now = new Date();
    const info = {
      userName: msg.pushName || "User",
      uptime: formatUptime(process.uptime()),
      ram: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      dateStr: now.toLocaleDateString("en-IN"),
      timeStr: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    };

    const userPref = cfg.users[userKey] || {};
    const activeStyle = userPref.style || cfg.defaultStyle || 1;
    const menuText = renderMenu(activeStyle, info);

    try {
      // A. Check User's Personal Uploaded Video/Image
      const uVid = path.join(MEDIA_DIR, `${userKey}.mp4`);
      const uImg = path.join(MEDIA_DIR, `${userKey}.jpg`);
      if (fs.existsSync(uVid)) {
        return await sock.sendMessage(
          jid,
          { video: fs.readFileSync(uVid), caption: menuText, gifPlayback: true },
          { quoted: msg }
        );
      }
      if (fs.existsSync(uImg)) {
        return await sock.sendMessage(
          jid,
          { image: fs.readFileSync(uImg), caption: menuText },
          { quoted: msg }
        );
      }

      // B. Check User's Personal Media URL
      if (userPref.mediaUrl) {
        const key = userPref.mediaType === "image" ? "image" : "video";
        return await sock.sendMessage(
          jid,
          { [key]: { url: userPref.mediaUrl }, caption: menuText, ...(key === "video" ? { gifPlayback: true } : {}) },
          { quoted: msg }
        );
      }

      // C. Fallback to Bot's Original Default Video/Image
      if (cfg.defaultMediaUrl) {
        const key = cfg.defaultMediaType === "image" ? "image" : "video";
        return await sock.sendMessage(
          jid,
          { [key]: { url: cfg.defaultMediaUrl }, caption: menuText, ...(key === "video" ? { gifPlayback: true } : {}) },
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

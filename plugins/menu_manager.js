const fs = require("fs");
const path = require("path");

const STYLE_DB = path.join(__dirname, "..", ".rfk_menu_style.json");

function getMenuStyle() {
  try {
    if (fs.existsSync(STYLE_DB)) {
      return JSON.parse(fs.readFileSync(STYLE_DB, "utf8")).style || 1;
    }
  } catch {}
  return 1;
}

function setMenuStyle(styleNum) {
  try {
    fs.writeFileSync(STYLE_DB, JSON.stringify({ style: styleNum }, null, 2));
  } catch {}
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
      ".update / .updatenow",
      ".alive"
    ]
  }
];

function renderMenu(style, info) {
  const { userName, uptime, ram, dateStr, timeStr } = info;

  if (style === 2) {
    // Style 2: Modern Minimal
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
    // Style 3: Royal Double Border
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
    // Style 4: Compact Bullet
    let txt = `⚡ *RFK-BOT COMMAND LIST* ⚡\n_Hello ${userName}! (${uptime})_\n\n`;
    for (const sec of MENU_SECTIONS) {
      txt += `*${sec.title}:*\n${sec.cmds.join("  •  ")}\n\n`;
    }
    txt += `_Tip: Type .menustyle 1 to 5 to switch layouts._`;
    return txt.trim();
  }

  if (style === 5) {
    // Style 5: Hacker / Terminal
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
  alias: ["help", "list", "commands", "menustyle", "setmenu"],
  type: "general",
  desc: "Display all bot commands (.menu) and switch menu themes (.menustyle 1-5)",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim();

    if (cmdName === "menustyle" || cmdName === "setmenu") {
      if (!isOwner) return send("❌ *Only Bot Owner can change the global menu style!*");
      const num = parseInt(arg, 10);
      if (![1, 2, 3, 4, 5].includes(num)) {
        const cur = getMenuStyle();
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
      setMenuStyle(num);
      return send(`✅ *Menu Style updated to Style #${num}!*\nType *\`.menu\`* to preview the new look.`);
    }

    const now = new Date();
    const info = {
      userName: msg.pushName || "User",
      uptime: formatUptime(process.uptime()),
      ram: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
      dateStr: now.toLocaleDateString("en-IN"),
      timeStr: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    };

    const style = getMenuStyle();
    const menuText = renderMenu(style, info);
    return send(menuText);
  }
};

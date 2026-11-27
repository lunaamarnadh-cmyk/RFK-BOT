const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_prefix.json");

function loadPrefixConfig() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  // Default: "any" allows both NO-PREFIX (menu, ping) AND any symbol (.menu, !menu, #menu, /menu)
  return { mode: "any", custom: "." };
}

function savePrefixConfig(cfg) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(cfg, null, 2));
  } catch {}
}

// Collect all known command names from plugins folder so normal chat messages aren't triggered accidentally
function getKnownCommands() {
  if (global._rfkKnownCommands && global._rfkKnownCommands.size > 0) {
    return global._rfkKnownCommands;
  }
  const cmds = new Set([
    "menu", "help", "list", "alive", "ping", "runtime", "owner", "mode",
    "vv", "antiviewonce", "antiviewones", "antiownerkick", "unbanattacker",
    "antilink", "antibot", "antitag", "antibadword", "antigroupmention", "agm",
    "antidelete", "anticall", "autostatus", "autoreact", "autotyping", "autoread",
    "pmblock", "welcome", "kick", "remove", "delete", "del", "dlt",
    "promote", "demote", "mute", "unmute", "tag", "tagall", "invite", "revoke",
    "warn", "add", "join", "left", "gname", "gdesc", "ginfo", "fullpp", "fullgpp",
    "pp", "block", "unblock", "setname", "setbio", "whois", "jid", "forward", "save",
    "song", "video", "ytv", "yta", "insta", "fb", "tiktok", "twitter", "spotify",
    "sticker", "s", "trt", "fancy", "mp3", "ptt", "photo", "circle", "gif", "trim",
    "tts", "mtts", "enhance", "hd", "mee", "tempmail", "checkmail", "inbox", "delmail",
    "url", "chatgpt", "ai", "manorama", "gitinfo", "waifu", "find",
    "menustyle", "setmenuvid", "setmenuimg", "setprefix", "prefix",
    "update", "updatenow", "restart", "version", "setversion",
    "setsudo", "delsudo", "getsudo", "setbotname", "setimg", "autosave",
    "antifake", "antiword", "mention", "resetwarn"
  ]);

  try {
    const pluginsDir = __dirname;
    for (const file of fs.readdirSync(pluginsDir)) {
      if (!file.endsWith(".js")) continue;
      const content = fs.readFileSync(path.join(pluginsDir, file), "utf8");
      const patMatches = content.matchAll(/(?:pattern|cmdName|command)\s*[:=]\s*["'`]([a-zA-Z0-9_-]+)["'`]/g);
      for (const m of patMatches) cmds.add(m[1].toLowerCase());
      const aliasMatches = content.matchAll(/alias\s*:\s*\[([^\]]+)\]/g);
      for (const m of aliasMatches) {
        const items = m[1].matchAll(/["'`]([a-zA-Z0-9_-]+)["'`]/g);
        for (const it of items) cmds.add(it[1].toLowerCase());
      }
    }
  } catch {}

  global._rfkKnownCommands = cmds;
  return cmds;
}

// Normalize incoming message text according to active prefix setting before index.js processes it
function normalizeMessagePrefix(msg) {
  try {
    if (!msg || !msg.message) return;
    const cfg = loadPrefixConfig();
    const known = getKnownCommands();

    const extractAndRewrite = (rawText) => {
      if (!rawText || typeof rawText !== "string") return null;
      const trimmed = rawText.trim();
      if (!trimmed) return null;

      const firstWord = trimmed.split(/\s+/)[0];
      const rest = trimmed.slice(firstWord.length);

      // Mode 1: "null" (Strict No-Prefix: only "menu", "ping" without symbols)
      if (cfg.mode === "null") {
        const cleanWord = firstWord.toLowerCase();
        if (known.has(cleanWord)) {
          return "." + firstWord + rest;
        }
        return null;
      }

      // Mode 2: "custom" (e.g. "!", "#", "..")
      if (cfg.mode === "custom" && cfg.custom) {
        if (firstWord.startsWith(cfg.custom)) {
          const cmdPart = firstWord.slice(cfg.custom.length);
          if (cmdPart && known.has(cmdPart.toLowerCase())) {
            return "." + cmdPart + rest;
          }
        }
        return null;
      }

      // Mode 3: "any" (Works BOTH without prefix "menu" AND with any symbol ".menu", "!menu", "#menu", "/menu")
      const stripped = firstWord.replace(/^[.!\/#?$~*+-]+/, "");
      if (stripped && known.has(stripped.toLowerCase()) && !firstWord.startsWith(".")) {
        return "." + stripped + rest;
      }
      return null;
    };

    if (msg.message.conversation) {
      const updated = extractAndRewrite(msg.message.conversation);
      if (updated) msg.message.conversation = updated;
    } else if (msg.message.extendedTextMessage?.text) {
      const updated = extractAndRewrite(msg.message.extendedTextMessage.text);
      if (updated) msg.message.extendedTextMessage.text = updated;
    } else if (msg.message.imageMessage?.caption) {
      const updated = extractAndRewrite(msg.message.imageMessage.caption);
      if (updated) msg.message.imageMessage.caption = updated;
    } else if (msg.message.videoMessage?.caption) {
      const updated = extractAndRewrite(msg.message.videoMessage.caption);
      if (updated) msg.message.videoMessage.caption = updated;
    }
  } catch {}
}

global._rfkNormalizePrefix = normalizeMessagePrefix;

module.exports = {
  pattern: "setprefix",
  alias: ["prefix", "noprefix"],
  type: "owner",
  desc: "Allow commands without prefix (null) or with any custom prefix (.setprefix any | null | !)",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const parts = raw.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim();

    const cfg = loadPrefixConfig();

    if (cmdName === "noprefix") {
      cfg.mode = "any";
      savePrefixConfig(cfg);
      return send("✅ *No-Prefix + All-Prefix Mode ENABLED!*\n_Now you can type `menu` directly OR `.menu`, `!menu`, `#menu`, `/menu`!_");
    }

    if (!arg) {
      const descMode =
        cfg.mode === "null"
          ? "NO-PREFIX ONLY (`menu`, `ping`)"
          : cfg.mode === "any"
          ? "NO-PREFIX + ANY SYMBOL (`menu`, `.menu`, `!menu`, `#menu`)"
          : `CUSTOM (\`${cfg.custom}\`)`;

      return send(
        `⚙️ *RFK-BOT PREFIX SETTINGS*\n\n` +
        `• *Current Mode:* ${descMode}\n\n` +
        `*How to change:*\n` +
        `• \`setprefix any\` — Works without prefix (\`menu\`) & with any symbol (\`.menu\`, \`!menu\`)\n` +
        `• \`setprefix null\` — Works ONLY without prefix (\`menu\`, \`ping\`)\n` +
        `• \`setprefix .\` — Works only with \`.\`\n` +
        `• \`setprefix !\` — Works only with \`!\``
      );
    }

    const low = arg.toLowerCase();
    if (low === "null" || low === "none" || low === "off") {
      cfg.mode = "null";
      savePrefixConfig(cfg);
      return send("✅ *Prefix set to `null` (No-Prefix Mode)!*\n_Type `menu`, `ping`, `song` directly without any symbol._");
    }

    if (low === "any" || low === "all") {
      cfg.mode = "any";
      savePrefixConfig(cfg);
      return send("✅ *Prefix set to `ANY` (Flexible Mode)!*\n_Users can type `menu` directly OR use `.`, `!`, `#`, `/` as they like!_");
    }

    cfg.mode = "custom";
    cfg.custom = arg;
    savePrefixConfig(cfg);
    return send(`✅ *Custom Prefix updated to:* \`${arg}\`\n_Example: \`${arg}menu\`, \`${arg}ping\`_`);
  }
};

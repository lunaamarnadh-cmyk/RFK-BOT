const fs = require("fs");
const path = require("path");

const STYLE_DB = path.join(__dirname, "..", ".rfk_menu_style.json");

module.exports = {
  pattern: "menustyle",
  alias: ["setmenu"],
  type: "owner",
  desc: "Switch menu theme (1-5) while keeping the original menu video & all 170+ commands",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
    if (!isOwner) return send("❌ *Only Bot Owner can change the menu style!*");

    const raw = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
    const arg = (text || raw.split(/\s+/)[1] || "").trim();
    const num = parseInt(arg, 10);

    if (![1, 2, 3, 4, 5].includes(num)) {
      let cur = 1;
      try { cur = JSON.parse(fs.readFileSync(STYLE_DB, "utf8")).style || 1; } catch {}
      return send(
        `🎨 *RFK-BOT MENU STYLES (Video Kept Intact)*\n\n` +
        `Current Style: *#${cur}*\n\n` +
        `1️⃣ *Original Cyber Box* (Default)\n` +
        `2️⃣ *Clean Modern*\n` +
        `3️⃣ *Royal Double Border*\n` +
        `4️⃣ *Minimalist Bullet*\n` +
        `5️⃣ *Monospace Terminal*\n\n` +
        `📌 *Usage:* \`.menustyle 2\``
      );
    }

    fs.writeFileSync(STYLE_DB, JSON.stringify({ style: num }, null, 2));
    return send(`✅ *Menu Style changed to #${num}!*\nType *\`.menu\`* — your original video & all commands will remain intact!`);
  }
};

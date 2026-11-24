const fs = require("fs");
const path = require("path");

const sudoPath = path.join(__dirname, "sudo_users.json");
if (!fs.existsSync(sudoPath)) {
    fs.writeFileSync(sudoPath, JSON.stringify([], null, 2));
}

function getSudo() {
    try { return JSON.parse(fs.readFileSync(sudoPath, "utf8")); } catch { return []; }
}

module.exports = [
    // 1. .setsudo
    {
        pattern: "setsudo",
        type: "owner",
        async execute({ msg, text, reply, isOwner }) {
            if (!isOwner) return;
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant ||
                           msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                           (text ? `${text.replace(/[^0-9]/g, "")}@s.whatsapp.net` : null);
            if (!target) return reply("❌ സുഡോ ആക്കേണ്ട ആളുടെ മെസ്സേജിന് റിപ്ലൈ നൽകുകയോ നമ്പർ നൽകുകയോ ചെയ്യുക!");

            const list = getSudo();
            if (!list.includes(target)) {
                list.push(target);
                fs.writeFileSync(sudoPath, JSON.stringify(list, null, 2));
            }
            reply(`✅ @${target.split("@")[0]} ഇപ്പോൾ ബോട്ടിന്റെ **SUDO USER** ആണ്!`);
        }
    },

    // 2. .delsudo
    {
        pattern: "delsudo",
        type: "owner",
        async execute({ msg, text, reply, isOwner }) {
            if (!isOwner) return;
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant ||
                           (text ? `${text.replace(/[^0-9]/g, "")}@s.whatsapp.net` : null);
            if (!target) return reply("❌ സുഡോയിൽ നിന്ന് മാറ്റേണ്ട നമ്പർ നൽകുക!");

            const list = getSudo().filter(u => u !== target);
            fs.writeFileSync(sudoPath, JSON.stringify(list, null, 2));
            reply(`❌ @${target.split("@")[0]} സുഡോ ലിസ്റ്റിൽ നിന്ന് മാറ്റി!`);
        }
    },

    // 3. .getsudo
    {
        pattern: "getsudo",
        type: "owner",
        async execute({ reply }) {
            const list = getSudo();
            if (list.length === 0) return reply("📋 *SUDO LIST:* ആരെയും ആഡ് ചെയ്തിട്ടില്ല.");
            reply(`📋 *SUDO USERS:*\n\n` + list.map((u, i) => `${i + 1}. +${u.split("@")[0]}`).join("\n"));
        }
    },

    // 4. .runtime / .uptime
    {
        pattern: "runtime",
        alias: ["uptime"],
        type: "main",
        async execute({ reply }) {
            const sec = Math.floor(process.uptime());
            const d = Math.floor(sec / 86400);
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            reply(`⏳ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 RUNTIME:*\n*${d}d ${h}h ${m}m ${s}s*`);
        }
    }
];

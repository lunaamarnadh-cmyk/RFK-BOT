const fs = require("fs");
const path = require("path");

const STATUS_FILE = path.join(__dirname, "../autostatus.json");

function getStatusConfig() {
    if (fs.existsSync(STATUS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
        } catch {}
    }
    return { enabled: true };
}

function saveStatusConfig(data) {
    fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

module.exports = [
    {
        on: "status",
        async execute({ sock, msg }) {
            const cfg = getStatusConfig();
            if (!cfg.enabled) return;
            if (msg.key.fromMe) return;

            try {
                await sock.readMessages([msg.key]);
            } catch (err) {
                console.error("Auto status view error:", err.message);
            }
        }
    },
    {
        pattern: "autostatus",
        alias: ["statusview", "asv"],
        type: "owner",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            const cfg = getStatusConfig();
            const arg = (text || "").trim().toLowerCase();

            if (arg === "on") {
                cfg.enabled = true;
                saveStatusConfig(cfg);
                return reply("✅ *Auto Status View ON ആക്കിയിട്ടുണ്ട്!*");
            }
            if (arg === "off") {
                cfg.enabled = false;
                saveStatusConfig(cfg);
                return reply("❌ *Auto Status View OFF ആക്കിയിട്ടുണ്ട്!*");
            }

            return reply(
                `👁️ *Auto Status View:* ${cfg.enabled ? "ON ✅" : "OFF ❌"}\n\n` +
                `*ഉപയോഗം:*\n` +
                `• \`autostatus on\` (ഓൺ ആക്കാൻ)\n` +
                `• \`autostatus off\` (ഓഫ് ആക്കാൻ)`
            );
        }
    }
];

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../bot_settings.json");

function getBotName() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
            if (data.botName) return data.botName;
        }
    } catch (e) {}
    return process.env.BOT_NAME || "乂 𝐑𝐅𝐊 𝐁𝐎𝐓 乂";
}

function saveBotName(name) {
    let data = {};
    try {
        if (fs.existsSync(DB_PATH)) {
            data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
        }
    } catch (e) {}
    data.botName = name;
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = [
    {
        pattern: "setbotname",
        alias: ["botname", "setbname"],
        type: "owner",
        async execute({ text, reply }) {
            const newName = text ? text.trim() : "";
            if (!newName) {
                return reply(
                    `📌 *നിലവിലെ ബോട്ടിന്റെ പേര്:* ${getBotName()}\n\n` +
                    `*മാറ്റാൻ:* \`.setbotname പുതിയ പേര്\``
                );
            }

            saveBotName(newName);
            process.env.BOT_NAME = newName;

            return reply(`✅ *ബോട്ടിന്റെ പേര് വിജയകരമായി മാറ്റി!*\n\n*പുതിയ പേര്:* ${newName}`);
        }
    }
];

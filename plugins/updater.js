const { exec } = require("child_process");

function runCmd(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout.trim());
        });
    });
}

module.exports = [
    // 1. .update (Check for new GitHub updates)
    {
        pattern: "update",
        type: "owner",
        async execute({ reply, isOwner }) {
            if (!isOwner) return;
            await reply("🔍 *Checking for updates from GitHub...*");

            try {
                await runCmd("git fetch origin main");
                const logs = await runCmd("git log HEAD..origin/main --oneline");

                if (!logs) {
                    return reply("✅ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 ഇതിനകം ഏറ്റവും പുതിയ വേർഷനിലാണ്!* (No new updates)");
                }

                reply(`🆕 *NEW UPDATES AVAILABLE!*\n\n📝 *Changes:*\n${logs}\n\n⚡ ഇപ്പോൾ തന്നെ അപ്‌ഡേറ്റ് ചെയ്യാൻ \`.updatenow\` എന്ന് അയക്കുക!`);
            } catch (err) {
                reply(`❌ *Update Check Error:* ${err.message}\n\n*(ശ്രദ്ധിക്കുക: Render/Railway പോലുള്ള ക്ലൗഡ് പ്ലാറ്റ്‌ഫോമുകളിൽ GitHub-ൽ Commit ചെയ്താൽ തന്നെ ഓട്ടോമാറ്റിക് ആയി അപ്‌ഡേറ്റ് ആകുന്നതാണ്).*`);
            }
        }
    },

    // 2. .updatenow (Pull updates & Restart bot)
    {
        pattern: "updatenow",
        alias: ["upd"],
        type: "owner",
        async execute({ reply, isOwner }) {
            if (!isOwner) return;
            await reply("⏳ *Downloading updates & restarting bot...*");

            try {
                await runCmd("git pull origin main");
                await reply("✅ *Update Successful! ബോട്ട് റീസ്റ്റാർട്ട് ചെയ്യുന്നു...*");
                process.exit(0);
            } catch (err) {
                reply(`❌ *Update Failed:* ${err.message}\n\n💡 _Railway / Render ഡാഷ്‌ബോർഡിൽ Auto-Deploy ഓൺ ആണെങ്കിൽ GitHub-ൽ സേവ് ചെയ്യുമ്പോൾ തന്നെ ബോട്ട് തനിയെ അപ്‌ഡേറ്റ് ആകും._`);
            }
        }
    },

    // 3. .restart / .reboot (Restart Bot from WhatsApp)
    {
        pattern: "restart",
        alias: ["reboot"],
        type: "owner",
        async execute({ reply, isOwner }) {
            if (!isOwner) return;
            await reply("🔄 *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 റീസ്റ്റാർട്ട് ചെയ്യുന്നു... 10 സെക്കൻഡ് കാത്തിരിക്കുക!*");
            process.exit(0);
        }
    }
];

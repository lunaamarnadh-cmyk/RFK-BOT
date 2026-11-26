const fs = require("fs");
const path = require("path");
const config = require("../config");

const groupDbPath = path.join(__dirname, "group_settings.json");
if (!fs.existsSync(groupDbPath)) {
    fs.writeFileSync(groupDbPath, JSON.stringify({}, null, 2));
}

function getGroupSettings(jid) {
    try {
        const db = JSON.parse(fs.readFileSync(groupDbPath, "utf8"));
        if (!db[jid]) {
            db[jid] = { antilink: false, antibot: false };
            fs.writeFileSync(groupDbPath, JSON.stringify(db, null, 2));
        }
        return db[jid];
    } catch {
        return { antilink: false, antibot: false };
    }
}

function updateGroupSetting(jid, key, value) {
    let db = {};
    try {
        db = JSON.parse(fs.readFileSync(groupDbPath, "utf8"));
    } catch {}
    if (!db[jid]) db[jid] = { antilink: false, antibot: false };
    db[jid][key] = value;
    fs.writeFileSync(groupDbPath, JSON.stringify(db, null, 2));
}

async function isGroupAdmin(sock, jid, userJid) {
    try {
        const meta = await sock.groupMetadata(jid);
        const admins = meta.participants
            .filter(p => p.admin === "admin" || p.admin === "superadmin")
            .map(p => p.id);
        return admins.includes(userJid);
    } catch {
        return false;
    }
}

module.exports = [
    // 1. Background Listener: Anti-Link & Anti-Bot (Admins are excluded!)
    {
        on: "message",
        async execute({ sock, msg, jid, body, sender, fromMe }) {
            if (!jid.endsWith("@g.us") || fromMe || !body) return;

            const settings = getGroupSettings(jid);
            if (!settings.antilink && !settings.antibot) return;

            // Skip Group Admins & Bot Owner
            if (config.OWNER_NUMBER && sender.includes(config.OWNER_NUMBER)) return;
            const senderIsAdmin = await isGroupAdmin(sock, jid, sender);
            if (senderIsAdmin) return;

            const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const botIsAdmin = await isGroupAdmin(sock, jid, botId);
            if (!botIsAdmin) return;

            // Anti-Link Check
            if (settings.antilink && /(https?:\/\/|chat\.whatsapp\.com\/)/i.test(body)) {
                await sock.sendMessage(jid, { delete: msg.key });
                await sock.sendMessage(jid, {
                    text: `🚫 *ANTI-LINK DETECTED!*\n@${sender.split("@")[0]} ഗ്രൂപ്പിൽ ലിങ്ക് അയക്കാൻ അനുവാദമില്ല!`,
                    mentions: [sender]
                });
                await sock.groupParticipantsUpdate(jid, [sender], "remove");
                return;
            }

            // Anti-Bot Check
            if (settings.antibot) {
                const isBotMsg = msg.key.id.startsWith("BAE5") || msg.key.id.startsWith("3EB0");
                if (isBotMsg) {
                    await sock.sendMessage(jid, { delete: msg.key });
                    await sock.sendMessage(jid, {
                        text: `🤖 *ANTI-BOT DETECTED!*\n@${sender.split("@")[0]} ഈ ഗ്രൂപ്പിൽ മറ്റു ബോട്ടുകൾ അനുവദനീയമല്ല!`,
                        mentions: [sender]
                    });
                    await sock.groupParticipantsUpdate(jid, [sender], "remove");
                }
            }
        }
    },

    // 2. .mode command (Switch between Public & Private mode)
    {
        pattern: "mode",
        type: "manage",
        async execute({ text, reply, isOwner }) {
            if (!isOwner) return;
            if (text.toLowerCase() === "public") {
                config.MODE = "public";
                return reply("🌍 *RFK BOT ഇപ്പോൾ PUBLIC MODE ആണ്!* (എല്ലാവർക്കും കമാൻഡുകൾ ഉപയോഗിക്കാം)");
            }
            if (text.toLowerCase() === "private") {
                config.MODE = "private";
                return reply("🔒 *RFK BOT is currently in PRIVATE MODE!* (Owner only)");
            }
            return reply(`നിലവിലെ മോഡ്: *${(config.MODE || "private").toUpperCase()}*\nമാറ്റാൻ: \`.mode public\` അല്ലെങ്കിൽ \`.mode private\``);
        }
    },

    // 3. .antilink command
    {
        pattern: "antilink",
        type: "manage",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഇത് ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കാവുന്ന കമാൻഡ് ആണ്!");
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻമാർക്ക് മാത്രമേ ഇത് മാറ്റാൻ കഴിയൂ!");

            if (text.toLowerCase() === "on") {
                updateGroupSetting(jid, "antilink", true);
                return reply("✅ *Anti-Link ON ആക്കി!* (ഗ്രൂപ്പ് അഡ്മിൻമാരെ ഒഴിവാക്കിയിട്ടുണ്ട്)");
            }
            if (text.toLowerCase() === "off") {
                updateGroupSetting(jid, "antilink", false);
                return reply("❌ *Anti-Link OFF ആക്കി!*");
            }
            return reply("ഉപയോഗിക്കേണ്ട രീതി: `.antilink on` അല്ലെങ്കിൽ `.antilink off`");
        }
    },

    // 4. .antibot command
    {
        pattern: "antibot",
        type: "manage",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഇത് ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കാവുന്ന കമാൻഡ് ആണ്!");
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻമാർക്ക് മാത്രമേ ഇത് മാറ്റാൻ കഴിയൂ!");

            if (text.toLowerCase() === "on") {
                updateGroupSetting(jid, "antibot", true);
                return reply("✅ *Anti-Bot ON ആക്കി!* (ഗ്രൂപ്പ് അഡ്മിൻമാരെ ഒഴിവാക്കിയിട്ടുണ്ട്)");
            }
            if (text.toLowerCase() === "off") {
                updateGroupSetting(jid, "antibot", false);
                return reply("❌ *Anti-Bot OFF ആക്കി!*");
            }
            return reply("ഉപയോഗിക്കേണ്ട രീതി: `.antibot on` അല്ലെങ്കിൽ `.antibot off`");
        }
    },

    // 5. .kick
    {
        pattern: "kick",
        type: "group",
        async execute({ sock, msg, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");

            const target =
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (!target) return reply("❌ പുറത്താക്കേണ്ട ആളെ ടാഗ് ചെയ്യുകയോ മെസേജിന് റിപ്ലൈ നൽകുകയോ ചെയ്യുക!");

            await sock.groupParticipantsUpdate(jid, [target], "remove");
            reply(`✅ @${target.split("@")[0]} ഗ്രൂപ്പിൽ നിന്ന് പുറത്താക്കി!`);
        }
    },

    // 6. .promote & .demote
    {
        pattern: "promote",
        type: "group",
        async execute({ sock, msg, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");

            const target =
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (!target) return reply("❌ അഡ്മിൻ ആക്കേണ്ട ആളെ ടാഗ് ചെയ്യുക!");

            await sock.groupParticipantsUpdate(jid, [target], "promote");
            reply(`👑 @${target.split("@")[0]} ഇപ്പോൾ ഗ്രൂപ്പ് അഡ്മിൻ ആണ്!`);
        }
    },
    {
        pattern: "demote",
        type: "group",
        async execute({ sock, msg, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");

            const target =
                msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (!target) return reply("❌ അഡ്മിൻ സ്ഥാനത്തുനിന്ന് മാറ്റേണ്ട ആളെ ടാഗ് ചെയ്യുക!");

            await sock.groupParticipantsUpdate(jid, [target], "demote");
            reply(`⬇️ @${target.split("@")[0]} അഡ്മിൻ സ്ഥാനത്തുനിന്ന് മാറ്റി!`);
        }
    },

    // 7. .mute & .unmute
    {
        pattern: "mute",
        type: "group",
        async execute({ sock, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            await sock.groupSettingUpdate(jid, "announcement");
            reply("🔒 *ഗ്രൂപ്പ് Mute ചെയ്തു (അഡ്മിൻമാർക്ക് മാത്രം മെസേജ് അയക്കാം).*");
        }
    },
    {
        pattern: "unmute",
        type: "group",
        async execute({ sock, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            await sock.groupSettingUpdate(jid, "not_announcement");
            reply("🔓 *ഗ്രൂപ്പ് Unmute ചെയ്തു (എല്ലാവർക്കും മെസേജ് അയക്കാം).*");
        }
    },

    // 8. .tag
    {
        pattern: "tag",
        type: "group",
        async execute({ sock, msg, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");

            const meta = await sock.groupMetadata(jid);
            const members = meta.participants.map(p => p.id);
            const tagText = text || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "📢 *Attention Everyone!*";

            await sock.sendMessage(jid, { text: tagText, mentions: members }, { quoted: msg });
        }
    },

    // 9. .invite & .revoke
    {
        pattern: "invite",
        type: "group",
        async execute({ sock, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            const code = await sock.groupInviteCode(jid);
            reply(`🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`);
        }
    },
    {
        pattern: "revoke",
        type: "group",
        async execute({ sock, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isGroupAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            await sock.groupRevokeInvite(jid);
            reply("♻️ *പഴയ ഗ്രൂപ്പ് ലിങ്ക് റദ്ദാക്കി പുതിയത് ജനറേറ്റ് ചെയ്തു!*");
        }
    }
];

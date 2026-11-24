const fs = require("fs");
const path = require("path");
const config = require("../config");

const dbPath = path.join(__dirname, "group_extra_db.json");
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}, null, 2));
}

function getDb() {
    try { return JSON.parse(fs.readFileSync(dbPath, "utf8")); } catch { return {}; }
}
function saveDb(db) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
function getGrp(jid) {
    const db = getDb();
    if (!db[jid]) {
        db[jid] = { welcome: false, goodbye: false, antifake: false, antiword: false, pdm: false, warns: {} };
        saveDb(db);
    }
    return db[jid];
}
function setGrp(jid, key, val) {
    const db = getDb();
    if (!db[jid]) db[jid] = { welcome: false, goodbye: false, antifake: false, antiword: false, pdm: false, warns: {} };
    db[jid][key] = val;
    saveDb(db);
}

async function isAdmin(sock, jid, user) {
    try {
        const meta = await sock.groupMetadata(jid);
        return meta.participants.some(p => p.id === user && (p.admin === "admin" || p.admin === "superadmin"));
    } catch { return false; }
}

const BAD_WORDS = ["myr", "poori", "thayoli", "kunna", "andi", "oombi", "fuck", "bitch"];

module.exports = [
    // Background Anti-Word Listener
    {
        on: "message",
        async execute({ sock, msg, jid, body, sender, fromMe }) {
            if (!jid.endsWith("@g.us") || fromMe || !body) return;
            const grp = getGrp(jid);
            if (!grp.antiword) return;

            if (config.OWNER_NUMBER && sender.includes(config.OWNER_NUMBER)) return;
            if (await isAdmin(sock, jid, sender)) return;

            const botId = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            if (!(await isAdmin(sock, jid, botId))) return;

            const lower = body.toLowerCase();
            if (BAD_WORDS.some(w => lower.includes(w))) {
                await sock.sendMessage(jid, { delete: msg.key });
                await sock.sendMessage(jid, {
                    text: `🤬 *ANTI-WORD DETECTED!*\n@${sender.split("@")[0]} ഗ്രൂപ്പിൽ മോശം വാക്കുകൾ ഉപയോഗിക്കാൻ അനുവാദമില്ല!`,
                    mentions: [sender]
                });
            }
        }
    },

    // .welcome on/off
    {
        pattern: "welcome",
        type: "group",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            if (text.toLowerCase() === "on") { setGrp(jid, "welcome", true); return reply("✅ *Welcome Message ON ആക്കി!*"); }
            if (text.toLowerCase() === "off") { setGrp(jid, "welcome", false); return reply("❌ *Welcome Message OFF ആക്കി!*"); }
            reply("ഉപയോഗം: `.welcome on` അല്ലെങ്കിൽ `.welcome off`");
        }
    },

    // .goodbye on/off
    {
        pattern: "goodbye",
        type: "group",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            if (text.toLowerCase() === "on") { setGrp(jid, "goodbye", true); return reply("✅ *Goodbye Message ON ആക്കി!*"); }
            if (text.toLowerCase() === "off") { setGrp(jid, "goodbye", false); return reply("❌ *Goodbye Message OFF ആക്കി!*"); }
            reply("ഉപയോഗം: `.goodbye on` അല്ലെങ്കിൽ `.goodbye off`");
        }
    },

    // .antifake on/off
    {
        pattern: "antifake",
        type: "manage",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            if (text.toLowerCase() === "on") { setGrp(jid, "antifake", true); return reply("✅ *Anti-Fake (+91 അല്ലാത്ത നമ്പറുകൾ) ON ആക്കി!*"); }
            if (text.toLowerCase() === "off") { setGrp(jid, "antifake", false); return reply("❌ *Anti-Fake OFF ആക്കി!*"); }
            reply("ഉപയോഗം: `.antifake on` അല്ലെങ്കിൽ `.antifake off`");
        }
    },

    // .antiword on/off
    {
        pattern: "antiword",
        type: "manage",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            if (text.toLowerCase() === "on") { setGrp(jid, "antiword", true); return reply("✅ *Anti-Word ON ആക്കി!*"); }
            if (text.toLowerCase() === "off") { setGrp(jid, "antiword", false); return reply("❌ *Anti-Word OFF ആക്കി!*"); }
            reply("ഉപയോഗം: `.antiword on` അല്ലെങ്കിൽ `.antiword off`");
        }
    },

    // .warn (3 warns = Kick)
    {
        pattern: "warn",
        type: "group",
        async execute({ sock, msg, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return reply("❌ ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!");
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");

            const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                           msg.message?.extendedTextMessage?.contextInfo?.participant;
            if (!target) return reply("❌ വാൺ ചെയ്യേണ്ട ആളെ ടാഗ് ചെയ്യുകയോ റിപ്ലൈ നൽകുകയോ ചെയ്യുക!");

            const db = getDb();
            if (!db[jid]) db[jid] = { warns: {} };
            if (!db[jid].warns) db[jid].warns = {};

            if (text.toLowerCase() === "reset") {
                db[jid].warns[target] = 0;
                saveDb(db);
                return reply(`✅ @${target.split("@")[0]} ന്റെ വാണിംഗുകൾ റീസെറ്റ് ചെയ്തു!`);
            }

            db[jid].warns[target] = (db[jid].warns[target] || 0) + 1;
            const count = db[jid].warns[target];
            saveDb(db);

            if (count >= 3) {
                await sock.sendMessage(jid, { text: `🚫 @${target.split("@")[0]} 3 വാണിംഗ് പൂർത്തിയായതിനാൽ ഗ്രൂപ്പിൽ നിന്ന് പുറത്താക്കുന്നു!`, mentions: [target] });
                await sock.groupParticipantsUpdate(jid, [target], "remove");
                db[jid].warns[target] = 0;
                saveDb(db);
            } else {
                await sock.sendMessage(jid, { text: `⚠️ *WARNING (${count}/3)*\n@${target.split("@")[0]} നിയമങ്ങൾ പാലിക്കുക!`, mentions: [target] });
            }
        }
    },

    // .add
    {
        pattern: "add",
        type: "group",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) return;
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return reply("❌ അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!");
            const num = text.replace(/[^0-9]/g, "");
            if (!num) return reply("❌ ആഡ് ചെയ്യേണ്ട നമ്പർ നൽകുക (ഉദാ: `.add 919876543210`)");
            await sock.groupParticipantsUpdate(jid, [`${num}@s.whatsapp.net`], "add");
            reply(`✅ +${num} ഗ്രൂപ്പിലേക്ക് ആഡ് ചെയ്തു!`);
        }
    },

    // .join & .left
    {
        pattern: "join",
        type: "group",
        async execute({ sock, text, reply, isOwner }) {
            if (!isOwner) return;
            const match = text.match(/chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/);
            if (!match) return reply("❌ ശരിയായ വാട്‌സാപ്പ് ഗ്രൂപ്പ് ലിങ്ക് നൽകുക!");
            await sock.groupAcceptInvite(match[1]);
            reply("✅ *ഗ്രൂപ്പിൽ ജോയിൻ ചെയ്തു!*");
        }
    },
    {
        pattern: "left",
        type: "group",
        async execute({ sock, jid, reply, isOwner }) {
            if (!isOwner || !jid.endsWith("@g.us")) return;
            await reply("👋 *ഗ്രൂപ്പിൽ നിന്ന് വിടവാങ്ങുന്നു!*");
            await sock.groupLeave(jid);
        }
    },

    // .gname, .gdesc, .ginfo
    {
        pattern: "gname",
        type: "group",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us") || !text) return;
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return;
            await sock.groupUpdateSubject(jid, text);
            reply(`✅ ഗ്രൂപ്പ് പേര് *${text}* എന്നാക്കി മാറ്റി!`);
        }
    },
    {
        pattern: "gdesc",
        type: "group",
        async execute({ sock, jid, text, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us") || !text) return;
            if (!isOwner && !(await isAdmin(sock, jid, sender))) return;
            await sock.groupUpdateDescription(jid, text);
            reply("✅ *ഗ്രൂപ്പ് ഡിസ്ക്രിപ്ഷൻ അപ്‌ഡേറ്റ് ചെയ്തു!*");
        }
    },
    {
        pattern: "ginfo",
        type: "group",
        async execute({ sock, jid, reply }) {
            if (!jid.endsWith("@g.us")) return;
            const meta = await sock.groupMetadata(jid);
            const admins = meta.participants.filter(p => p.admin).length;
            reply(`📌 *GROUP INFO*\n\n🏷️ *Name:* ${meta.subject}\n🆔 *JID:* ${jid}\n👥 *Members:* ${meta.participants.length}\n👑 *Admins:* ${admins}\n📝 *Desc:* ${meta.desc || "No description"}`);
        }
    }
];

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = [
    // 1. .block & .unblock
    {
        pattern: "block",
        type: "whatsapp",
        async execute({ sock, msg, jid, reply, isOwner }) {
            if (!isOwner) return;
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant ||
                           msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                           (jid.endsWith("@s.whatsapp.net") ? jid : null);
            if (!target) return reply("❌ ബ്ലോക്ക് ചെയ്യേണ്ട ആളുടെ ചാറ്റിലോ മെസ്സേജിന് റിപ്ലൈ ആയോ `.block` നൽകുക!");
            await sock.updateBlockStatus(target, "block");
            reply(`🚫 @${target.split("@")[0]} ബ്ലോക്ക് ചെയ്തു!`);
        }
    },
    {
        pattern: "unblock",
        type: "whatsapp",
        async execute({ sock, msg, jid, text, reply, isOwner }) {
            if (!isOwner) return;
            const num = text.replace(/[^0-9]/g, "");
            const target = num ? `${num}@s.whatsapp.net` :
                           (msg.message?.extendedTextMessage?.contextInfo?.participant ||
                           (jid.endsWith("@s.whatsapp.net") ? jid : null));
            if (!target) return reply("❌ അൺബ്ലോക്ക് ചെയ്യേണ്ട നമ്പർ നൽകുക (ഉദാ: `.unblock 919876543210`)");
            await sock.updateBlockStatus(target, "unblock");
            reply(`✅ @${target.split("@")[0]} അൺബ്ലോക്ക് ചെയ്തു!`);
        }
    },

    // 2. .pp (Change Bot Profile Picture)
    {
        pattern: "pp",
        type: "whatsapp",
        async execute({ sock, msg, reply, isOwner }) {
            if (!isOwner) return;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const img = quoted?.imageMessage || msg.message?.imageMessage;
            if (!img) return reply("❌ *പ്രൊഫൈൽ ഫോട്ടോ ആക്കേണ്ട ചിത്രത്തിന് റിപ്ലൈ ആയി `.pp` എന്ന് അയക്കുക!*");

            const stream = await downloadContentFromMessage(img, "image");
            const chunks = [];
            for await (const c of stream) chunks.push(c);
            const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            await sock.updateProfilePicture(myJid, Buffer.concat(chunks));
            reply("✅ *ബോട്ടിന്റെ പ്രൊഫൈൽ ഫോട്ടോ അപ്‌ഡേറ്റ് ചെയ്തു!*");
        }
    },

    // 3. .setname & .setbio
    {
        pattern: "setname",
        type: "whatsapp",
        async execute({ sock, text, reply, isOwner }) {
            if (!isOwner || !text) return;
            await sock.updateProfileName(text);
            reply(`✅ വാട്‌സാപ്പ് പേര് *${text}* എന്നാക്കി മാറ്റി!`);
        }
    },
    {
        pattern: "setbio",
        type: "whatsapp",
        async execute({ sock, text, reply, isOwner }) {
            if (!isOwner || !text) return;
            await sock.updateProfileStatus(text);
            reply(`✅ വാട്‌സാപ്പ് ബയോ (About) *${text}* എന്നാക്കി മാറ്റി!`);
        }
    },

    // 4. .whois (Get User Info & DP)
    {
        pattern: "whois",
        type: "whatsapp",
        async execute({ sock, msg, jid, reply }) {
            const target = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                           msg.message?.extendedTextMessage?.contextInfo?.participant ||
                           jid;
            if (!target.endsWith("@s.whatsapp.net")) return reply("❌ ഒരാളുടെ മെസ്സേജിന് റിപ്ലൈ ആയി `.whois` അയക്കുക!");

            let ppUrl;
            try { ppUrl = await sock.profilePictureUrl(target, "image"); } catch {}
            let status = "No bio";
            try { const s = await sock.fetchStatus(target); status = s?.status || "No bio"; } catch {}

            const caption = `👤 *USER INFO*\n\n📱 *Number:* +${target.split("@")[0]}\n📝 *Bio:* ${status}`;
            if (ppUrl) {
                await sock.sendMessage(jid, { image: { url: ppUrl }, caption }, { quoted: msg });
            } else {
                reply(caption);
            }
        }
    },

    // 5. .jid (Get Chat/Group JID)
    {
        pattern: "jid",
        type: "whatsapp",
        async execute({ msg, jid, reply }) {
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || jid;
            reply(`🆔 *JID:* \`${target}\``);
        }
    },

    // 6. .forward (Forward quoted message to any number/JID)
    {
        pattern: "forward",
        type: "whatsapp",
        async execute({ sock, msg, text, reply, isOwner }) {
            if (!isOwner) return;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted || !text) return reply("❌ ഫോർവേഡ് ചെയ്യേണ്ട മെസ്സേജിന് റിപ്ലൈ ആയി `.forward 919876543210` എന്ന് അയക്കുക!");
            const targetJid = text.includes("@") ? text.trim() : `${text.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
            await sock.sendMessage(targetJid, { forward: { key: msg.key, message: quoted } });
            reply(`✅ *${targetJid} ലേക്ക് ഫോർവേഡ് ചെയ്തു!*`);
        }
    }
];

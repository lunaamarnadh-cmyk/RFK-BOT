const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

async function getBuffer(obj) {
    const stream = await downloadContentFromMessage(obj, "image");
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    return Buffer.concat(chunks);
}

async function makeFullSquare(buffer) {
    const id = Date.now();
    const inPath = path.join("/tmp", `fpp_in_${id}.jpg`);
    const outPath = path.join("/tmp", `fpp_out_${id}.jpg`);

    fs.writeFileSync(inPath, buffer);

    // Creates a 640x640 square with blurred background so image is never cropped
    const cmd = `ffmpeg -y -i "${inPath}" -vf "split[original][blur];[blur]scale=640:640:force_original_aspect_ratio=increase,crop=640:640,boxblur=20:5[bg];[original]scale=640:640:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2" -q:v 2 "${outPath}"`;

    try {
        await new Promise((resolve, reject) => {
            exec(cmd, (err) => (err ? reject(err) : resolve()));
        });
        return fs.readFileSync(outPath);
    } finally {
        if (fs.existsSync(inPath)) fs.unlinkSync(inPath);
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    }
}

module.exports = [
    // 1. .fullpp (Set Full Size WhatsApp Profile Picture)
    {
        pattern: "fullpp",
        alias: ["fpp", "fulldp"],
        type: "whatsapp",
        async execute({ sock, msg, reply, isOwner }) {
            if (!isOwner) return;

            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const img = quoted?.imageMessage || msg.message?.imageMessage;

            if (!img) {
                return reply("❌ *ഫുൾ ഡിപി ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.fullpp` എന്ന് അയക്കുക!*");
            }

            const waitMsg = await reply("⏳ *Setting Full Profile Picture...*");

            try {
                const rawBuf = await getBuffer(img);
                const fullBuf = await makeFullSquare(rawBuf);
                const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

                await sock.updateProfilePicture(myJid, fullBuf);
                await reply("✅ *ഫോട്ടോ കട്ട് ആകാതെ Full DP ആയി സെറ്റ് ചെയ്തു!*");
            } catch (err) {
                console.error("FullPP Error:", err.message);
                await reply(`❌ *Error:* ${err.message}`);
            }
        }
    },

    // 2. .fullgpp (Set Full Size Group Profile Picture)
    {
        pattern: "fullgpp",
        alias: ["fgpp", "fullgdp"],
        type: "group",
        async execute({ sock, msg, jid, reply, sender, isOwner }) {
            if (!jid.endsWith("@g.us")) {
                return reply("❌ *ഈ കമാൻഡ് ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!*");
            }

            if (!isOwner) {
                const meta = await sock.groupMetadata(jid);
                const isAdmin = meta.participants.some(
                    (p) => p.id === sender && (p.admin === "admin" || p.admin === "superadmin")
                );
                if (!isAdmin) return reply("❌ *അഡ്മിൻ പെർമിഷൻ ആവശ്യമാണ്!*");
            }

            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const img = quoted?.imageMessage || msg.message?.imageMessage;

            if (!img) {
                return reply("❌ *ഗ്രൂപ്പ് ഫുൾ ഡിപി ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.fullgpp` എന്ന് അയക്കുക!*");
            }

            await reply("⏳ *Setting Full Group DP...*");

            try {
                const rawBuf = await getBuffer(img);
                const fullBuf = await makeFullSquare(rawBuf);

                await sock.updateProfilePicture(jid, fullBuf);
                await reply("✅ *ഗ്രൂപ്പ് പ്രൊഫൈൽ ഫോട്ടോ Full Size-ൽ അപ്‌ഡേറ്റ് ചെയ്തു!*");
            } catch (err) {
                console.error("FullGPP Error:", err.message);
                await reply(`❌ *Error:* ${err.message}`);
            }
        }
    }
];

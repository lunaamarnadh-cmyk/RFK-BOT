
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
    // 1. .fullpp / .pp (Set Full Size WhatsApp Profile Picture)
    {
        pattern: "fullpp",
        alias: ["fpp", "fulldp", "pp", "setpp"],
        type: "whatsapp",
        async execute({ sock, msg, text, reply }) {
            try {
                const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

                if (text?.trim().toLowerCase() === "remove") {
                    await sock.removeProfilePicture(botJid);
                    return reply("✅ *പ്രൊഫൈൽ പിക്ചർ നീക്കം ചെയ്തു!*");
                }

                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const img = quoted?.imageMessage || msg.message?.imageMessage;

                if (!img) {
                    return reply("❌ *ഫുൾ ഡിപി ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.fullpp` അല്ലെങ്കിൽ `.pp` എന്ന് അയക്കുക!*");
                }

                await reply("⏳ *Setting Full Profile Picture...*");

                const rawBuf = await getBuffer(img);
                const fullBuf = await makeFullSquare(rawBuf);

                await sock.query({
                    tag: "iq",
                    attrs: {
                        to: "@s.whatsapp.net",
                        type: "set",
                        xmlns: "w:profile:picture"
                    },
                    content: [
                        {
                            tag: "picture",
                            attrs: { type: "image" },
                            content: fullBuf
                        }
                    ]
                });

                await reply("✅ *ഫോട്ടോ കട്ട് ആകാതെ Full DP ആയി സെറ്റ് ചെയ്തു!*");
            } catch (err) {
                console.error("FullPP Error:", err.message);
                await reply(`❌ *Error:* ${err.message}`);
            }
        }
    },

    // 2. .fullgpp / .gpp (Set Full Size Group Profile Picture)
    {
        pattern: "fullgpp",
        alias: ["fgpp", "fullgdp", "gpp"],
        type: "group",
        async execute({ sock, msg, jid, text, reply }) {
            if (!jid.endsWith("@g.us")) {
                return reply("❌ *ഈ കമാൻഡ് ഗ്രൂപ്പിൽ മാത്രം ഉപയോഗിക്കുക!*");
            }

            try {
                if (text?.trim().toLowerCase() === "remove") {
                    await sock.removeProfilePicture(jid);
                    return reply("✅ *ഗ്രൂപ്പ് പ്രൊഫൈൽ പിക്ചർ നീക്കം ചെയ്തു!*");
                }

                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const img = quoted?.imageMessage || msg.message?.imageMessage;

                if (!img) {
                    return reply("❌ *ഗ്രൂപ്പ് ഫുൾ ഡിപി ആക്കേണ്ട ഫോട്ടോയ്ക്ക് റിപ്ലൈ ആയി `.fullgpp` അല്ലെങ്കിൽ `.gpp` എന്ന് അയക്കുക!*");
                }

                await reply("⏳ *Setting Full Group DP...*");

                const rawBuf = await getBuffer(img);
                const fullBuf = await makeFullSquare(rawBuf);

                await sock.query({
                    tag: "iq",
                    attrs: {
                        to: jid,
                        type: "set",
                        xmlns: "w:profile:picture"
                    },
                    content: [
                        {
                            tag: "picture",
                            attrs: { type: "image" },
                            content: fullBuf
                        }
                    ]
                });

                await reply("✅ *ഗ്രൂപ്പ് പ്രൊഫൈൽ ഫോട്ടോ Full Size-ൽ അപ്‌ഡേറ്റ് ചെയ്തു!*");
            } catch (err) {
                console.error("FullGPP Error:", err.message);
                await reply(`❌ *Error:* ${err.message}`);
            }
        }
    }
];

const Jimp = require("jimp");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function generateFullProfilePic(buffer) {
    const image = await Jimp.read(buffer);
    const width = image.getWidth();
    const height = image.getHeight();
    const cropped = image.crop(0, 0, width, height);
    const img = await cropped.scaleToFit(720, 720).getBufferAsync(Jimp.MIME_JPEG);
    return { img, preview: img };
}

async function downloadMediaBuffer(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = quoted || msg.message;
    const imageMsg = target?.imageMessage || (target?.documentMessage?.mimetype?.startsWith("image/") ? target.documentMessage : null);

    if (!imageMsg) return null;

    const type = target?.imageMessage ? "image" : "document";
    const stream = await downloadContentFromMessage(imageMsg, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

module.exports = [
    {
        pattern: "pp",
        alias: ["fullpp", "setpp"],
        type: "whatsapp",
        async execute({ sock, msg, jid, text, reply }) {
            try {
                const botJid = sock.user?.id?.split(":")[0] + "@s.whatsapp.net";

                if (text?.trim().toLowerCase() === "remove") {
                    await sock.removeProfilePicture(botJid);
                    return reply("✅ *പ്രൊഫൈൽ പിക്ചർ നീക്കം ചെയ്തു!*");
                }

                const buffer = await downloadMediaBuffer(msg);
                if (!buffer) {
                    return reply("❌ *ദയവായി ഒരു ഫോട്ടോയ്ക്ക് മറുപടിയായി `.pp` അല്ലെങ്കിൽ `.fullpp` അയക്കുക!*\n_(നീക്കം ചെയ്യാൻ: `.pp remove`)_");
                }

                await reply("⏳ *Full DP അപ്‌ഡേറ്റ് ചെയ്യുന്നു...*");

                const { img } = await generateFullProfilePic(buffer);

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
                            content: img
                        }
                    ]
                });

                return reply("✅ *Full Screen Profile Picture അപ്‌ഡേറ്റ് ചെയ്തു!*");
            } catch (err) {
                return reply(`❌ *PP Error:* ${err.message}`);
            }
        }
    },
    {
        pattern: "gpp",
        alias: ["fullgpp", "setgpp"],
        type: "group",
        async execute({ sock, msg, jid, text, reply }) {
            if (!jid.endsWith("@g.us")) {
                return reply("❌ *ഈ കമാൻഡ് ഗ്രൂപ്പുകളിൽ മാത്രമേ ഉപയോഗിക്കാൻ കഴിയൂ!*");
            }
            try {
                if (text?.trim().toLowerCase() === "remove") {
                    await sock.removeProfilePicture(jid);
                    return reply("✅ *ഗ്രൂപ്പ് പ്രൊഫൈൽ പിക്ചർ നീക്കം ചെയ്തു!*");
                }

                const buffer = await downloadMediaBuffer(msg);
                if (!buffer) {
                    return reply("❌ *ദയവായി ഒരു ഫോട്ടോയ്ക്ക് മറുപടിയായി `.gpp` അയക്കുക!*");
                }

                await reply("⏳ *ഗ്രൂപ്പ് Full DP അപ്‌ഡേറ്റ് ചെയ്യുന്നു...*");

                const { img } = await generateFullProfilePic(buffer);

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
                            content: img
                        }
                    ]
                });

                return reply("✅ *ഗ്രൂപ്പ് Full Screen DP അപ്‌ഡേറ്റ് ചെയ്തു!*");
            } catch (err) {
                return reply(`❌ *GPP Error:* ${err.message}`);
            }
        }
    }
];

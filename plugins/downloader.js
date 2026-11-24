const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

module.exports = {
    pattern: "mp3",
    alias: ["tomp3", "audio", "vn"],
    type: "converter",
    async execute({ sock, msg, jid, reply }) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = quoted || msg.message;

        const m =
            targetMsg?.ephemeralMessage?.message ||
            targetMsg?.viewOnceMessage?.message ||
            targetMsg;

        const videoObj = m?.videoMessage;
        if (!videoObj) {
            return reply("❌ *ഏതെങ്കിലും വീഡിയോയ്ക്ക് റിപ്ലൈ ആയി `mp3` എന്ന് അയക്കുക!*");
        }

        const waitMsg = await sock.sendMessage(jid, { text: "⏳ *Converting video to Audio...*" }, { quoted: msg });

        try {
            const stream = await downloadContentFromMessage(videoObj, "video");
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            await sock.sendMessage(
                jid,
                {
                    audio: buffer,
                    mimetype: "audio/mp4",
                    ptt: false
                },
                { quoted: msg }
            );

            await sock.sendMessage(jid, { delete: waitMsg.key });
        } catch (err) {
            console.error("MP3 convert error:", err.message);
            await sock.sendMessage(
                jid,
                {
                    text: `❌ *Conversion Failed:* ${err.message}`,
                    edit: waitMsg.key
                }
            );
        }
    }
};

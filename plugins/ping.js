module.exports = {
    pattern: "ping",
    alias: ["speed", "p"],
    type: "main",
    async execute({ sock, msg, jid }) {
        const start = Date.now();
        const sent = await sock.sendMessage(jid, { text: "⚡ *Testing speed...*" }, { quoted: msg });
        const latency = Date.now() - start;

        await sock.sendMessage(
            jid,
            {
                text: `🏓 *Pong!*\n⚡ *Speed:* \`${latency} ms\`\n🤖 *Bot:* 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂`,
                edit: sent.key
            }
        );
    }
};

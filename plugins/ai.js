const axios = require("axios");

module.exports = [
    // 1. ChatGPT AI (.chatgpt)
    {
        pattern: "chatgpt",
        type: "ai",
        async execute({ text, reply }) {
            if (!text) return reply("❌ ചോദിക്കേണ്ട കാര്യം നൽകുക! (ഉദാ: `.chatgpt Who are you?`)");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/ai/gpt3?prompt=You%20are%20RFK%20BOT&content=${encodeURIComponent(text)}`);
                const ans = res.data?.data || res.data?.result;
                reply(ans ? `🤖 *ChatGPT:*\n\n${ans}` : "❌ ഉത്തരം ലഭിച്ചില്ല!");
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // 2. Gemini AI (.gemini)
    {
        pattern: "gemini",
        type: "ai",
        async execute({ text, reply }) {
            if (!text) return reply("❌ ചോദിക്കേണ്ട കാര്യം നൽകുക! (ഉദാ: `.gemini Write a Malayalam caption`)");
            try {
                const res = await axios.get(`https://api.siputzx.my.id/api/ai/gemini-pro?content=${encodeURIComponent(text)}`);
                const ans = res.data?.data || res.data?.result;
                reply(ans ? `✨ *Gemini AI:*\n\n${ans}` : "❌ ഉത്തരം ലഭിച്ചില്ല!");
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    },

    // 3. Malayalam News (.manorama)
    {
        pattern: "manorama",
        type: "news",
        async execute({ reply }) {
            try {
                const res = await axios.get("https://www.manoramaonline.com/news/latest-news.rss");
                const items = [...res.data.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, 8);
                if (!items.length) return reply("❌ വാർത്തകൾ ലഭ്യമല്ല!");
                let newsText = `📰 *MANORAMA LATEST NEWS*\n\n`;
                items.forEach((m, i) => {
                    newsText += `${i + 1}. ${m[1]}\n\n`;
                });
                reply(newsText + `_乂𝐑𝐅𝐊 𝐁𝐎𝐓乂_`);
            } catch (e) {
                reply(`❌ News Error: ${e.message}`);
            }
        }
    },

    // 4. GitHub User Info (.gitinfo)
    {
        pattern: "gitinfo",
        type: "stalk",
        async execute({ sock, msg, jid, text, reply }) {
            if (!text) return reply("❌ GitHub യൂസർനെയിം നൽകുക! (ഉദാ: `.gitinfo lunaamarnadh-cmyk`)");
            try {
                const res = await axios.get(`https://api.github.com/users/${encodeURIComponent(text.trim())}`);
                const u = res.data;
                const info =
                    `🐙 *GITHUB PROFILE INFO*\n\n` +
                    `• *Name:* ${u.name || u.login}\n` +
                    `• *Username:* ${u.login}\n` +
                    `• *Bio:* ${u.bio || "No bio"}\n` +
                    `• *Public Repos:* ${u.public_repos}\n` +
                    `• *Followers:* ${u.followers} | *Following:* ${u.following}\n` +
                    `• *URL:* ${u.html_url}`;
                await sock.sendMessage(jid, { image: { url: u.avatar_url }, caption: info }, { quoted: msg });
            } catch {
                reply("❌ യൂസറെ കണ്ടെത്താനായില്ല!");
            }
        }
    },

    // 5. Anime Waifu (.waifu)
    {
        pattern: "waifu",
        type: "anime",
        async execute({ sock, msg, jid, reply }) {
            try {
                const res = await axios.get("https://api.waifu.pics/sfw/waifu");
                await sock.sendMessage(jid, { image: { url: res.data.url }, caption: "🌸 *Waifu - 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂*" }, { quoted: msg });
            } catch (e) {
                reply(`❌ Error: ${e.message}`);
            }
        }
    }
];

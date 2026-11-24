const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const config = require("./config");

const pluginsDir = path.join(__dirname, "plugins");
fs.ensureDirSync(pluginsDir);

const commands = new Map();
const eventListeners = [];
const startTime = Date.now();

function registerCommand(cmdObj) {
    if (cmdObj.on === "message" && typeof cmdObj.execute === "function") {
        eventListeners.push(cmdObj);
    }
    if (cmdObj.pattern) {
        commands.set(cmdObj.pattern.toLowerCase(), cmdObj);
    }
}

function loadPlugins() {
    commands.clear();
    eventListeners.length = 0;
    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith(".js"));
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(pluginsDir, file))];
            const plugin = require(path.join(pluginsDir, file));
            if (Array.isArray(plugin)) {
                plugin.forEach(p => registerCommand(p));
            } else if (plugin) {
                registerCommand(plugin);
            }
        } catch (err) {
            console.error(`Error loading plugin ${file}:`, err.message);
        }
    }
}

function formatUptime(ms) {
    let sec = Math.floor(ms / 1000);
    let hrs = Math.floor(sec / 3600);
    let min = Math.floor((sec % 3600) / 60);
    let s = sec % 60;
    return `${String(hrs).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function setupSessionFromEnv() {
    const sessionDir = path.join(__dirname, "session");
    fs.ensureDirSync(sessionDir);
    const credsFile = path.join(sessionDir, "creds.json");

    if (config.SESSION_ID && config.SESSION_ID.startsWith("RFK-BOT~") && !fs.existsSync(credsFile)) {
        try {
            const base64Data = config.SESSION_ID.replace("RFK-BOT~", "").trim();
            const decoded = Buffer.from(base64Data, "base64").toString("utf-8");
            fs.writeFileSync(credsFile, decoded);
            console.log("✅ Session restored from SESSION_ID!");
        } catch (e) {
            console.error("❌ Invalid SESSION_ID:", e.message);
        }
    }
}

async function startRFKBot() {
    await setupSessionFromEnv();
    const { state, saveCreds } = await useMultiFileAuthState("./session");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }),
        printQRInTerminal: false,
        auth: state,
        browser: ["RFK-BOT", "Chrome", "1.0.0"]
    });

    if (!sock.authState.creds.registered && config.PAIRING_NUMBER) {
        setTimeout(async () => {
            try {
                let num = config.PAIRING_NUMBER.replace(/[^0-9]/g, "");
                let code = await sock.requestPairingCode(num);
                console.log(`\n========================================`);
                console.log(`🔑 RFK-BOT PAIRING CODE: ${code}`);
                console.log(`========================================\n`);
            } catch (e) {
                console.error("Pairing Code Error:", e.message);
            }
        }, 3000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") {
            console.log(`✅ ${config.BOT_NAME} Connected Successfully!`);
            loadPlugins();
        } else if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startRFKBot();
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return;

        const jid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const sender = msg.key.participant || jid;
        const pushName = msg.pushName || "User";

        const body =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            "";

        const reply = (txt) => sock.sendMessage(jid, { text: txt }, { quoted: msg });

        for (const listener of eventListeners) {
            try {
                await listener.execute({ sock, msg, jid, body, reply, sender, pushName, fromMe });
            } catch (err) {
                console.error("Listener Error:", err.message);
            }
        }

        if (!body.startsWith(config.PREFIX)) return;

        const isOwner = fromMe || sender.includes(config.OWNER_NUMBER);
        if (config.MODE === "private" && !isOwner) return;

        const args = body.slice(config.PREFIX.length).trim().split(/ +/);
        const cmdName = args.shift().toLowerCase();
        const text = args.join(" ");

        if (cmdName === "ping" || cmdName === "rfk") {
            const start = Date.now();
            const sent = await sock.sendMessage(jid, { text: "```☭ Testing Speed... [ ░░░░░░░░░░ ] 0%```" }, { quoted: msg });
            const frames = [
                "```☭ Checking Server... [ ███░░░░░░░ ] 30%```",
                "```☭ Calculating Ping.. [ ██████░░░░ ] 65%```",
                "```☭ Almost Ready...... [ █████████░ ] 95%```"
            ];
            for (const f of frames) {
                await new Promise(r => setTimeout(r, 350));
                await sock.sendMessage(jid, { text: f, edit: sent.key });
            }
            const speed = Date.now() - start;
            await sock.sendMessage(jid, {
                text: `╭━━━〔 ☭ ${config.BOT_NAME} ☭ 〕━━━╮\n┃ ⚡ *Pong!* : *${speed} ms*\n┃ 🚀 *Status* : *Online & Fast*\n╰━━━〔 ☭ 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒 ☭ 〕━━━╯`,
                edit: sent.key
            });
            return;
        }

        if (cmdName === "alive") {
            return reply(
                `╭━━━〔 ☭ ${config.BOT_NAME} ☭ 〕━━━╮\n` +
                `┃ 👋 *Hi* : ${pushName}\n` +
                `┃ ⏱️ *Uptime* : ${formatUptime(Date.now() - startTime)}\n` +
                `┃ 👑 *Owner* : ${config.OWNER_NAME}\n` +
                `╰━━━〔 ☭ 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒 ☭ 〕━━━╯`
            );
        }

        if (cmdName === "menu" || cmdName === "m") {
            const [date, time] = new Date().toLocaleString("en-IN", { timeZone: config.TIMEZONE }).split(",");
            let categories = {};
            commands.forEach((cmd) => {
                let type = cmd.type || "misc";
                if (!categories[type]) categories[type] = [];
                categories[type].push(cmd.pattern);
            });

            let menu = `╭━━━〔 ☭ ${config.BOT_NAME} ☭ 〕━━━┈⊷\n`;
            menu += `┃☭╭──────────────\n`;
            menu += `┃☭│ *owner* : ${config.BOT_NAME}\n`;
            menu += `┃☭│ *user* : ${pushName}\n`;
            menu += `┃☭│ *plugins* : ${commands.size + 5}\n`;
            menu += `┃☭│ *prefix* : ${config.PREFIX}\n`;
            menu += `┃☭│ *date* : ${date}\n`;
            menu += `┃☭│ *time* : ${time}\n`;
            menu += `┃☭│ *uptime* : ${formatUptime(Date.now() - startTime)}\n`;
            menu += `┃☭│ *version* : ᴠ${config.VERSION}\n`;
            menu += `┃☭╰──────────────\n`;
            menu += `╰━━━━━━━━━━━━━━━┈⊷\n\n`;
            menu += `╭━━━━━━━━━━━━━━━┈⊷\n╽`;

            for (const cat of Object.keys(categories).sort()) {
                menu += `\n┃  ╭─────────────┈⊷\n`;
                menu += `┃  │  ☭ *${cat} ⏎*\n`;
                menu += `┃  ╰┬────────────┈⊷\n`;
                menu += `┃  ┌┤`;
                for (const c of categories[cat].sort()) {
                    menu += `\n┃  │ ☭  *${c}*`;
                }
                menu += `\n┃  ╰─────────────┈⊷`;
            }

            menu += ` ╰━━━━━━━━━━━┈⊷\n\n`;
            menu += `╰━━━〔 ☭ 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒 ☭ 〕━━━╯\n`;
            menu += `Made with 🤍 by ${config.OWNER_NAME}`;

            if (config.BOT_IMAGE) {
                return sock.sendMessage(jid, { image: { url: config.BOT_IMAGE }, caption: menu }, { quoted: msg });
            }
            return reply(menu);
        }

        if (cmdName === "plugin" && isOwner) {
            if (!text || !text.startsWith("http")) return reply("❌ ദയവായി ഒരു GitHub Raw URL നൽകുക!");
            try {
                const res = await axios.get(text);
                const fileName = `ext_${Date.now()}.js`;
                await fs.writeFile(path.join(pluginsDir, fileName), res.data);
                loadPlugins();
                return reply(`✅ *New plugin installed* : \`${fileName}\``);
            } catch (e) {
                return reply(`❌ Plugin Install Error: ${e.message}`);
            }
        }

        if (cmdName === "allplugin" && isOwner) {
            const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith(".js"));
            return reply(`📦 *Installed Plugins:*\n\n` + (files.length ? files.map(f => `• \`${f.replace(".js", "")}\``).join("\n") : "No plugins installed."));
        }

        if (cmdName === "remove" && isOwner) {
            if (!text) return reply("❌ റിമൂവ് ചെയ്യേണ്ട പ്ലഗിന്റെ പേര് നൽകുക!");
            const target = path.join(pluginsDir, `${text.trim()}.js`);
            if (fs.existsSync(target)) {
                await fs.remove(target);
                loadPlugins();
                return reply(`🗑️ *Plugin deleted:* \`${text.trim()}\``);
            }
            return reply("❌ അങ്ങനെ ഒരു പ്ലഗിൻ നിലവിലില്ല!");
        }

        if (commands.has(cmdName)) {
            const cmd = commands.get(cmdName);
            try {
                await cmd.execute({ sock, msg, jid, args, text, reply, sender, pushName, isOwner });
            } catch (err) {
                reply(`❌ Error: ${err.message}`);
            }
        }
    });
}

startRFKBot();

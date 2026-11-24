
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8000;

app.get("/", (req, res) => {
    res.send("乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 is Running Successfully!");
});

app.listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));

const SESSION_DIR = path.join(__dirname, "session");
const PREFIX = process.env.PREFIX || ".";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
const MODE = (process.env.MODE || "public").toLowerCase();

const commands = new Map();
const eventPlugins = [];

function loadPlugins() {
    commands.clear();
    eventPlugins.length = 0;
    const pluginDir = path.join(__dirname, "plugins");
    if (!fs.existsSync(pluginDir)) return;

    const files = fs.readdirSync(pluginDir).filter((f) => f.endsWith(".js"));
    for (const file of files) {
        try {
            delete require.cache[require.resolve(path.join(pluginDir, file))];
            const plugin = require(path.join(pluginDir, file));
            const list = Array.isArray(plugin) ? plugin : [plugin];
            for (const item of list) {
                if (item.pattern) {
                    commands.set(item.pattern.toLowerCase(), item);
                    if (Array.isArray(item.alias)) {
                        item.alias.forEach((a) => commands.set(a.toLowerCase(), item));
                    }
                } else if (item.on) {
                    eventPlugins.push(item);
                }
            }
        } catch (err) {
            console.error(`❌ Error loading plugin ${file}:`, err.message);
        }
    }
    console.log(`📦 Loaded ${commands.size} commands & ${eventPlugins.length} event handlers.`);
}

async function restoreSession() {
    const sessionEnv = process.env.SESSION_ID;
    if (sessionEnv && sessionEnv.startsWith("RFK-BOT~")) {
        fs.emptyDirSync(SESSION_DIR);
        const base64Data = sessionEnv.replace("RFK-BOT~", "").trim();
        const credsBuffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(path.join(SESSION_DIR, "creds.json"), credsBuffer);
        console.log("✅ Session restored from SESSION_ID!");
    } else {
        fs.ensureDirSync(SESSION_DIR);
    }
}

let isConnecting = false;
const startTime = Date.now();

function formatUptime(ms) {
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${days}d ${hr}h ${min}m ${sec}s`;
}

async function startBot() {
    if (isConnecting) return;
    isConnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }))
            },
            browser: Browsers.ubuntu("Chrome"),
            syncFullHistory: false,
            markOnlineOnConnect: true
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                isConnecting = false;
                console.log("✅ 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 Connected Successfully!");
            } else if (connection === "close") {
                isConnecting = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ Connection closed (Code: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out! Please generate a new SESSION_ID.");
                } else if (statusCode === 440) {
                    console.log("⚠️ Session replaced (440). Waiting 10s before reconnect...");
                    await delay(10000);
                    startBot();
                } else {
                    await delay(5000);
                    startBot();
                }
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            const msg = messages[0];
            if (!msg || !msg.message) return;

            const jid = msg.key.remoteJid;
            const fromMe = msg.key.fromMe;
            const sender = jid.endsWith("@g.us")
                ? (msg.key.participant || jid)
                : (fromMe ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : jid);

            const senderNum = sender.split("@")[0].split(":")[0];
            const botNum = sock.user.id.split(":")[0];
            const isOwner = fromMe || senderNum === botNum || senderNum === OWNER_NUMBER;

            const body =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                "";

            const pushname = msg.pushName || "User";
            const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

            // Run event plugins (e.g., autoset)
            for (const evPlugin of eventPlugins) {
                try {
                    await evPlugin.execute({ sock, msg, jid, fromMe, sender, isOwner, body, reply });
                } catch (e) {
                    console.error("Event plugin error:", e.message);
                }
            }

            if (!body.startsWith(PREFIX)) return;
            if (MODE === "private" && !isOwner) return;

            const args = body.slice(PREFIX.length).trim().split(/\s+/);
            const cmdName = (args.shift() || "").toLowerCase();
            const text = args.join(" ");

            const cmd = commands.get(cmdName);
            if (!cmd) return;

            try {
                await cmd.execute({
                    sock,
                    msg,
                    jid,
                    sender,
                    fromMe,
                    isOwner,
                    args,
                    text,
                    body,
                    pushname,
                    reply,
                    commands,
                    uptime: formatUptime(Date.now() - startTime)
                });
            } catch (err) {
                console.error(`Command error (${cmdName}):`, err);
                await reply(`❌ Error: ${err.message}`);
            }
        });
    } catch (err) {
        isConnecting = false;
        console.error("StartBot error:", err.message);
        await delay(5000);
        startBot();
    }
}

(async () => {
    await restoreSession();
    loadPlugins();
    await startBot();
})();

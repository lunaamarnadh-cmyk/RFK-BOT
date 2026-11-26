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
    res.end("RFK-BOT is Alive & Running!");
}).listen(PORT, () => console.log(`🌐 Server listening on port ${PORT}`));

const APP_URL = process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`;
setInterval(() => {
    const targetUrl = APP_URL.startsWith("http") ? APP_URL : `https://${APP_URL}`;
    axios.get(targetUrl).catch(() => {});
}, 4 * 60 * 1000);

const SESSION_DIR = path.join(__dirname, "session");
const PROCESSED_FILE = path.join(__dirname, "processed.json");
const PREFIX = process.env.PREFIX || ".";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
const MODE = (process.env.MODE || "public").toLowerCase();

// ഇവിടെ നിങ്ങളുടെ ഫോൺ നമ്പറിനൊപ്പം നിങ്ങളുടെ WhatsApp LID നമ്പറും ചേർക്കുക
const SUPER_OWNERS = ["917907228818", "YOUR_LID_NUMBER_HERE"];
const CONNECT_VIDEO_URL = "https://files.catbox.moe/gg4pf9.mp4";

const commands = new Map();
const eventPlugins = [];

let processedList = [];
if (fs.existsSync(PROCESSED_FILE)) {
    try {
        processedList = JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8"));
    } catch {}
}
const processedMsgs = new Set(processedList);

function markProcessed(id) {
    processedMsgs.add(id);
    if (processedMsgs.size > 1000) {
        const first = processedMsgs.values().next().value;
        processedMsgs.delete(first);
    }
    try {
        fs.writeFileSync(PROCESSED_FILE, JSON.stringify([...processedMsgs]));
    } catch {}
}

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
    const credsPath = path.join(SESSION_DIR, "creds.json");

    if (fs.existsSync(credsPath)) {
        console.log("✅ Existing session folder found, keeping encryption keys intact.");
        return;
    }

    fs.mkdirSync(SESSION_DIR, { recursive: true });

    if (sessionEnv && sessionEnv.startsWith("RFK-BOT~")) {
        const rawData = sessionEnv.replace("RFK-BOT~", "").trim();

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
                fs.writeFileSync(credsPath, credsContent);
                console.log("✅ Short Session restored cleanly!");
            } catch (err) {
                console.error("❌ Failed to restore Short Session:", err.message);
            }
        } else {
            const credsBuffer = Buffer.from(rawData, "base64");
            fs.writeFileSync(credsPath, credsBuffer);
            console.log("✅ Base64 Session restored cleanly!");
        }
    }
}

let isConnecting = false;
let readyToProcessAt = Infinity;
let connectNotified = false;
const startTime = Date.now();

function formatUptime(ms) {
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hr = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${days}d ${hr}h ${min}m ${sec}s`;
}

async function sendConnectNotification(sock) {
    if (connectNotified) return;
    connectNotified = true;
    try {
        await delay(3000);
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const uniqueCmds = new Set([...commands.values()].map((c) => c.pattern)).size;
        const caption =
            `╭━━━〔 ☭ *乂𝐑𝐅𝐊 𝐁𝐎𝐓乂* ☭ 〕━━━╮\n` +
            `┃ ✅ *Status*  : Connected & Updated!\n` +
            `┃ ⚙️ *Mode*    : ${MODE}\n` +
            `┃ 🔑 *Prefix*  : ${PREFIX}\n` +
            `┃ 📦 *Plugins* : ${uniqueCmds}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `🚀 *ബോട്ട് വിജയകരമായി കണക്ട് ആയിരിക്കുന്നു!*\n` +
            `📋 കമാൻഡുകൾ കാണാൻ *\`${PREFIX}menu\`* അയക്കുക.\n` +
            `⚡ *Powered by 𝐑𝐅𝐊 𝐌𝐎𝐃𝐒*`;

        await sock.sendMessage(myJid, {
            video: { url: CONNECT_VIDEO_URL },
            gifPlayback: true,
            caption
        }).catch(async () => {
            await sock.sendMessage(myJid, { text: caption });
        });
    } catch (err) {
        console.log("⚠️ Connect notification error:", err.message);
    }
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
            keepAliveIntervalMs: 25000,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            getMessage: async () => ({ conversation: "" })
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open") {
                isConnecting = false;
                readyToProcessAt = Math.floor(Date.now() / 1000) + 15;
                console.log("✅ 乂𝐑𝐅𝐊 𝐁𝐎𝐓乂 Connected! Live processing starts in 15s...");
                sendConnectNotification(sock);
            } else if (connection === "close") {
                isConnecting = false;
                readyToProcessAt = Infinity;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`⚠️ Connection closed (Code: ${statusCode})`);

                if (statusCode === DisconnectReason.loggedOut) {
                    console.log("❌ Logged out! Please generate a new SESSION_ID.");
                } else if (statusCode === 440) {
                    console.log("⚠️ Conflict (440): Waiting 20s...");
                    await delay(20000);
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

            for (const msg of chatUpdate.messages || []) {
                if (!msg || !msg.message || !msg.key?.id) continue;

                if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) continue;
                if (processedMsgs.has(msg.key.id)) continue;

                if (nowSec < readyToProcessAt) {
                    markProcessed(msg.key.id);
                    continue;
                }

                const msgTime = Number(msg.messageTimestamp || 0);
                if (msgTime && msgTime < readyToProcessAt - 15) {
                    markProcessed(msg.key.id);
                    continue;
                }

                markProcessed(msg.key.id);

                const jid = msg.key.remoteJid;
                if (!jid) continue;

                if (jid === "status@broadcast") {
                    for (const evPlugin of eventPlugins) {
                        if (evPlugin.on === "status" || evPlugin.on === "message") {
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

                // LID നമ്പറും യഥാർത്ഥ ഫോൺ നമ്പറും (participantAlt / remoteJidAlt) ഒരുപോലെ ചെക്ക് ചെയ്യുന്നു
                const senderNum = sender.split("@")[0].split(":")[0];
                const altSender = msg.key.participantAlt || msg.key.remoteJidAlt || "";
                const altNum = altSender.split("@")[0].split(":")[0];

                const botNum = sock.user.id.split(":")[0];
                const botLid = (sock.user.lid || "").split("@")[0].split(":")[0];

                const isSuperOwner =
                    SUPER_OWNERS.includes(senderNum) ||
                    (altNum && SUPER_OWNERS.includes(altNum));

                const isOwner =
                    isSuperOwner ||
                    fromMe ||
                    senderNum === botNum ||
                    (botLid && senderNum === botLid) ||
                    (OWNER_NUMBER && (senderNum === OWNER_NUMBER || altNum === OWNER_NUMBER));

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

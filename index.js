const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.stack || err);
});

const port = Number(config.PORT) || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('RFK-BOT is running');
}).listen(port, () => {
  console.log('HTTP server listening on port', port);
});

async function fetchSessionIfNeeded() {
  fs.mkdirSync('./session', { recursive: true });
  const credsPath = path.join('./session', 'creds.json');

  if (fs.existsSync(credsPath)) {
    console.log('നിലവിലുള്ള session/creds.json ഉപയോഗിക്കുന്നു.');
    return true;
  }

  if (!config.SESSION_ID) {
    console.log('SESSION_ID set ചെയ്തിട്ടില്ല; Pairing code രീതിയിലേക്ക് മാറുന്നു.');
    return false;
  }

  const baseUrl = String(config.SESSION_URL || "https://rfk-pair-o7w8.onrender.com").replace(/\/+$/, "");
  try {
    const latestRes = await axios.get(`${baseUrl}/latest-session`, { timeout: 10000 });
    const lData = latestRes.data;
    const rawL = typeof lData === "string" ? lData : JSON.stringify(lData);
    JSON.parse(rawL);
    fs.writeFileSync(credsPath, rawL);
    console.log("Latest session automatic aayi save cheythu!");
    return true;
  } catch (_) {}
  const cleanId = String(config.SESSION_ID).trim().replace(/^RFK[-~]/i, '');
  const urls = [
    `${baseUrl}/session/${cleanId}`,
    `${baseUrl}/session/${encodeURIComponent(config.SESSION_ID.trim())}`
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const data = res.data;

      if (data && typeof data === 'object' && data.creds) {
        fs.writeFileSync(credsPath, JSON.stringify(data.creds, null, 2));
        console.log('creds.json സേവ് ചെയ്തു:', url);
        return true;
      }

      const raw = typeof data === 'string' ? data : JSON.stringify(data);
      const b64 = raw.includes('~') ? raw.split('~').slice(1).join('~') : raw;
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      JSON.parse(decoded);
      fs.writeFileSync(credsPath, decoded);
      console.log('Encoded creds.json സേവ് ചെയ്തു:', url);
      return true;
    } catch (err) {
      console.log('Fetch try failed:', url, '-', err.message);
    }
  }

  console.log('സെഷൻ ലഭിച്ചില്ല; Pairing code ഉപയോഗിച്ച് കണക്ട് ചെയ്യാം.');
  return false;
}

async function startBot() {
  try {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default || baileys.makeWASocket;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    await fetchSessionIfNeeded();

    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    const rawPhone = (process.env.PAIR_NUMBER || config.SUDO?.[0] || '').replace(/[^0-9]/g, '');
    if (!sock.authState.creds.registered) {
      if (rawPhone) {
        setTimeout(async () => {
          try {
            const code = await sock.requestPairingCode(rawPhone);
            console.log('====================================');
            console.log('WHATSAPP PAIRING CODE:', code);
            console.log('====================================');
          } catch (err) {
            console.error('Pairing code എടുക്കാൻ കഴിഞ്ഞില്ല:', err.message);
          }
        }, 3000);
      } else {
        console.log('Pairing code എടുക്കാൻ Railway Variables-ൽ PAIR_NUMBER (ഉദാ: 91XXXXXXXXXX) ചേർക്കുക.');
      }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'open') {
        console.log('WhatsApp കണക്ട് ആയി (WORK_TYPE:', config.WORK_TYPE + ')');
      } else if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = code !== DisconnectReason.loggedOut;
        console.log('Connection closed. Code:', code, 'Reconnect:', shouldReconnect);
        if (shouldReconnect) {
          setTimeout(startBot, 3000);
        }
      }
    });

    const pluginsDir = path.join(__dirname, 'plugins');
    if (fs.existsSync(pluginsDir)) {
      const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.js'));
      for (const file of files) {
        try {
          require(path.join(pluginsDir, file));
        } catch (err) {
          console.error('[Plugin error]', file, err.message);
        }
      }
      console.log('Loaded plugins:', files.length);
    }
  } catch (err) {
    console.error('[startBot error]', err?.stack || err);
    setTimeout(startBot, 5000);
  }
}

startBot();

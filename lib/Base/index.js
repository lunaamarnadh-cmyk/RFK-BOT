const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');

// plugins ഫോൾഡറിലുള്ള എല്ലാ .js ഫയലുകളും ലോഡ് ചെയ്യുന്നു
async function loadPlugins() {
  const pluginsDir = path.join(process.cwd(), 'plugins');
  if (!fs.existsSync(pluginsDir)) return;
  const files = fs.readdirSync(pluginsDir).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      require(path.join(pluginsDir, file));
    } catch (err) {
      console.error(`[Plugin skip] ${file}:`, err.message);
    }
  }
  console.log(`Loaded ${files.length} plugin files.`);
}

// SESSION_ID ഉപയോഗിച്ച് സെർവറിൽ നിന്ന് creds.json എടുക്കാൻ ശ്രമിക്കുന്നു
async function fetchSessionFromUrl(sessionId) {
  const baseUrl = (process.env.SESSION_URL || 'https://rfk-pair.onrender.com').trim().replace(/\/+$/, '');
  if (!sessionId) return false;

  const fullId = sessionId.trim();
  const cleanId = fullId.replace(/^RFK~/i, ''); // 'RFK~' പ്രിഫിക്സ് ഒഴിവാക്കുന്നു

  // സാധ്യതയുള്ള API/session പാത്തുകൾ പരിശോധിക്കുന്നു
  const endpoints = [
    `${baseUrl}/session/${cleanId}`,
    `${baseUrl}/session/${fullId}`,
    `${baseUrl}/api/session/${cleanId}`,
    `${baseUrl}/api/session/${fullId}`,
    `${baseUrl}/creds/${cleanId}`,
    `${baseUrl}/get-session/${cleanId}`,
  ];

  fs.mkdirSync('./session', { recursive: true });

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      const rawText = (await res.text()).trim();
      // HTML പേജ് ആണെങ്കിൽ session ഡാറ്റ അല്ലാത്തതിനാൽ ഒഴിവാക്കുന്നു
      if (!rawText || rawText.startsWith('<!DOCTYPE') || rawText.startsWith('<html')) continue;

      if (contentType.includes('application/json') || rawText.startsWith('{')) {
        const parsed = JSON.parse(rawText);
        const credsData = parsed.creds || parsed.session || parsed.data || parsed;
        if (credsData && typeof credsData === 'object') {
          const str = typeof credsData === 'string' ? credsData : JSON.stringify(credsData, null, 2);
          if (str.includes('noiseKey') || str.includes('signedIdentityKey') || str.includes('registrationId')) {
            fs.writeFileSync('./session/creds.json', str);
            console.log(`✅ സെഷൻ creds.json ആയി സേവ് ചെയ്തു: ${url}`);
            return true;
          }
        }
      }

      // Base64 രൂപത്തിലുള്ള ഡാറ്റ ആണെങ്കിൽ ഡീകോഡ് ചെയ്ത് creds.json ആക്കുന്നു
      const b64Part = rawText.includes('~') ? rawText.split('~').slice(1).join('~') : rawText;
      const decoded = Buffer.from(b64Part, 'base64').toString('utf8');
      JSON.parse(decoded);
      fs.writeFileSync('./session/creds.json', decoded);
      console.log(`✅ Encoded സെഷൻ creds.json ആയി സേവ് ചെയ്തു: ${url}`);
      return true;
    } catch (_) {}
  }

  throw new Error('സെർവറിൽ നിന്ന് creds.json ഡാറ്റ ലഭിച്ചില്ല. പെയർ സെർവറിൽ session fetch route ഉണ്ടോ എന്ന് പരിശോധിക്കുക.');
}

// പ്രധാന ബോട്ട് ഫംഗ്ഷൻ
async function Jarvis(options = {}) {
  console.log('Jarvis initialized:', options);
  await loadPlugins();

  const makeWASocket = global.Baileys?.default || global.Baileys?.makeWASocket;
  if (!makeWASocket) {
    console.error('Baileys makeWASocket ലഭ്യമല്ല.');
    return;
  }

  // SESSION_ID നൽകിയിട്ടുണ്ടെങ്കിൽ സെഷൻ ഡൗൺലോഡ് ചെയ്യാൻ ശ്രമിക്കുന്നു
  if (process.env.SESSION_ID) {
    try {
      await fetchSessionFromUrl(process.env.SESSION_ID);
    } catch (err) {
      console.error('സെഷൻ ഡൗൺലോഡ് എറർ:', err.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const { version } = await fetchLatestBaileysVersion();
  const phoneNumber = (process.env.PAIR_NUMBER || '').replace(/[^0-9]/g, '');

  const sock = makeWASocket({
    version,
    auth: state,
    browser: ['Chrome', 'Linux', '1.0.0'],
  });

  // രജിസ്റ്റർ ചെയ്തിട്ടില്ലെങ്കിൽ PAIR_NUMBER ഉപയോഗിച്ച് Pairing Code ജനറേറ്റ് ചെയ്യുന്നു
  if (phoneNumber && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`\n====================================`);
        console.log(`🔑 PAIRING CODE (${phoneNumber}): ${code}`);
        console.log(`====================================\n`);
      } catch (err) {
        console.error('Pairing code എറർ:', err.message);
      }
    }, 3000);
  }

  // സെഷൻ അപ്ഡേറ്റുകൾ സേവ് ചെയ്യുന്നു
  sock.ev.on('creds.update', saveCreds);

  // WhatsApp കണക്ഷൻ സ്റ്റാറ്റസ് നിരീക്ഷിക്കുന്നു
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('✅ WhatsApp വിജയകരമായി കണക്റ്റ് ആയി!');
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed (code: ${statusCode}). Reconnect: ${shouldReconnect}`);
      if (shouldReconnect) {
        Jarvis({ isStarted: true });
      }
    }
  });

  return sock;
}

module.exports = { Jarvis };

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", ".rfk_tempmails.json");

function loadMailDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch {}
  return {};
}

function saveMailDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

function randomString(len = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function createTempAccount() {
  // Primary: Mail.tm official free REST API
  const domainRes = await axios.get("https://api.mail.tm/domains", { timeout: 15000 });
  const domains = domainRes.data?.["hydra:member"] || [];
  if (!domains.length) throw new Error("No mail domains available right now.");

  const domain = domains[0].domain;
  const address = `${randomString(10)}@${domain}`;
  const password = `Rfk#${randomString(12)}`;

  await axios.post(
    "https://api.mail.tm/accounts",
    { address, password },
    { timeout: 15000 }
  );

  const tokenRes = await axios.post(
    "https://api.mail.tm/token",
    { address, password },
    { timeout: 15000 }
  );

  return {
    address,
    password,
    token: tokenRes.data.token,
    createdAt: Date.now()
  };
}

async function fetchInboxMessages(token) {
  const res = await axios.get("https://api.mail.tm/messages", {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  const list = res.data?.["hydra:member"] || [];
  const detailed = [];

  for (const item of list.slice(0, 5)) {
    try {
      const msgRes = await axios.get(`https://api.mail.tm/messages/${item.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000
      });
      detailed.push(msgRes.data);
    } catch {
      detailed.push(item);
    }
  }
  return detailed;
}

module.exports = {
  pattern: "tempmail",
  alias: ["tmail", "checkmail", "inbox", "delmail"],
  type: "tools",
  desc: "Generate disposable temporary email (.tempmail) and read inbox (.checkmail)",
  async execute({ sock, msg, jid }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const raw = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();
    const cmdName = raw.split(/\s+/)[0].replace(/^[.!\/#]/, "").toLowerCase();

    const senderJid = msg.key.participant || jid;
    const userKey = senderJid.split(":")[0].split("@")[0];
    const db = loadMailDB();

    // 1. Delete Temp Mail
    if (cmdName === "delmail") {
      if (!db[userKey]) {
        return send("ℹ️ *You don't have an active temporary email.*");
      }
      delete db[userKey];
      saveMailDB(db);
      return send("🗑️ *Your temporary email session has been deleted!*");
    }

    // 2. Check Inbox (.checkmail / .inbox)
    if (cmdName === "checkmail" || cmdName === "inbox") {
      const acc = db[userKey];
      if (!acc || !acc.token) {
        return send("❌ *No active Temp Mail found!*\nType `.tempmail` first to generate one.");
      }

      try {
        await sock.sendMessage(jid, { react: { text: "📬", key: msg.key } });
      } catch {}

      try {
        const messages = await fetchInboxMessages(acc.token);
        if (!messages.length) {
          return send(
            `📭 *INBOX IS EMPTY*\n\n` +
            `📧 *Email:* \`${acc.address}\`\n\n` +
            `_Wait a few seconds and send \`.checkmail\` again to refresh._`
          );
        }

        let out = `📬 *TEMP MAIL INBOX (${messages.length})*\n📧 *Address:* \`${acc.address}\`\n━━━━━━━━━━━━━━━━━━\n\n`;
        messages.forEach((m, i) => {
          const from = m.from?.address || m.from?.name || "Unknown Sender";
          const subject = m.subject || "(No Subject)";
          const bodyText = (m.text || m.intro || "").trim().slice(0, 600);
          out += `*${i + 1}. From:* ${from}\n`;
          out += `*Subject:* ${subject}\n`;
          out += `*Message:*\n${bodyText || "[HTML Email]"}\n`;
          out += `━━━━━━━━━━━━━━━━━━\n\n`;
        });

        return send(out.trim());
      } catch (e) {
        return send("❌ *Failed to fetch inbox or session expired. Generate a new one with `.tempmail`!*");
      }
    }

    // 3. Generate New Temp Mail (.tempmail / .tmail)
    try {
      await sock.sendMessage(jid, { react: { text: "📧", key: msg.key } });
    } catch {}

    try {
      const account = await createTempAccount();
      db[userKey] = account;
      saveMailDB(db);

      return send(
        `📧 *TEMPORARY EMAIL GENERATED!*\n\n` +
        `✉️ *Email Address:*\n\`${account.address}\`\n\n` +
        `📌 *How to use:*\n` +
        `• Copy the email above and use it anywhere.\n` +
        `• Type *\`.checkmail\`* (or *\`.inbox\`*) to read received OTPs & messages!\n` +
        `• Type *\`.delmail\`* to remove it.`
      );
    } catch (e) {
      return send(`❌ *Could not generate Temp Mail right now:* ${e.message}`);
    }
  }
};

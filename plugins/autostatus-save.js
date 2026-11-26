const fs = require("fs");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const stateFile = "./autostatus_save.json";

function getState() {
  if (!fs.existsSync(stateFile)) return { enabled: true };
  try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return { enabled: true }; }
}

async function streamToBuffer(stream) {
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

module.exports = [
  {
    pattern: "autosave",
    desc: "Auto view & save WhatsApp statuses to your own chat",
    type: "owner",
    handler: async (sock, msg, args, { isOwner }) => {
      if (!isOwner) return;
      const opt = (args[0] || "").toLowerCase();
      if (opt === "on") {
        fs.writeFileSync(stateFile, JSON.stringify({ enabled: true }));
        return await sock.sendMessage(msg.key.remoteJid, { text: "✅ *Auto Status View & Save ON!*\nഇനി മുതൽ ആര് സ്റ്റാറ്റസ് ഇട്ടാലും തനിയെ കാണുകയും നിങ്ങളുടെ ചാറ്റിലേക്ക് സേവ് ആവുകയും ചെയ്യും." });
      } else if (opt === "off") {
        fs.writeFileSync(stateFile, JSON.stringify({ enabled: false }));
        return await sock.sendMessage(msg.key.remoteJid, { text: "❌ *Auto Status Save OFF!*" });
      }
      const st = getState();
      return await sock.sendMessage(msg.key.remoteJid, { text: `📌 *Auto Status Save:* ${st.enabled ? "ON ✅" : "OFF ❌"}\n\n• *.autosave on*\n• *.autosave off*` });
    }
  },
  {
    on: "message",
    handler: async (sock, msg) => {
      try {
        if (msg.key.remoteJid !== "status@broadcast") return;
        if (msg.key.fromMe) return;

        const st = getState();
        if (!st.enabled) return;

        // 1. Auto View Status immediately
        await sock.readMessages([msg.key]).catch(() => {});

        // 2. Prepare sender details & own chat JID
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const sender = msg.key.participant || msg.participant || "";
        const senderNum = sender.split("@")[0].split(":")[0];
        const pushName = msg.pushName || senderNum;

        const m = msg.message?.ephemeralMessage?.message || msg.message?.viewOnceMessage?.message || msg.message?.viewOnceMessageV2?.message || msg.message;
        if (!m || m.protocolMessage || m.reactionMessage) return;

        const header = `📥 *Status Saved*\n👤 *From:* ${pushName} (+${senderNum})`;

        if (m.imageMessage) {
          const stream = await downloadContentFromMessage(m.imageMessage, "image");
          const buffer = await streamToBuffer(stream);
          const cap = m.imageMessage.caption || "";
          await sock.sendMessage(myJid, {
            image: buffer,
            caption: header + (cap ? `\n\n📝 ${cap}` : "")
          });
        } else if (m.videoMessage) {
          const stream = await downloadContentFromMessage(m.videoMessage, "video");
          const buffer = await streamToBuffer(stream);
          const cap = m.videoMessage.caption || "";
          await sock.sendMessage(myJid, {
            video: buffer,
            caption: header + (cap ? `\n\n📝 ${cap}` : "")
          });
        } else if (m.audioMessage) {
          const stream = await downloadContentFromMessage(m.audioMessage, "audio");
          const buffer = await streamToBuffer(stream);
          await sock.sendMessage(myJid, {
            audio: buffer,
            mimetype: "audio/mp4",
            ptt: Boolean(m.audioMessage.ptt)
          });
          await sock.sendMessage(myJid, { text: header });
        } else if (m.extendedTextMessage || m.conversation) {
          const textBody = m.extendedTextMessage?.text || m.conversation || "";
          if (textBody) {
            await sock.sendMessage(myJid, {
              text: `${header}\n\n💬 *Text:*\n${textBody}`
            });
          }
        }
      } catch (e) {
        console.log("⚠️ AutoStatus Save Error:", e.message);
      }
    }
  }
];


const fs = require("fs");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const stateFile = "./autostatus_save.json";

function getState() {
  if (!fs.existsSync(stateFile)) return { mode: "all" };
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (data.mode) return data;
    return { mode: data.enabled === false ? "off" : "all" };
  } catch {
    return { mode: "all" };
  }
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
    alias: ["autoview", "statussave"],
    desc: "Auto view & save WhatsApp statuses to your own chat",
    type: "owner",
    async execute({ sock, msg, args, reply, isOwner }) {
      if (!isOwner) return;
      const opt = (args?.[0] || "").toLowerCase();

      if (opt === "on" || opt === "all") {
        fs.writeFileSync(stateFile, JSON.stringify({ mode: "all" }));
        return await reply("✅ *Auto Status View & Save ON!*\nഇനി മുതൽ ആര് സ്റ്റാറ്റസ് ഇട്ടാലും തനിയെ കാണുകയും നിങ്ങളുടെ ചാറ്റിലേക്ക് സേവ് ആവുകയും ചെയ്യും.");
      } else if (opt === "view" || opt === "viewonly") {
        fs.writeFileSync(stateFile, JSON.stringify({ mode: "view" }));
        return await reply("👁️ *Auto Status View Only ON!*\nഇനി മുതൽ സ്റ്റാറ്റസ് കാണുക മാത്രം ചെയ്യും (നിങ്ങളുടെ ചാറ്റിലേക്ക് സേവ് ചെയ്യില്ല).");
      } else if (opt === "off" || opt === "skip") {
        fs.writeFileSync(stateFile, JSON.stringify({ mode: "off" }));
        return await reply("❌ *Auto Status View & Save OFF!*\nഇനി മുതൽ സ്റ്റാറ്റസ് കാണുകയോ സേവ് ചെയ്യുകയോ ഇല്ല.");
      }

      const st = getState();
      const statusText =
        st.mode === "all"
          ? "ON (View + Save) ✅"
          : st.mode === "view"
          ? "VIEW ONLY 👁️"
          : "OFF ❌";

      return await reply(
        `📌 *Auto Status Mode:* ${statusText}\n\n` +
        `• *\`.autosave on\`* — കാണുകയും സേവ് ചെയ്യുകയും ചെയ്യും\n` +
        `• *\`.autosave view\`* — കാണുക മാത്രം ചെയ്യും\n` +
        `• *\`.autosave off\`* — പൂർണ്ണമായി നിർത്തും`
      );
    }
  },
  {
    on: "message",
    async execute({ sock, msg }) {
      try {
        if (!msg?.key || msg.key.remoteJid !== "status@broadcast") return;
        if (msg.key.fromMe) return;

        const st = getState();
        if (st.mode === "off") return;

        // 1. Auto View Status immediately
        await sock.readMessages([msg.key]).catch(() => {});

        // Stop here if mode is "view" only
        if (st.mode === "view") return;

        // 2. Auto Save Status to Your Own Chat
        const myJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const sender = msg.key.participant || msg.participant || "";
        const senderNum = sender.split("@")[0].split(":")[0];
        const pushName = msg.pushName || senderNum;

        const m =
          msg.message?.ephemeralMessage?.message ||
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message ||
          msg.message;

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

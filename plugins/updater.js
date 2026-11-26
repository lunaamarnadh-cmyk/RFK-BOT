const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const REPO_OWNER = "lunaamarnadh-cmyk";
const REPO_NAME = "RFK-BOT";
const BRANCH = "main";
const VERSION_FILE = path.join(__dirname, "..", ".rfk_commit_sha");

function sanitizeMessage(rawMsg) {
  const clean = (rawMsg || "Security & Performance Improvements").trim();
  if (/\d{10,15}/.test(clean) || /owner|sudo|number/i.test(clean)) {
    return "Security & Performance Improvements";
  }
  return clean;
}

async function getLatestCommit() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": "RFK-BOT-Updater" },
    timeout: 15000
  });
  return {
    sha: res.data.sha,
    shortSha: res.data.sha.slice(0, 7),
    message: sanitizeMessage(res.data.commit?.message)
  };
}

function getCurrentSha() {
  try {
    if (fs.existsSync(VERSION_FILE)) {
      return fs.readFileSync(VERSION_FILE, "utf8").trim();
    }
  } catch {}
  return "";
}

async function downloadAndApplyUpdate(latest, onSuccess, onError) {
  const zipUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.zip`;
  const tmpZip = path.join("/tmp", `rfk_update_${Date.now()}.zip`);
  const tmpDir = path.join("/tmp", `rfk_extract_${Date.now()}`);

  const response = await axios({
    method: "GET",
    url: zipUrl,
    responseType: "arraybuffer",
    timeout: 30000
  });

  fs.writeFileSync(tmpZip, Buffer.from(response.data));
  fs.mkdirSync(tmpDir, { recursive: true });

  const rootDir = path.join(__dirname, "..");

  const updateScript = `
    unzip -qo "${tmpZip}" -d "${tmpDir}" && \
    SRC_DIR=$(find "${tmpDir}" -mindepth 1 -maxdepth 1 -type d | head -n 1) && \
    cp -rf "$SRC_DIR/index.js" "${rootDir}/" && \
    cp -rf "$SRC_DIR/plugins/"* "${rootDir}/plugins/" && \
    rm -rf "${tmpZip}" "${tmpDir}"
  `;

  exec(updateScript, async (err) => {
    if (err) {
      const pyFallback = `python3 -c "import zipfile, shutil, os; z=zipfile.ZipFile('${tmpZip}'); z.extractall('${tmpDir}'); sub=os.path.join('${tmpDir}', os.listdir('${tmpDir}')[0]); shutil.copy2(os.path.join(sub,'index.js'), '${rootDir}/index.js'); shutil.copytree(os.path.join(sub,'plugins'), '${rootDir}/plugins', dirs_exist_ok=True)" && rm -rf "${tmpZip}" "${tmpDir}"`;
      exec(pyFallback, async (pyErr) => {
        if (pyErr) return onError(pyErr);
        fs.writeFileSync(VERSION_FILE, latest.sha);
        await onSuccess();
      });
      return;
    }

    fs.writeFileSync(VERSION_FILE, latest.sha);
    await onSuccess();
  });
}

if (!global._rfkAutoUpdaterStarted) {
  global._rfkAutoUpdaterStarted = true;
  setInterval(async () => {
    try {
      const latest = await getLatestCommit();
      const currentSha = getCurrentSha();

      if (!currentSha) {
        fs.writeFileSync(VERSION_FILE, latest.sha);
        return;
      }

      if (currentSha !== latest.sha) {
        console.log(`🔄 Auto-updating RFK-BOT to ${latest.shortSha}...`);
        await downloadAndApplyUpdate(
          latest,
          async () => {
            console.log(`✅ Auto-update ${latest.shortSha} installed! Restarting...`);
            setTimeout(() => process.exit(0), 1500);
          },
          (e) => console.error("❌ Auto-update failed:", e.message)
        );
      }
    } catch {}
  }, 10 * 60 * 1000);
}

module.exports = {
  pattern: "update",
  alias: ["updatenow", "chkupdate"],
  type: "owner",
  desc: "Check and install bot updates directly from WhatsApp",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase();

    const isInstall = body.startsWith(".updatenow") || (text && text.toLowerCase().includes("now"));

    try {
      if (!isInstall) {
        await send("🔍 *Checking for updates...*");
        const latest = await getLatestCommit();
        const currentSha = getCurrentSha();

        if (currentSha && currentSha === latest.sha) {
          return send(
            `✅ *RFK-BOT is already up to date!*\n\n` +
            `📌 *Version:* \`${latest.shortSha}\`\n` +
            `📝 *Last Change:* ${latest.message}`
          );
        }

        return send(
          `🆕 *NEW UPDATE AVAILABLE!*\n\n` +
          `📌 *Latest Version:* \`${latest.shortSha}\`\n` +
          `📝 *Changes:* ${latest.message}\n\n` +
          `⚡ Type *.updatenow* to update directly from WhatsApp!`
        );
      }

      await send("⏳ *Downloading latest update from GitHub... Please wait.*");
      const latest = await getLatestCommit();

      await downloadAndApplyUpdate(
        latest,
        async () => {
          await send(
            `✅ *Update Installed Successfully!*\n\n` +
            `📌 *Version:* \`${latest.shortSha}\`\n` +
            `📝 *Changes:* ${latest.message}\n\n` +
            `🔄 *Restarting bot now...*`
          );
          setTimeout(() => process.exit(0), 1500);
        },
        async (e) => {
          await send(`❌ *Update Extraction Error:* ${e.message}`);
        }
      );
    } catch (e) {
      return send(`❌ *Update Failed:* ${e.message}`);
    }
  }
};

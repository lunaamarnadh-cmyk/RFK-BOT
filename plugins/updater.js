const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const REPO_OWNER = "lunaamarnadh-cmyk";
const REPO_NAME = "RFK-BOT";
const BRANCH = "main";
const VERSION_FILE = path.join(__dirname, "..", ".rfk_commit_sha");
const CUSTOM_VER_FILE = path.join(__dirname, "..", ".rfk_version_tag");

function getCustomVersion() {
  try {
    if (fs.existsSync(CUSTOM_VER_FILE)) {
      const v = fs.readFileSync(CUSTOM_VER_FILE, "utf8").trim();
      if (v) return v;
    }
  } catch {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    if (pkg.version) return `v${pkg.version.replace(/^v/i, "")}`;
  } catch {}
  return "v2.0.0";
}

function setCustomVersion(newVer) {
  const clean = newVer.trim();
  fs.writeFileSync(CUSTOM_VER_FILE, clean);
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      pkg.version = clean.replace(/^v/i, "");
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    }
  } catch {}
}

function fastRestart(sock) {
  try {
    // Close WebSocket cleanly so WhatsApp releases session lock immediately without timeout delay
    if (sock && sock.ws) {
      sock.ws.close();
    }
  } catch {}
  setTimeout(() => {
    process.exit(0);
  }, 250);
}

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
    timeout: 10000
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
    timeout: 20000
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

// Manual update only via .updatenow

module.exports = {
  pattern: "update",
  alias: ["updatenow", "chkupdate", "setversion", "version", "restart", "reboot"],
  type: "owner",
  desc: "Fast update (.updatenow), instant restart (.restart), and version control (.setversion)",
  async execute({ sock, msg, jid, isOwner, text }) {
    const send = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });

    const body = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim();

    const parts = body.split(/\s+/);
    const cmdName = parts[0].replace(/^[.!\/#]/, "").toLowerCase();
    const arg = (parts[1] || text || "").trim();

    // Instant Restart (.restart / .reboot)
    if (cmdName === "restart" || cmdName === "reboot") {
      if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");
      await send("⚡ *Fast-restarting RFK-BOT... Back in 2 seconds!*");
      return fastRestart(sock);
    }

    // Show current version (.version)
    if (cmdName === "version") {
      const ver = getCustomVersion();
      const sha = getCurrentSha().slice(0, 7) || "latest";
      return send(`🤖 *RFK-BOT Version:* \`${ver}\` (Build \`${sha}\`)`);
    }

    // Change version number (.setversion v2.5.0)
    if (cmdName === "setversion") {
      if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");
      if (!arg) {
        return send(
          `📌 *Current Version:* \`${getCustomVersion()}\`\n\n` +
          `*Usage:* \`.setversion v2.5.0\``
        );
      }
      setCustomVersion(arg);
      return send(`✅ *Bot Version updated to:* \`${arg}\``);
    }

    if (!isOwner) return send("❌ *This command is only for the Bot Owner!*");

    const isInstall =
      cmdName === "updatenow" ||
      body.toLowerCase().startsWith(".update now") ||
      (text && text.toLowerCase().includes("now"));

    try {
      const ver = getCustomVersion();

      if (!isInstall) {
        await send("🔍 *Checking for updates...*");
        const latest = await getLatestCommit();
        const currentSha = getCurrentSha();

        if (currentSha && currentSha === latest.sha) {
          return send(
            `✅ *RFK-BOT is already up to date!*\n\n` +
            `📌 *Version:* \`${ver}\` (\`${latest.shortSha}\`)\n` +
            `📝 *Last Change:* ${latest.message}`
          );
        }

        return send(
          `🆕 *NEW UPDATE AVAILABLE!*\n\n` +
          `📌 *Version:* \`${ver}\` (\`${latest.shortSha}\`)\n` +
          `📝 *Changes:* ${latest.message}\n\n` +
          `⚡ Type *.updatenow* to update directly from WhatsApp!`
        );
      }

      await send("⏳ *Downloading latest update...*");
      const latest = await getLatestCommit();

      await downloadAndApplyUpdate(
        latest,
        async () => {
          await send(
            `✅ *Update Installed Successfully!*\n\n` +
            `📌 *Version:* \`${ver}\` (\`${latest.shortSha}\`)\n` +
            `📝 *Changes:* ${latest.message}\n\n` +
            `⚡ *Fast-restarting bot now...*`
          );
          fastRestart(sock);
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

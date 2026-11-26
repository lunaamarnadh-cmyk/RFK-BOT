const { cmd } = require("../command");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const REPO_OWNER = "lunaamarnadh-cmyk";
const REPO_NAME = "RFK-BOT";
const BRANCH = "main";
const VERSION_FILE = path.join(__dirname, "..", ".rfk_commit_sha");

async function getLatestCommit() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}`;
  const res = await axios.get(url, {
    headers: { "User-Agent": "RFK-BOT-Updater" },
    timeout: 15000
  });
  return {
    sha: res.data.sha,
    shortSha: res.data.sha.slice(0, 7),
    message: res.data.commit?.message || "Update",
    date: res.data.commit?.author?.date || ""
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

cmd(
  {
    pattern: "update",
    desc: "Check for new bot updates from GitHub",
    category: "owner",
    react: "🔄",
    filename: __filename
  },
  async (conn, mek, m, { from, isOwner, reply }) => {
    if (!isOwner) return reply("❌ *This command is only for the Bot Owner!*");

    try {
      await reply("🔍 *Checking for updates...*");
      const latest = await getLatestCommit();
      const currentSha = getCurrentSha();

      if (currentSha && currentSha === latest.sha) {
        return reply(
          `✅ *RFK-BOT is already up to date!*\n\n` +
          `📌 *Version:* \`${latest.shortSha}\`\n` +
          `📝 *Last Change:* ${latest.message}`
        );
      }

      return reply(
        `🆕 *NEW UPDATE AVAILABLE!*\n\n` +
        `📌 *Latest Version:* \`${latest.shortSha}\`\n` +
        `📝 *Changes:* ${latest.message}\n\n` +
        `⚡ Type *.updatenow* to update directly from WhatsApp!`
      );
    } catch (e) {
      return reply(`❌ *Update Check Failed:* ${e.message}`);
    }
  }
);

cmd(
  {
    pattern: "updatenow",
    desc: "Download and install the latest update directly from WhatsApp",
    category: "owner",
    react: "⚡",
    filename: __filename
  },
  async (conn, mek, m, { from, isOwner, reply }) => {
    if (!isOwner) return reply("❌ *This command is only for the Bot Owner!*");

    try {
      await reply("⏳ *Downloading latest update from GitHub... Please wait.*");
      const latest = await getLatestCommit();

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
            if (pyErr) {
              return reply(`❌ *Update Extraction Error:* ${pyErr.message}`);
            }
            fs.writeFileSync(VERSION_FILE, latest.sha);
            await reply(
              `✅ *Update Installed Successfully!*\n\n` +
              `📌 *Version:* \`${latest.shortSha}\`\n` +
              `📝 *Changes:* ${latest.message}\n\n` +
              `🔄 *Restarting bot now...*`
            );
            setTimeout(() => process.exit(0), 1500);
          });
          return;
        }

        fs.writeFileSync(VERSION_FILE, latest.sha);
        await reply(
          `✅ *Update Installed Successfully!*\n\n` +
          `📌 *Version:* \`${latest.shortSha}\`\n` +
          `📝 *Changes:* ${latest.message}\n\n` +
          `🔄 *Restarting bot now...*`
        );
        setTimeout(() => process.exit(0), 1500);
      });
    } catch (e) {
      return reply(`❌ *Update Failed:* ${e.message}`);
    }
  }
);

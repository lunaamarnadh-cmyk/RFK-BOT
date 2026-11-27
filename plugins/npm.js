const axios = require("axios");

const formatBytes = (b) => {
  if (!b) return "Not Available";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

const getJson = async (url) => {
  const { data } = await axios.get(url, { timeout: 20000 });
  return data;
};

module.exports = {
  pattern: "npm",
  desc: "npm package details",
  type: "stalk",
  async execute({ sock, msg, jid, args }) {
    const quotedText =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
      "";
    const match = (args.join(" ") || quotedText).trim();

    if (!match) {
      return sock.sendMessage(
        jid,
        { text: "*Need a package name*\n_Example: .npm axios_" },
        { quoted: msg }
      );
    }

    const name = match.split(/\s+/)[0].toLowerCase();
    let pkg;
    try {
      pkg = await getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    } catch {
      return sock.sendMessage(jid, { text: "*Package not found*" }, { quoted: msg });
    }

    if (!pkg?.name) {
      return sock.sendMessage(jid, { text: "*Package not found*" }, { quoted: msg });
    }

    let week, month;
    try {
      week = (await getJson(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`)).downloads;
    } catch {}
    try {
      month = (await getJson(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(name)}`)).downloads;
    } catch {}

    const repo = (pkg.repository?.url || "")
      .replace(/^git\+/, "")
      .replace(/\.git$/, "")
      .replace(/^git:\/\//, "https://");
    const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
    const maintainers = (pkg.maintainers || []).map((m) => m.name).join(", ");

    const info =
      `\n⎔ *Name* : ${pkg.name}\n⎔ *Version* : ${pkg.version}\n⎔ *Description* : ${pkg.description || "Not Available"}\n\n` +
      `➭ *License* : ${pkg.license || "Not Available"}\n` +
      `➭ *Author* : ${author || "Not Available"}\n` +
      `➭ *Maintainers* : ${maintainers || "Not Available"}\n` +
      `➭ *Weekly Downloads* : ${week !== undefined ? week.toLocaleString() : "Not Available"}\n` +
      `➭ *Monthly Downloads* : ${month !== undefined ? month.toLocaleString() : "Not Available"}\n` +
      `➭ *Dependencies* : ${Object.keys(pkg.dependencies || {}).length}\n` +
      `➭ *Unpacked Size* : ${formatBytes(pkg.dist?.unpackedSize)}\n` +
      `➭ *Keywords* : ${(pkg.keywords || []).slice(0, 10).join(", ") || "Not Available"}\n` +
      `➭ *Homepage* : ${pkg.homepage || "Not Available"}\n` +
      `➭ *Repository* : ${repo || "Not Available"}\n` +
      `➭ *Install* : npm i ${pkg.name}\n` +
      `➭ *NPM URL* : https://www.npmjs.com/package/${pkg.name}\n`;

    await sock.sendMessage(jid, { text: info }, { quoted: msg });
  }
};

require('dotenv').config({
  path: require('fs').existsSync('config.env') ? 'config.env' : '.env'
});

const toBool = (x) => (x && (x.toLowerCase() === 'true' || x.toLowerCase() === 'on' || x.toLowerCase() === 'yes')) || false;

module.exports = {
  SESSION_ID: process.env.SESSION_ID || '',
  SESSION_URL: process.env.SESSION_URL || 'https://rfk-pair-site-production.up.railway.app',
  WORK_TYPE: process.env.WORK_TYPE || 'private',
  PORT: process.env.PORT || 3000,
  ALLWAYS_ONLINE: toBool(process.env.ALLWAYS_ONLINE || 'true'),
  ALIVE_DATA: process.env.ALIVE_DATA || '*_RFK-BOT is alive now_*',
  SUDO: (process.env.SUDO || '').split(',').map((n) => n.replace(/[^0-9]/g, '').trim()).filter(Boolean)
};

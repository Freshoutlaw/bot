require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const { handleMessage } = require('./messageHandler');
const { startWebServer } = require('./web');
const sessionState = require('./sessionState');

// expose for backwards compatibility
global.emitQR = sessionState.setQR;
global.emitStatus = sessionState.setStatus;

// ─── WhatsApp Client Setup ───────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.SESSION_PATH || '.wwebjs_auth',
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

global.sendWhatsAppMessage = async (phone, text) => {
  try {
    const sent = await client.sendMessage(phone, text);
    return sent;
  } catch (err) {
    logger.error('Failed to send WhatsApp message:', err.message || err);
    throw err;
  }
};

// ─── QR Code Generation ──────────────────────────────────────────────────────
client.on('qr', (qr) => {
  logger.info('QR code received — scan with WhatsApp to link your account');
  qrcode.generate(qr, { small: true });
  try { sessionState.setQR(qr); sessionState.setStatus('qr'); } catch (e) {}
  if (global.emitQR) global.emitQR(qr);
});

// ─── Client Ready ────────────────────────────────────────────────────────────
let reconnectAttempts = 0;

client.on('ready', () => {
  logger.info('✅ WhatsApp bot is ready and connected!');
  reconnectAttempts = 0;
  const number = client.info?.wid?.user || null;
  global.botNumber = number;
  try { sessionState.setBotNumber(number); sessionState.setStatus('connected'); } catch (e) {}
  if (global.emitStatus) global.emitStatus('connected');
});

// ─── Authentication ───────────────────────────────────────────────────────────
client.on('authenticated', () => {
  logger.info('🔐 WhatsApp session authenticated');
  try { sessionState.setStatus('authenticated'); } catch (e) {}
  if (global.emitStatus) global.emitStatus('authenticated');
});

client.on('auth_failure', (msg) => {
  logger.error('❌ Authentication failed:', msg);
  try { sessionState.setStatus('auth_failed'); } catch (e) {}
  if (global.emitStatus) global.emitStatus('auth_failed');
});

// Optional state change listener (more granular lifecycle events)
try {
  client.on('change_state', (state) => {
    logger.info('Client state changed:', state);
    try { sessionState.setStatus(state); } catch (e) {}
    if (global.emitStatus) global.emitStatus(state);
  });
} catch (e) {
  // Some client versions may not emit change_state; ignore safely.
}

client.on('disconnected', (reason) => {
  logger.warn('⚠️  WhatsApp disconnected:', reason);
  global.botNumber = null;
  try { sessionState.setBotNumber(null); sessionState.setStatus('disconnected'); } catch (e) {}
  if (global.emitStatus) global.emitStatus('disconnected');
  // Exponential backoff reconnect
  reconnectAttempts = Math.min(6, reconnectAttempts + 1);
  const delay = Math.min(60000, 5000 * Math.pow(2, reconnectAttempts - 1));
  logger.info(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(() => {
    try {
      client.initialize();
    } catch (err) {
      logger.error('Reconnect attempt failed to start:', err.message || err);
    }
  }, delay);
});

// ─── Message Handler ─────────────────────────────────────────────────────────
client.on('message', async (message) => {
  try {
    // Ignore group messages and status updates
    if (message.from === 'status@broadcast') return;
    if (message.isGroupMsg) return;

    logger.info(`📩 Message from ${message.from}: ${message.body}`);
    await handleMessage(client, message);
  } catch (err) {
    logger.error('Error handling message:', err);
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
(async () => {
  logger.info('🚀 Starting WhatsApp Waitlist Bot...');
  startWebServer(); // Start web dashboard
  client.initialize(); // Connect WhatsApp
})();

module.exports = { client };
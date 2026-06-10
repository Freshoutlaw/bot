const { joinWaitlist, checkPosition, cancelWaitlist, getStats } = require('./waitlist');
const { getAIResponse, getDefaultResponse } = require('./groqAI');
const { logChatMessage } = require('./chatHistory');
const logger = require('./logger');
const { normalizePhone } = require('./utils/phone');
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(process.cwd(), 'data', 'sessions.json');

function loadSessionsFromDisk() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    Object.keys(obj || {}).forEach((k) => sessions.set(k, obj[k]));
  } catch (e) {
    logger.warn('Failed to load sessions from disk:', e.message || e);
  }
}

function saveSessionsToDisk() {
  try {
    const obj = {};
    sessions.forEach((v, k) => { obj[k] = v; });
    const dir = path.dirname(SESSIONS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    logger.warn('Failed to save sessions to disk:', e.message || e);
  }
}

// load persisted sessions at startup
loadSessionsFromDisk();

// ─── Conversation State ───────────────────────────────────────────────────────
// Tracks multi-step conversations per user
const sessions = new Map();

const STATE = {
  IDLE: 'idle',
  AWAITING_NAME: 'awaiting_name',
  AWAITING_ISSUE: 'awaiting_issue',
  CONFIRM_CANCEL: 'confirm_cancel',
};

function getSession(phone) {
  const p = normalizePhone(phone);
  if (!sessions.has(p)) sessions.set(p, { state: STATE.IDLE, data: {} });
  return sessions.get(p);
}

function setSession(phone, update) {
  const p = normalizePhone(phone);
  const current = getSession(p);
  sessions.set(p, { ...current, ...update });
  saveSessionsToDisk();
}

function clearSession(phone) {
  const p = normalizePhone(phone);
  sessions.set(p, { state: STATE.IDLE, data: {} });
  saveSessionsToDisk();
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const messageCount = new Map();

function isRateLimited(phone) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxMessages = 20;

  const record = messageCount.get(phone) || { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    messageCount.set(phone, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (record.count >= maxMessages) {
    logger.warn(`⚠️ Rate limit hit for ${phone}`);
    return true;
  }

  record.count++;
  messageCount.set(phone, record);
  return false;
}

// ─── Message Templates ────────────────────────────────────────────────────────
const messages = {
  welcome: (name) =>
    `👋 Welcome to Customer Service!\n\nHello${name ? ` *${name}*` : ''}! I'm your virtual assistant.\n\n` +
    `What would you like to do?\n\n` +
    `• Reply *JOIN* — Join the waitlist\n` +
    `• Reply *STATUS* — Check your position\n` +
    `• Reply *CANCEL* — Leave the waitlist\n` +
    `• Reply *HELP* — See all options`,

  help: () =>
    `📋 *Available Commands*\n\n` +
    `*JOIN* — Join the customer service waitlist\n` +
    `*STATUS* — Check your current position\n` +
    `*CANCEL* — Remove yourself from the waitlist\n` +
    `*STATS* — View current queue statistics\n` +
    `*HELP* — Show this menu\n\n` +
    `_Type any command to get started!_`,

  joined: (name, ticketId, position, estimatedWait) =>
    `✅ *You're on the waitlist!*\n\n` +
    `👤 Name: ${name}\n` +
    (ticketId ? `🎫 Ticket: *${ticketId}*\n` : '') +
    `📍 Position: *#${position}*\n` +
    `⏱️ Estimated wait: *~${estimatedWait} minutes*\n\n` +
    `You'll be notified when it's your turn. Reply *STATUS* anytime to check your position.`,

  alreadyWaiting: (position, estimatedWait, ticketId) =>
    `ℹ️ You're already on the waitlist!\n\n` +
    (ticketId ? `🎫 Ticket: *${ticketId}*\n` : '') +
    `📍 Current position: *#${position}*\n` +
    `⏱️ Estimated wait: *~${estimatedWait} minutes*\n\n` +
    `Reply *CANCEL* if you'd like to leave the queue.`,

  status: (name, position, estimatedWait, total, ticketId) =>
    `📊 *Your Waitlist Status*\n\n` +
    `👤 Name: ${name}\n` +
    (ticketId ? `🎫 Ticket: *${ticketId}*\n` : '') +
    `📍 Position: *#${position}* of ${total}\n` +
    `⏱️ Estimated wait: *~${estimatedWait} minutes*\n\n` +
    `We appreciate your patience! Reply *CANCEL* to leave the queue.`,

  notOnList: () =>
    `You're not currently on the waitlist.\n\nReply *JOIN* to add yourself to the queue! 😊`,

  askName: () => `Great! To join the waitlist, please tell me your *full name*:`,

  askIssue: (name) =>
    `Thanks, *${name}*! 👍\n\nBriefly describe your issue or reason for visiting _(optional — reply SKIP to skip)_:`,

  confirmCancel: () =>
    `Are you sure you want to leave the waitlist? You'll lose your current position.\n\n` +
    `Reply *YES* to confirm or *NO* to keep your spot.`,

  cancelled: () =>
    `✅ You've been removed from the waitlist.\n\nReply *JOIN* anytime to rejoin. Have a great day! 👋`,

  cancelAborted: () =>
    `👍 No problem! You're still on the waitlist. Reply *STATUS* to check your position.`,

  notCancellable: () =>
    `You're not currently on the waitlist, so there's nothing to cancel.\n\nReply *JOIN* to join the queue!`,

  stats: (s) =>
    `📈 *Current Queue Stats*\n\n` +
    `⏳ Waiting: *${s.waiting}* people\n` +
    `🔧 Currently being served: *${s.serving}*\n` +
    `✅ Served today: *${s.done}*\n\n` +
    `Reply *JOIN* to get in line!`,

  rateLimited: () =>
    `⚠️ You're sending messages too quickly. Please wait a moment before trying again.`,

  error: () =>
    `Sorry, something went wrong. Please try again or reply *HELP* for options.`,
};

// ─── Main Message Handler ─────────────────────────────────────────────────────
async function replyAndLog(message, text, phone, metadata = {}) {
  try {
    await message.reply(text);
    logChatMessage({ phone, direction: 'bot', text, metadata });
  } catch (err) {
    logger.error('Failed to send reply:', err.message || err);
  }
}

async function handleMessage(client, message) {
  const phone = message.from;
  const body = (message.body || '').trim();

  logChatMessage({ phone, direction: 'user', text: body, metadata: { state: getSession(phone).state } });

  // Rate limiting
  if (isRateLimited(phone)) {
    await replyAndLog(message, messages.rateLimited(), phone, { reason: 'rate_limited' });
    return;
  }

  const session = getSession(phone);
  const cmd = body.toUpperCase();

  // ── Handle multi-step conversation states ────────────────────────────────
  if (session.state === STATE.AWAITING_NAME) {
    return await handleNameInput(client, message, phone, body);
  }

  if (session.state === STATE.AWAITING_ISSUE) {
    return await handleIssueInput(client, message, phone, body, cmd);
  }

  if (session.state === STATE.CONFIRM_CANCEL) {
    return await handleCancelConfirm(client, message, phone, cmd);
  }

  // ── Handle commands ──────────────────────────────────────────────────────
  if (cmd === 'JOIN' || cmd === 'JOIN WAITLIST') {
    const existing = checkPosition(phone);
    if (existing) {
      await replyAndLog(message, messages.alreadyWaiting(existing.position, existing.estimatedWait, existing.entry.ticketId), phone, { command: 'join', alreadyWaiting: true });
    } else {
      setSession(phone, { state: STATE.AWAITING_NAME });
      await replyAndLog(message, messages.askName(), phone, { command: 'join', next: 'awaiting_name' });
    }
    return;
  }

  if (cmd === 'STATUS' || cmd === 'CHECK' || cmd === 'POSITION') {
    const info = checkPosition(phone);
    if (!info) {
      await replyAndLog(message, messages.notOnList(), phone, { command: 'status', onList: false });
    } else {
      await replyAndLog(message, messages.status(info.entry.name, info.position, info.estimatedWait, info.totalWaiting, info.entry.ticketId), phone, { command: 'status', ticketId: info.entry.ticketId });
    }
    return;
  }

  if (cmd === 'CANCEL' || cmd === 'LEAVE') {
    const info = checkPosition(phone);
    if (!info) {
      await replyAndLog(message, messages.notCancellable(), phone, { command: 'cancel', onList: false });
    } else {
      setSession(phone, { state: STATE.CONFIRM_CANCEL });
      await replyAndLog(message, messages.confirmCancel(), phone, { command: 'cancel', next: 'confirm' });
    }
    return;
  }

  if (cmd === 'STATS' || cmd === 'QUEUE') {
    const stats = getStats();
    await replyAndLog(message, messages.stats(stats), phone, { command: 'stats' });
    return;
  }

  if (
    cmd === 'HELP' ||
    cmd === 'HI' ||
    cmd === 'HELLO' ||
    cmd === 'START' ||
    cmd === 'MENU' ||
    cmd === 'SUPPORT' ||
    cmd === 'TICKET'
  ) {
    const contact = await message.getContact();
    const name = contact.pushname || '';
    await replyAndLog(message, messages.welcome(name), phone, { command: 'help' });
    return;
  }

  // ── Fallback: AI-powered response ────────────────────────────────────────
  const positionInfo = checkPosition(phone);
  const aiContext = positionInfo
    ? { position: positionInfo.position, estimatedWait: positionInfo.estimatedWait }
    : {};

  const aiReply = await getAIResponse(body, aiContext);
  await replyAndLog(message, aiReply, phone, { command: 'ai_fallback', positionInfo });
}

// ─── Multi-step Handlers ──────────────────────────────────────────────────────
async function handleNameInput(client, message, phone, name) {
  if (!name || name.length < 2) {
    await replyAndLog(message, 'Please enter a valid name (at least 2 characters):', phone, { command: 'name_validation' });
    return;
  }

  setSession(phone, {
    state: STATE.AWAITING_ISSUE,
    data: { name },
  });

  await replyAndLog(message, messages.askIssue(name), phone, { command: 'ask_issue' });
}

async function handleIssueInput(client, message, phone, issue, cmd) {
  const session = getSession(phone);
  const name = session.data.name;
  const finalIssue = cmd === 'SKIP' ? '' : issue;

  const result = joinWaitlist(phone, name, finalIssue);
  clearSession(phone);

  if (result.success) {
    await replyAndLog(
      message,
      messages.joined(result.entry.name, result.entry.ticketId, result.position, result.position * 10),
      phone,
      { command: 'join_complete', ticketId: result.entry.ticketId }
    );
  } else if (result.reason === 'already_waiting') {
    const info = checkPosition(phone);
    await replyAndLog(message, messages.alreadyWaiting(info.position, info.estimatedWait, info.entry.ticketId), phone, { command: 'join', alreadyWaiting: true });
  } else {
    await replyAndLog(message, messages.error(), phone, { command: 'join', error: true });
  }
}

async function handleCancelConfirm(client, message, phone, cmd) {
  clearSession(phone);

  if (cmd === 'YES' || cmd === 'Y') {
    const result = cancelWaitlist(phone);
    if (result.success) {
      await replyAndLog(message, messages.cancelled(), phone, { command: 'cancel_confirmed' });
    } else {
      await replyAndLog(message, messages.notCancellable(), phone, { command: 'cancel_confirmed', onList: false });
    }
  } else {
    await replyAndLog(message, messages.cancelAborted(), phone, { command: 'cancel_aborted' });
  }
}

module.exports = { handleMessage };
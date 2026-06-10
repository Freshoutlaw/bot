const fs = require('fs');
const path = require('path');
const { normalizePhone } = require('./utils/phone');

const DATA_FILE = path.join(process.cwd(), 'data', 'chatHistory.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) {
    return { threads: {}, messages: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { threads: {}, messages: [] };
  }
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureThread(phone, info = {}) {
  const data = loadData();
  const normalized = normalizePhone(phone);
  if (!data.threads[normalized]) {
    data.threads[normalized] = {
      phone: normalized,
      name: info.name || 'Unknown',
      issue: info.issue || '',
      status: info.status || 'new',
      ticketId: info.ticketId || '',
      lastMessage: '',
      lastDirection: 'user',
      lastUpdated: new Date().toISOString(),
      messageCount: 0,
    };
  } else {
    data.threads[normalized] = {
      ...data.threads[normalized],
      name: info.name || data.threads[normalized].name,
      issue: info.issue || data.threads[normalized].issue,
      status: info.status || data.threads[normalized].status,
      ticketId: info.ticketId || data.threads[normalized].ticketId,
    };
  }
  saveData(data);
  return data.threads[normalized];
}

function logChatMessage({ phone, name, issue, status, direction, text, metadata = {} }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const data = loadData();
  const thread = ensureThread(normalized, { name, issue, status, ticketId: status?.ticketId || undefined });
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    phone: normalized,
    direction,
    text: String(text || '').trim(),
    metadata,
    timestamp: new Date().toISOString(),
  };

  data.messages.push(message);
  data.threads[normalized] = {
    ...thread,
    name: name || thread.name,
    issue: issue || thread.issue,
    status: status || thread.status,
    ticketId: status?.ticketId || thread.ticketId,
    lastMessage: message.text,
    lastDirection: direction,
    lastUpdated: message.timestamp,
    messageCount: (thread.messageCount || 0) + 1,
  };
  saveData(data);
  return message;
}

function getChatThreads() {
  const data = loadData();
  return Object.values(data.threads).sort(
    (a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated)
  );
}

function getChatHistory(phone) {
  const normalized = normalizePhone(phone);
  const data = loadData();
  return data.messages
    .filter((message) => message.phone === normalized)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function updateThreadInfo(phone, updates = {}) {
  const normalized = normalizePhone(phone);
  const data = loadData();
  if (!data.threads[normalized]) return null;
  data.threads[normalized] = {
    ...data.threads[normalized],
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  saveData(data);
  return data.threads[normalized];
}

module.exports = {
  logChatMessage,
  getChatThreads,
  getChatHistory,
  updateThreadInfo,
};

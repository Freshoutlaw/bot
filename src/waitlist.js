const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { normalizePhone } = require('./utils/phone');

// ─── Persistent File Storage ─────────────────────────────────────────────────
const DATA_FILE = path.join(process.cwd(), 'data', 'waitlist.json');

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadData() {
  ensureDataDir();
  if (!fs.existsSync(DATA_FILE)) return { entries: [], settings: { maxCapacity: 50 } };
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { entries: [], settings: { maxCapacity: 50 } };
  }
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── Status Types ────────────────────────────────────────────────────────────
const STATUS = {
  WAITING: 'waiting',
  SERVING: 'serving',
  DONE: 'done',
  CANCELLED: 'cancelled',
};

// ─── Waitlist Operations ─────────────────────────────────────────────────────

/**
 * Add a customer to the waitlist
 */
function joinWaitlist(phone, name, issue = '') {
  const normalized = normalizePhone(phone);
  const data = loadData();
  const existing = data.entries.find(
    (e) => e.phone === normalized && e.status === STATUS.WAITING
  );

  if (existing) {
    return { success: false, reason: 'already_waiting', entry: existing };
  }

  const position = data.entries.filter((e) => e.status === STATUS.WAITING).length + 1;
  const entry = {
    id: uuidv4(),
    ticketId: `T-${uuidv4().slice(0, 8).toUpperCase()}`,
    phone: normalized,
    name: sanitizeName(name),
    issue: sanitizeText(issue),
    status: STATUS.WAITING,
    position,
    joinedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notified: false,
  };

  data.entries.push(entry);
  saveData(data);
  logger.info(`✅ ${name} (${normalized}) added to waitlist at position ${position} [${entry.ticketId}]`);
  return { success: true, entry, position };
}

/**
 * Check a customer's position in the waitlist
 */
function checkPosition(phone) {
  const data = loadData();
  const normalized = normalizePhone(phone);
  const entry = data.entries.find(
    (e) => e.phone === normalized && e.status === STATUS.WAITING
  );
  if (!entry) return null;

  const waitingList = data.entries
    .filter((e) => e.status === STATUS.WAITING)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

  const position = waitingList.findIndex((e) => e.phone === normalized) + 1;
  const estimatedWait = position * 10; // ~10 mins per person

  return { entry, position, estimatedWait, totalWaiting: waitingList.length };
}

/**
 * Cancel a customer's waitlist spot
 */
function cancelWaitlist(phone) {
  const data = loadData();
  const normalized = normalizePhone(phone);
  const idx = data.entries.findIndex(
    (e) => e.phone === normalized && e.status === STATUS.WAITING
  );

  if (idx === -1) return { success: false, reason: 'not_found' };

  data.entries[idx].status = STATUS.CANCELLED;
  data.entries[idx].updatedAt = new Date().toISOString();
  saveData(data);
  logger.info(`❌ ${data.entries[idx].name || normalized} cancelled their waitlist spot [${data.entries[idx].ticketId}]`);
  return { success: true };
}

/**
 * Get the full waitlist (admin)
 */
function getWaitlist(statusFilter = STATUS.WAITING) {
  const data = loadData();
  return data.entries
    .filter((e) => e.status === statusFilter)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
}

/**
 * Get all entries (admin dashboard)
 */
function getAllEntries() {
  const data = loadData();
  return data.entries.sort((a, b) => new Date(b.joinedAt) - new Date(a.joinedAt));
}

/**
 * Mark the next customer as being served (admin)
 */
function serveNext() {
  const data = loadData();
  const waitingList = data.entries
    .filter((e) => e.status === STATUS.WAITING)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));

  if (waitingList.length === 0) return null;

  const next = waitingList[0];
  const idx = data.entries.findIndex((e) => e.id === next.id);
  data.entries[idx].status = STATUS.SERVING;
  data.entries[idx].updatedAt = new Date().toISOString();
  saveData(data);
  return next;
}

/**
 * Mark a customer as done (admin)
 */
function markDone(phone) {
  const data = loadData();
  const normalized = normalizePhone(phone);
  const idx = data.entries.findIndex(
    (e) => e.phone === normalized && e.status === STATUS.SERVING
  );
  if (idx === -1) return false;
  data.entries[idx].status = STATUS.DONE;
  data.entries[idx].updatedAt = new Date().toISOString();
  saveData(data);
  return true;
}

/**
 * Get waitlist stats
 */
function getStats() {
  const data = loadData();
  return {
    waiting: data.entries.filter((e) => e.status === STATUS.WAITING).length,
    serving: data.entries.filter((e) => e.status === STATUS.SERVING).length,
    done: data.entries.filter((e) => e.status === STATUS.DONE).length,
    cancelled: data.entries.filter((e) => e.status === STATUS.CANCELLED).length,
    total: data.entries.length,
  };
}

// ─── Security Helpers ─────────────────────────────────────────────────────────
function sanitizeName(name) {
  return String(name || 'Customer').replace(/[<>\"'&]/g, '').slice(0, 50).trim();
}

function sanitizeText(text) {
  return String(text || '').replace(/[<>\"']/g, '').slice(0, 200).trim();
}

module.exports = {
  STATUS,
  joinWaitlist,
  checkPosition,
  cancelWaitlist,
  getWaitlist,
  getAllEntries,
  serveNext,
  markDone,
  getStats,
};
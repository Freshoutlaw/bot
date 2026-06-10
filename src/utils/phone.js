function normalizePhone(phone) {
  if (!phone) return '';
  // Keep only digits and plus sign
  const s = String(phone).trim();
  // Remove whatsapp suffixes like '@c.us' if present
  const withoutSuffix = s.replace(/@.*$/, '');
  const normalized = withoutSuffix.replace(/[^0-9+]/g, '');
  return normalized;
}

function isValidPhone(phone) {
  const p = normalizePhone(phone);
  // Basic check: 8-15 digits (optionally leading +)
  return /^[+]?\d{8,15}$/.test(p);
}

module.exports = { normalizePhone, isValidPhone };

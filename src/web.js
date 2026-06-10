const express = require('express');
const http = require('http');
const path = require('path');
const { getState, emitter } = require('./sessionState');
const { getChatThreads, getChatHistory, updateThreadInfo } = require('./chatHistory');
const { getWaitlist, getStats, getNextServing, markServed, removeFromWaitlist } = require('./waitlist');
const logger = require('./logger');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // we'll create a public folder

// ─── API Routes ─────────────────────────────────────────────────────

// Get connection status and QR code (as dataURL)
app.get('/api/status', async (req, res) => {
  const state = getState();
  let qrDataURL = null;
  if (state.currentQR) {
    try {
      qrDataURL = await QRCode.toDataURL(state.currentQR);
    } catch (err) {
      logger.error('Failed to generate QR dataURL:', err);
    }
  }
  res.json({
    status: state.status,
    botNumber: state.botNumber,
    qrDataURL,
  });
});

// Waitlist endpoints
app.get('/api/waitlist', (req, res) => {
  const waitlist = getWaitlist();
  res.json(waitlist);
});

app.get('/api/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

app.post('/api/serve/:phone', (req, res) => {
  const { phone } = req.params;
  const result = getNextServing(phone);
  res.json(result);
});

app.post('/api/done/:phone', (req, res) => {
  const { phone } = req.params;
  const result = markServed(phone);
  res.json(result);
});

app.delete('/api/waitlist/:phone', (req, res) => {
  const { phone } = req.params;
  const result = removeFromWaitlist(phone);
  res.json(result);
});

// Chat endpoints
app.get('/api/threads', (req, res) => {
  const threads = getChatThreads();
  res.json(threads);
});

app.get('/api/history/:phone', (req, res) => {
  const { phone } = req.params;
  const history = getChatHistory(phone);
  res.json(history);
});

app.post('/api/threads/:phone', (req, res) => {
  const { phone } = req.params;
  const updates = req.body;
  const updated = updateThreadInfo(phone, updates);
  res.json(updated);
});

// ─── Server‑Sent Events (SSE) for real‑time QR updates ─────────────
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const onQR = async (qr) => {
    let qrDataURL = null;
    if (qr) {
      try {
        qrDataURL = await QRCode.toDataURL(qr);
      } catch (err) {}
    }
    res.write(`data: ${JSON.stringify({ type: 'qr', qrDataURL })}\n\n`);
  };

  const onStatus = (status) => {
    res.write(`data: ${JSON.stringify({ type: 'status', status })}\n\n`);
  };

  emitter.on('qr', onQR);
  emitter.on('status', onStatus);

  req.on('close', () => {
    emitter.off('qr', onQR);
    emitter.off('status', onStatus);
    res.end();
  });
});

// ─── Frontend HTML (served at root) ────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startWebServer(port = process.env.PORT || 3000) {
  server.listen(port, () => {
    logger.info(`🌐 Web dashboard running on http://localhost:${port}`);
  });
}

module.exports = { startWebServer };
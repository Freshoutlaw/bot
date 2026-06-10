const EventEmitter = require('events');

const emitter = new EventEmitter();

let currentQR = null;
let status = 'initializing';
let botNumber = null;

function setQR(qr) {
  currentQR = qr;
  emitter.emit('qr', qr);
}

function setStatus(s) {
  status = String(s || '').toLowerCase();
  emitter.emit('status', status);
}

function setBotNumber(n) {
  botNumber = n || null;
  emitter.emit('botNumber', botNumber);
}

function getState() {
  return { status, currentQR, botNumber };
}

module.exports = { emitter, setQR, setStatus, setBotNumber, getState };

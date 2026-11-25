const U = require('./utils');

// Colombia no tiene horario de verano: siempre UTC-5.
const TZ = 'America/Bogota';
const TZ_OFFSET_HOURS = 5;
const COUNTDOWN_SECONDS = 10;
// Si el bot estuvo apagado y se pasa esta ventana, la acción de hoy se omite.
const MAX_LATE_MS = 5 * 60 * 1000;
const FILE = 'schedules.json';

// [{ id, groupJid, action: 'apertura'|'cierre', time: 'HH:mm', countdown, tag, message, lastRun }]
let schedules = U.loadJSON(FILE, []);
let sock = null;
let timer = null;
const running = new Set();

function save() {
  U.saveJSON(FILE, schedules);
}

function parseTime(str) {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(str || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return { time: `${String(h).padStart(2, '0')}:${m[2]}`, h, min };
}

// Fecha (YYYY-MM-DD) actual en Colombia
function bogotaDateKey(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(ms);
}

// Instante (epoch ms) de HH:mm de la fecha dada en hora de Colombia
function targetEpoch(dateKey, time) {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h + TZ_OFFSET_HOURS, min, 0);
}

function nextId() {
  return schedules.reduce((max, s) => Math.max(max, s.id), 0) + 1;
}

function add({ groupJid, action, time, countdown, tag, message }) {
  const now = Date.now();
  const today = bogotaDateKey(now);
  const entry = {
    id: nextId(), groupJid, action, time, countdown, tag, message,
    // Si la hora de hoy ya pasó, la primera ejecución será mañana.
    lastRun: now >= targetEpoch(today, time) ? today : null,
  };
  schedules.push(entry);
  save();
  return entry;
}

function listFor(groupJid) {
  return schedules.filter(s => s.groupJid === groupJid);
}

function remove(id, groupJid) {
  const idx = schedules.findIndex(s => s.id === id && s.groupJid === groupJid);
  if (idx === -1) return false;
  schedules.splice(idx, 1);
  save();
  return true;
}

async function send(groupJid, content) {
  try { await sock.sendMessage(groupJid, content); }
  catch (e) { console.error('[SCHEDULER] envío fallido', e); }
}

async function run(s, targetMs) {
  if (s.countdown) {
    for (let i = COUNTDOWN_SECONDS; i >= 1; i--) {
      const at = targetMs - i * 1000;
      const wait = at - Date.now();
      if (wait < -1000) continue;
      await U.sleep(Math.max(0, wait));
      await send(s.groupJid, { text: String(i) });
    }
  }

  await U.sleep(Math.max(0, targetMs - Date.now()));

  const abrir = s.action === 'apertura';
  try {
    await sock.groupSettingUpdate(s.groupJid, abrir ? 'not_announcement' : 'announcement');
  } catch (e) {
    console.error('[SCHEDULER] no se pudo cambiar el grupo', e);
    return;
  }

  const text = s.message || (abrir ? '🔓 El grupo ya está abierto.' : '🔒 El grupo ya está cerrado.');
  if (!s.tag) return send(s.groupJid, { text });

  // Mención oculta: los participantes se notifican sin que aparezca @ en el texto.
  try {
    const meta = await sock.groupMetadata(s.groupJid);
    const mentions = meta.participants.map(p => p.id).filter(Boolean);
    await send(s.groupJid, { text, mentions });
  } catch (e) {
    console.error('[SCHEDULER] no se pudieron obtener participantes', e);
    await send(s.groupJid, { text });
  }
}

function tick() {
  if (!sock) return;
  const now = Date.now();
  const today = bogotaDateKey(now);

  for (const s of schedules) {
    if (s.lastRun === today || running.has(s.id)) continue;
    const target = targetEpoch(today, s.time);
    const trigger = target - (s.countdown ? COUNTDOWN_SECONDS * 1000 : 0);
    if (now < trigger || now - trigger > MAX_LATE_MS) continue;

    s.lastRun = today;
    save();
    running.add(s.id);
    run(s, target)
      .catch(e => console.error(`[SCHEDULER #${s.id}]`, e))
      .finally(() => running.delete(s.id));
  }
}

// Llamar al conectar el socket; el socket se actualiza en cada reconexión.
function attach(newSock) {
  sock = newSock;
  if (!timer) timer = setInterval(tick, 1000);
}

module.exports = { parseTime, add, listFor, remove, attach, bogotaDateKey };

const U = require('./utils');

const LIMITE_EVASIONES = 3;
const DURACION_AUTO_MS = 24 * 60 * 60 * 1000;
const UNIDADES = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

const clave = (groupJid, jid) => `${groupJid}:${jid}`;

// Entradas antiguas en mutedUsers.json son `true` (silencio permanente).
function vencimiento(entrada) {
  if (entrada === true || !entrada || entrada.hasta == null) return null;
  return entrada.hasta;
}

// Convierte "10s", "5m", "1h", "2d" en milisegundos. Devuelve null si no es válido.
function parseDuracion(texto) {
  const m = /^(\d+)([smhd])$/i.exec(String(texto || ''));
  if (!m) return null;
  const n = Number(m[1]);
  if (n <= 0) return null;
  return n * UNIDADES[m[2].toLowerCase()];
}

function formatoRestante(ms) {
  if (ms == null) return 'permanente';
  const seg = Math.ceil(ms / 1000);
  const d = Math.floor(seg / 86400);
  const h = Math.floor((seg % 86400) / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function estaMuteado(groupJid, jid, ahora = Date.now()) {
  const k = clave(groupJid, jid);
  const entrada = U.mutedUsers[k];
  if (!entrada) return false;
  const hasta = vencimiento(entrada);
  if (hasta == null || hasta > ahora) return true;
  delete U.mutedUsers[k];
  U.saveJSON('mutedUsers.json', U.mutedUsers);
  return false;
}

// ms = null para silencio permanente.
function mutear(groupJid, jid, ms = null) {
  U.mutedUsers[clave(groupJid, jid)] = { hasta: ms == null ? null : Date.now() + ms };
  U.saveJSON('mutedUsers.json', U.mutedUsers);
}

function desmutear(groupJid, jid) {
  const k = clave(groupJid, jid);
  if (!U.mutedUsers[k]) return false;
  delete U.mutedUsers[k];
  U.saveJSON('mutedUsers.json', U.mutedUsers);
  return true;
}

// Lista de mutes activos del grupo, en el mismo orden que usa !unmute <número>.
function listar(groupJid, ahora = Date.now()) {
  const prefijo = `${groupJid}:`;
  const resultado = [];
  for (const k of Object.keys(U.mutedUsers)) {
    if (!k.startsWith(prefijo)) continue;
    if (!estaMuteado(groupJid, k.slice(prefijo.length), ahora)) continue;
    const hasta = vencimiento(U.mutedUsers[k]);
    resultado.push({
      jid: k.slice(prefijo.length),
      restanteMs: hasta == null ? null : hasta - ahora,
    });
  }
  return resultado;
}

// Cuenta un borrado por palabra baneada. Al llegar al límite aplica mute automático de 1 día.
// Devuelve true si se muteó en esta llamada.
function registrarEvasion(groupJid, jid) {
  const k = clave(groupJid, jid);
  const total = (U.groupBanStrikes[k] || 0) + 1;
  if (total < LIMITE_EVASIONES) {
    U.groupBanStrikes[k] = total;
    U.saveJSON('groupBanStrikes.json', U.groupBanStrikes);
    return false;
  }
  delete U.groupBanStrikes[k];
  U.saveJSON('groupBanStrikes.json', U.groupBanStrikes);
  mutear(groupJid, jid, DURACION_AUTO_MS);
  return true;
}

module.exports = { parseDuracion, formatoRestante, estaMuteado, mutear, desmutear, listar, registrarEvasion, LIMITE_EVASIONES };

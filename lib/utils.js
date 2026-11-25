const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const ff = require('./ffmpeg');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STICKERS_DIR = path.join(DATA_DIR, 'stickers');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

function loadJSON(file, fallback) {
  const fp = path.join(DATA_DIR, file);
  if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  return fallback;
}
function saveJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// ---------- Estado persistente ----------
const warns = loadJSON('warns.json', {});
const bannedWords = loadJSON('bannedWords.json', {});
const bannedStickers = loadJSON('bannedStickers.json', {});
const stickerCommands = loadJSON('stickerCommands.json', {});
const mutedUsers = loadJSON('mutedUsers.json', {});
const triviaWins = loadJSON('triviaWins.json', {});
const blockedCmds = loadJSON('blockedCmds.json', {}); // { [groupJid]: [nombreComando] }
const blockedCmdMsgs = loadJSON('blockedCmdMsgs.json', {}); // { [groupJid]: { [nombreComando]: mensaje } }
const groupBannedWords = loadJSON('groupBannedWords.json', {}); // { [groupJid]: [palabra] }

// ---------- Estado en memoria ----------
const activeGames = new Map();      // ruleta rusa
const pendingTrivia = new Map();    // trivia math

// ---------- Helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeText(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '+': 't' };

// Quita separadores, símbolos, leet y letras repetidas para cazar evasiones tipo "z4n.a-h0r1a"
function squashText(s) {
  return normalizeText(s)
    .replace(/[0-9@$!+]/g, c => LEET[c])
    .replace(/[^\p{L}]/gu, '')
    .replace(/(\p{L})\1{2,}/gu, '$1');
}

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Tolerancia de errores según longitud: palabras cortas exactas, medianas 1 cambio, largas 2.
function toleranciaPalabra(len) {
  return len <= 4 ? 0 : len <= 7 ? 1 : 2;
}

// Indica si el texto contiene la palabra baneada, aunque tenga letras faltantes, sobrantes o cambiadas.
function contieneBaneada(texto, palabra) {
  const w = squashText(palabra);
  if (!w) return normalizeText(texto).includes(normalizeText(palabra));
  const t = squashText(texto);
  const k = toleranciaPalabra(w.length);
  if (k === 0) return t.includes(w);
  for (let len = Math.max(1, w.length - k); len <= w.length + k; len++) {
    for (let i = 0; i + len <= t.length; i++) {
      if (levenshtein(t.slice(i, i + len), w) <= k) return true;
    }
  }
  return false;
}

function userNum(jid) {
  if (!jid) return '';
  return String(jid).split(':')[0].split('@')[0];
}

async function isSenderAdmin(sock, groupJid, userJid) {
  const meta = await sock.groupMetadata(groupJid);
  const num = userNum(userJid);
  const p = meta.participants.find(
    p => userNum(p.id) === num || userNum(p.lid) === num
  );
  if (!p) return false;
  return p.admin === 'admin' || p.admin === 'superadmin';
}

// Dueña del bot: su número personal, más las cuentas activadas con la frase en chat privado.
const BOT_OWNER_NUMBER = '573045401875';
const ownerIds = loadJSON('owners.json', []); // [número] activados con OWNER_PHRASE
function isBotOwner(...userJids) {
  return userJids.some(j => {
    if (!j) return false;
    const num = userNum(j);
    return num === BOT_OWNER_NUMBER || ownerIds.includes(num);
  });
}
function addBotOwner(...userJids) {
  for (const j of userJids) {
    if (!j) continue;
    const num = userNum(j);
    if (!ownerIds.includes(num)) ownerIds.push(num);
  }
  saveJSON('owners.json', ownerIds);
}

function getSenderJid(msg) {
  return msg.key.participant || msg.key.remoteJid;
}

function getMentionedJid(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || null;
}

function hashToHex(u8) {
  return Buffer.from(u8).toString('hex');
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function downloadStickerBuffer(sticker) {
  const stream = await downloadContentFromMessage(sticker, 'sticker');
  let buffer = Buffer.from([]);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

// Descarga cualquier medio (audio/video/documento/sticker) a un archivo temporal
async function downloadMediaTo(msgMedia, type, outPath) {
  const stream = await downloadContentFromMessage(msgMedia, type);
  const ws = fs.createWriteStream(outPath);
  for await (const chunk of stream) ws.write(chunk);
  await new Promise((res, rej) => { ws.on('finish', res); ws.on('error', rej); ws.end(); });
  return outPath;
}

// Extrae el mensaje citado (con su tipo) de un mensaje recibido
function getQuotedMedia(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo
    || msg.message?.stickerMessage?.contextInfo
    || msg.message?.documentMessage?.contextInfo
    || null;
  const q = ctx?.quotedMessage;
  if (!q) return null;
  if (q.audioMessage) return { type: 'audio', media: q.audioMessage };
  if (q.videoMessage) return { type: 'video', media: q.videoMessage };
  if (q.documentMessage) return { type: 'document', media: q.documentMessage };
  if (q.stickerMessage) return { type: 'sticker', media: q.stickerMessage };
  if (q.imageMessage) return { type: 'image', media: q.imageMessage };
  return null;
}

// ---------- Stickers con audio (!sa) ----------
const AUDIO_EXT = { 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/aac': '.aac', 'audio/x-wav': '.wav', 'video/mp4': '.mp4' };

function audioExtFromMime(mime) {
  if (!mime) return '.bin';
  const m = String(mime).split(';')[0].trim();
  return AUDIO_EXT[m] || '.bin';
}

module.exports = {
  DATA_DIR, STICKERS_DIR, TMP_DIR,
  loadJSON, saveJSON,
  warns, bannedWords, bannedStickers, stickerCommands, mutedUsers, triviaWins, blockedCmds, blockedCmdMsgs, groupBannedWords,
  activeGames, pendingTrivia,
  sleep, shuffle, normalizeText, squashText, contieneBaneada, userNum, isSenderAdmin, isBotOwner, addBotOwner,
  getSenderJid, getMentionedJid, hashToHex, sha256Hex, downloadStickerBuffer,
  downloadMediaTo, getQuotedMedia, audioExtFromMime,
};

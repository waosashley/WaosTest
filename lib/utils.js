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

// Dueña del bot: solo su número personal (no la cuenta vinculada al bot).
const BOT_OWNER_NUMBER = '573045401875';
function isBotOwner(userJid) {
  return userNum(userJid) === BOT_OWNER_NUMBER;
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
  warns, bannedWords, bannedStickers, stickerCommands, mutedUsers, triviaWins, blockedCmds, blockedCmdMsgs,
  activeGames, pendingTrivia,
  sleep, shuffle, normalizeText, userNum, isSenderAdmin, isBotOwner,
  getSenderJid, getMentionedJid, hashToHex, sha256Hex, downloadStickerBuffer,
  downloadMediaTo, getQuotedMedia, audioExtFromMime,
};

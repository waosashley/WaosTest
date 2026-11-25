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

async function isGroupCreator(sock, groupJid, userJid) {
  const meta = await sock.groupMetadata(groupJid);
  const num = userNum(userJid);
  return [meta.owner, meta.ownerPn].some(o => o && userNum(o) === num);
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

function probeFrames(path_) {
  // Devuelve numero de frames de un webp (1 si es estatico, >1 si animado), o null si no se puede leer
  try {
    const out = execFileSync('ffprobe',
      ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
       '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path_],
      { encoding: 'utf8' });
    const n = parseInt(out.trim(), 10);
    return isNaN(n) ? null : n;
  } catch (e) { return null; }
}

// Convierte el sticker a formato que ffmpeg entiende siempre (png estatico / gif animado via PIL)
function normalizeSticker(stickerPath) {
  const base = stickerPath.replace(/\.[^.]+$/, '');
  const isWebp = /\.webp$/i.test(stickerPath);
  if (!isWebp) {
    // png/jpg: verificar que ffmpeg pueda leerlo; si no, reconvertir con PIL
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-loop', '1', '-framerate', '1', '-i', stickerPath, '-t', '0.1', '-f', 'null', '-'], { stdio: 'ignore' });
      return { path: stickerPath, isAnim: false };
    } catch (e) { /* intentar con PIL */ }
  }
  try {
    const py = `
from PIL import Image
im = Image.open(r'${stickerPath}')
n = getattr(im, 'n_frames', 1)
if n > 1:
    frames = []
    for i in range(n):
        im.seek(i)
        frames.append(im.convert('RGBA'))
    dur = int(getattr(im, 'info', {}).get('duration', 100))
    frames[0].save(r'${base}_norm.gif', save_all=True, append_images=frames[1:], duration=dur, loop=0)
    print('GIF')
else:
    im.convert('RGBA').save(r'${base}_norm.png')
    print('PNG')
`;
    const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim();
    if (out === 'GIF') return { path: `${base}_norm.gif`, isAnim: true };
    if (out === 'PNG') return { path: `${base}_norm.png`, isAnim: false };
  } catch (e) {}
  return { path: stickerPath, isAnim: false };
}

// Crea un MP4 a partir de un sticker (imagen o animado) + un audio, recortando al menor tamaño.
async function createAudioStickerVideo(stickerPath, audioPath, outMp4, { maxDuration = 8 } = {}) {
  if (!ff.FFMPEG) throw new Error('ffmpeg no está instalado en el servidor');

  const durOf = (p) => {
    try {
      const out = execFileSync('ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p],
        { encoding: 'utf8' });
      const d = parseFloat(out.trim());
      return isNaN(d) ? null : d;
    } catch (e) { return null; }
  };

  const aDur = durOf(audioPath);
  const duration = Math.min(aDur || maxDuration, maxDuration);

  // Normalizar el sticker (webp -> png/gif) para que ffmpeg lo lea siempre
  const norm = normalizeSticker(stickerPath);
  const isAnim = norm.isAnim;

  // El video debe ser cuadrado para que WhatsApp lo trate como sticker
  const vf = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,setsar=1';
  const imgIn = isAnim ? ['-ignore_loop', '0', '-i', norm.path] : ['-loop', '1', '-framerate', '1', '-i', norm.path];
  const fps = isAnim ? 24 : 1;
  await ff.runFFmpeg([
    ...imgIn,
    '-i', audioPath,
    '-t', String(duration),
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-vf', `${vf},fps=${fps}`,
    '-preset', 'ultrafast', '-crf', '30',
    '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-ac', '2',
    '-shortest',
    '-movflags', '+faststart',
    outMp4,
  ], '-');
  return { outMp4, duration, isAnim };
}

// Envía un mp4 como sticker con audio (WhatsApp lo muestra como sticker "en movimiento" con sonido)
async function sendAudioSticker(sock, jid, mp4Path, opts = {}) {
  const buf = fs.readFileSync(mp4Path);
  await sock.sendMessage(jid, {
    sticker: buf,
    ...opts,
  });
}

module.exports = {
  DATA_DIR, STICKERS_DIR, TMP_DIR,
  loadJSON, saveJSON,
  warns, bannedWords, bannedStickers, stickerCommands, mutedUsers, triviaWins, blockedCmds,
  activeGames, pendingTrivia,
  sleep, shuffle, normalizeText, userNum, isSenderAdmin, isGroupCreator,
  getSenderJid, getMentionedJid, hashToHex, sha256Hex, downloadStickerBuffer,
  downloadMediaTo, getQuotedMedia, audioExtFromMime, probeFrames,
  createAudioStickerVideo, sendAudioSticker,
};

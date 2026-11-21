const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STICKERS_DIR = path.join(DATA_DIR, 'stickers');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

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

module.exports = {
  DATA_DIR, STICKERS_DIR,
  loadJSON, saveJSON,
  warns, bannedWords, bannedStickers, stickerCommands, mutedUsers, triviaWins,
  activeGames, pendingTrivia,
  sleep, shuffle, normalizeText, userNum, isSenderAdmin,
  getSenderJid, getMentionedJid, hashToHex, sha256Hex, downloadStickerBuffer,
};

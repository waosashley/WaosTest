const sharp = require('sharp');
const U = require('./utils');

const MODES = {
  facil: { label: 'Fácil', size: 8, mines: 10 },
  medio: { label: 'Medio', size: 12, mines: 24 },
  dificil: { label: 'Difícil', size: 16, mines: 48 },
};
const LETTERS = 'ABCDEFGHIJKLMNOP';
const MOVE_RE = /^([a-p])(\d{1,2})\s*([be])$/i;
const COOLDOWN_MS = 60 * 60 * 1000;
const IDLE_MS = 10 * 60 * 1000;
const CELL = 40, PAD = 30;
const FONT = 'DejaVu Sans, Arial, sans-serif';
const NUM_COLORS = ['', '#1976d2', '#388e3c', '#d32f2f', '#303f9f', '#795548', '#00838f', '#212121', '#616161'];

const cooldowns = U.loadJSON('buscaminasCooldown.json', {});

// ---------- Modelo ----------
function parseMode(arg) {
  if (!arg) return null;
  const key = U.normalizeText(arg);
  return MODES[key] ? key : null;
}

function parseMove(text) {
  const m = MOVE_RE.exec(String(text).trim());
  if (!m) return null;
  return { col: LETTERS.indexOf(m[1].toUpperCase()), row: parseInt(m[2], 10) - 1, action: m[3].toLowerCase() };
}

function neighbors(size, idx) {
  const r = Math.floor(idx / size), c = idx % size, out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push(nr * size + nc);
    }
  }
  return out;
}

// Las minas se colocan en la primera excavación, dejando libre esa casilla y sus vecinas.
function placeMines(game, safeIdx) {
  const forbidden = new Set([safeIdx, ...neighbors(game.size, safeIdx)]);
  const candidates = [];
  for (let i = 0; i < game.grid.length; i++) if (!forbidden.has(i)) candidates.push(i);
  for (const i of U.shuffle(candidates).slice(0, game.mines)) game.grid[i].mine = true;
  game.grid.forEach((cell, i) => {
    cell.adj = neighbors(game.size, i).filter(n => game.grid[n].mine).length;
  });
  game.minesPlaced = true;
}

function reveal(game, idx) {
  const stack = [idx];
  while (stack.length) {
    const i = stack.pop();
    const cell = game.grid[i];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.adj === 0) stack.push(...neighbors(game.size, i));
  }
}

function isWon(game) {
  return game.grid.filter(c => !c.mine && c.revealed).length === game.size * game.size - game.mines;
}

// ---------- Cooldown ----------
function cooldownLeft(jid) {
  return Math.max(0, (cooldowns[U.userNum(jid)] || 0) - Date.now());
}

function setCooldown(jid) {
  cooldowns[U.userNum(jid)] = Date.now() + COOLDOWN_MS;
  U.saveJSON('buscaminasCooldown.json', cooldowns);
}

function clearCooldown(jid) {
  delete cooldowns[U.userNum(jid)];
  U.saveJSON('buscaminasCooldown.json', cooldowns);
}

// ---------- Imagen ----------
function rect(x, y, fill, stroke) {
  return `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${fill}" stroke="${stroke}"/>`;
}

function mineSvg(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="${CELL * 0.2}" fill="#212121"/>`;
}

function flagSvg(cx, cy) {
  return `<line x1="${cx - 6}" y1="${cy + 12}" x2="${cx - 6}" y2="${cy - 12}" stroke="#212121" stroke-width="2"/>` +
    `<polygon points="${cx - 6},${cy - 12} ${cx + 10},${cy - 6} ${cx - 6},${cy}" fill="#e53935"/>`;
}

function renderBoard(game, opts = {}) {
  const { size } = game;
  const W = PAD * 2 + size * CELL;
  const parts = [];
  for (let c = 0; c < size; c++) {
    parts.push(`<text x="${PAD + c * CELL + CELL / 2}" y="${PAD - 10}" text-anchor="middle" font-size="16">${LETTERS[c]}</text>`);
  }
  for (let r = 0; r < size; r++) {
    parts.push(`<text x="${PAD - 8}" y="${PAD + r * CELL + CELL / 2 + 5}" text-anchor="end" font-size="16">${r + 1}</text>`);
  }
  game.grid.forEach((cell, i) => {
    const x = PAD + (i % size) * CELL, y = PAD + Math.floor(i / size) * CELL;
    const cx = x + CELL / 2, cy = y + CELL / 2;
    if (cell.revealed) {
      const bg = cell.mine ? (i === opts.exploded ? '#e53935' : '#d6d6d6') : '#f2f2f2';
      parts.push(rect(x, y, bg, '#9e9e9e'));
      if (cell.mine) parts.push(mineSvg(cx, cy));
      else if (cell.adj) {
        parts.push(`<text x="${cx}" y="${cy + 7}" text-anchor="middle" font-weight="bold" font-size="20" fill="${NUM_COLORS[cell.adj]}">${cell.adj}</text>`);
      }
    } else {
      parts.push(rect(x, y, '#b9b9b9', '#8a8a8a'));
      if (opts.lost && cell.mine) parts.push(mineSvg(cx, cy));
      else if (cell.flagged) parts.push(flagSvg(cx, cy));
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" font-family="${FONT}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>${parts.join('')}</svg>`;
}

async function sendBoard(sock, groupJid, game, caption, opts = {}) {
  const image = await sharp(Buffer.from(renderBoard(game, opts))).png().toBuffer();
  return sock.sendMessage(groupJid, { image, caption, mentions: [game.player] },
    opts.quoted ? { quoted: opts.quoted } : undefined);
}

// ---------- Partida ----------
const mention = jid => `@${U.userNum(jid)}`;
const coordName = (game, idx) => LETTERS[idx % game.size] + (Math.floor(idx / game.size) + 1);

function statusText(game) {
  const flags = game.grid.filter(c => c.flagged).length;
  const left = game.grid.filter(c => !c.mine && !c.revealed).length;
  return `🚩 Banderas: ${flags}/${game.mines} · Casillas por abrir: ${left}`;
}

function armIdle(sock, groupJid, game) {
  if (game.timeout) clearTimeout(game.timeout);
  game.timeout = setTimeout(() => {
    if (U.activeGames.get(groupJid) !== game) return;
    game.finished = true;
    U.activeGames.delete(groupJid);
    sock.sendMessage(groupJid, { text: '⏱️ Buscaminas cancelado por inactividad.' }).catch(() => {});
  }, IDLE_MS);
}

function endGame(groupJid, game) {
  game.finished = true;
  if (game.timeout) clearTimeout(game.timeout);
  U.activeGames.delete(groupJid);
}

async function createGame(sock, groupJid, playerJid, modeKey) {
  if (U.activeGames.has(groupJid)) return { ok: false, reason: 'Ya hay un juego activo en este grupo.' };
  const { label, size, mines } = MODES[modeKey];
  const game = {
    type: 'buscaminas', player: playerJid, mode: modeKey, label, size, mines,
    grid: Array.from({ length: size * size }, () => ({ mine: false, adj: 0, revealed: false, flagged: false })),
    minesPlaced: false, finished: false, timeout: null,
  };
  U.activeGames.set(groupJid, game);
  armIdle(sock, groupJid, game);
  try {
    await sendBoard(sock, groupJid, game,
      `🧨 *Buscaminas ${label}* (${size}x${size}, ${mines} minas)\nJugador: ${mention(playerJid)}\n\n` +
      `Escribe la casilla y la acción:\n• *A1 e* → excavar\n• *A1 b* → bandera\n\n` +
      `La primera casilla que excaves nunca tiene mina.`);
  } catch (e) {
    endGame(groupJid, game);
    throw e;
  }
  return { ok: true };
}

async function handleMove(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'buscaminas' || game.finished) return false;
  if (U.userNum(senderJid) !== U.userNum(game.player)) return false;
  const mv = parseMove(text);
  if (!mv) return false;

  const say = t => sock.sendMessage(groupJid, { text: t }, { quoted: msg });
  if (mv.col < 0 || mv.col >= game.size || mv.row < 0 || mv.row >= game.size) {
    await say(`⚠️ Casilla fuera del tablero (A–${LETTERS[game.size - 1]}, 1–${game.size}).`);
    return true;
  }
  const idx = mv.row * game.size + mv.col;
  const cell = game.grid[idx];
  const name = coordName(game, idx);

  if (mv.action === 'b') {
    if (cell.revealed) { await say(`⚠️ ${name} ya está abierta.`); return true; }
    cell.flagged = !cell.flagged;
    armIdle(sock, groupJid, game);
    await sendBoard(sock, groupJid, game,
      `${cell.flagged ? '🚩 Bandera en' : '🏳️ Bandera quitada de'} ${name}.\n${statusText(game)}`, { quoted: msg });
    return true;
  }

  if (cell.flagged) { await say(`⚠️ ${name} tiene bandera. Quítala con ${name} b.`); return true; }
  if (cell.revealed) { await say(`⚠️ ${name} ya está abierta.`); return true; }
  if (!game.minesPlaced) placeMines(game, idx);

  if (cell.mine) {
    endGame(groupJid, game);
    setCooldown(game.player);
    await sendBoard(sock, groupJid, game,
      `💥 ¡BOOM! ${mention(game.player)} pisó una mina en ${name}. Perdiste.\n⏳ Debes esperar 1 hora para volver a jugar.`,
      { quoted: msg, exploded: idx, lost: true });
    return true;
  }

  reveal(game, idx);
  if (isWon(game)) {
    endGame(groupJid, game);
    await sendBoard(sock, groupJid, game,
      `🏆 ¡${mention(game.player)} despejó el campo en modo ${game.label}!`, { quoted: msg });
    return true;
  }

  armIdle(sock, groupJid, game);
  await sendBoard(sock, groupJid, game, `Abriste ${name}.\n${statusText(game)}`, { quoted: msg });
  return true;
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'buscaminas') return false;
  endGame(groupJid, game);
  return true;
}

module.exports = {
  MODES, parseMode, parseMove, neighbors, placeMines, reveal, isWon,
  cooldownLeft, setCooldown, clearCooldown,
  createGame, handleMove, stopGame,
};

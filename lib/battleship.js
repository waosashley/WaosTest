const sharp = require('sharp');
const U = require('./utils');

const N = 10, CELL = 34, PAD = 30, TITLE_H = 40;
const GX = PAD, GY = TITLE_H + PAD;
const PANEL_W = GX * 2 + N * CELL, PANEL_H = GY + N * CELL + PAD;
const FONT = 'DejaVu Sans, Arial, sans-serif';
const LETTERS = 'ABCDEFGHIJ';
const PLACE_TIMEOUT = 10 * 60 * 1000;
const LOBBY_TIMEOUT = 120 * 1000;

const FLEET = [
  { name: 'Portaaviones', size: 5 },
  { name: 'Acorazado', size: 4 },
  { name: 'Crucero', size: 3 },
  { name: 'Submarino', size: 3 },
  { name: 'Destructor', size: 2 },
];
const EXAMPLE = ['A1 H', 'A3 V', 'G4 H', 'H7 H', 'I9 H'];
const PLACE_RE = /^([a-j])(10|[1-9])\s*([hv])$/i;
const SHOT_RE = /^([a-j])(10|[1-9])$/i;

const key = (r, c) => `${r},${c}`;
const coordName = (r, c) => LETTERS[c] + (r + 1);
const tag = jid => '@' + U.userNum(jid);
const sameUser = (a, b) => !!a && !!b && U.userNum(a) === U.userNum(b);

// ---------- Modelo ----------
function newBoard() {
  return { ships: [], cellShip: new Map(), shots: new Map(), ready: false };
}

function shipCells(r, c, dir, size) {
  const cells = [];
  for (let i = 0; i < size; i++) cells.push(dir === 'H' ? [r, c + i] : [r + i, c]);
  return cells;
}

function placeNext(board, r, c, dir) {
  const def = FLEET[board.ships.length];
  const cells = shipCells(r, c, dir, def.size);
  if (cells.some(([rr, cc]) => rr < 0 || cc < 0 || rr >= N || cc >= N)) {
    return { ok: false, error: `El ${def.name} (${def.size}) se sale del tablero.` };
  }
  if (cells.some(([rr, cc]) => board.cellShip.has(key(rr, cc)))) {
    return { ok: false, error: `El ${def.name} (${def.size}) se superpone con otro barco.` };
  }
  const idx = board.ships.length;
  board.ships.push({ name: def.name, size: def.size, cells, dir, sunk: false });
  for (const [rr, cc] of cells) board.cellShip.set(key(rr, cc), idx);
  return { ok: true };
}

function undoShip(board) {
  const ship = board.ships.pop();
  if (!ship) return false;
  for (const [r, c] of ship.cells) board.cellShip.delete(key(r, c));
  return true;
}

function fire(board, r, c) {
  const k = key(r, c);
  if (board.shots.has(k)) return { repeat: true };
  const idx = board.cellShip.get(k);
  if (idx === undefined) {
    board.shots.set(k, 'miss');
    return { result: 'water' };
  }
  board.shots.set(k, 'hit');
  const ship = board.ships[idx];
  const sunk = ship.cells.every(([rr, cc]) => board.shots.get(key(rr, cc)) === 'hit');
  if (sunk) ship.sunk = true;
  return { result: sunk ? 'sunk' : 'hit', ship };
}

const allSunk = board => board.ships.length === FLEET.length && board.ships.every(s => s.sunk);

// ---------- Render ----------
function starPoints(cx, cy, ro, ri, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? ro : ri;
    const a = Math.PI * i / n;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function explosion(cx, cy) {
  return `<polygon points="${starPoints(cx, cy, CELL * 0.47, CELL * 0.2, 9)}" fill="#ff7b00" stroke="#8b0000" stroke-width="1.5"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${CELL * 0.13}" fill="#ffe066"/>`;
}

function label(text, x, y, anchor) {
  return `<text x="${x}" y="${y}" fill="#e8f1f8" font-size="14" font-weight="bold" font-family="${FONT}" text-anchor="${anchor}">${text}</text>`;
}

// panel: { title, board, showShips }. showShips=false muestra solo disparos (tablero del rival).
function panelBody(p) {
  let s = `<text x="${PANEL_W / 2}" y="27" fill="#ffffff" font-size="18" font-weight="bold" font-family="${FONT}" text-anchor="middle">${p.title}</text>`;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      s += `<rect x="${GX + c * CELL}" y="${GY + r * CELL}" width="${CELL}" height="${CELL}" fill="#2a86c7" stroke="#1b5f8f" stroke-width="1"/>`;
    }
  }
  for (let i = 0; i < N; i++) {
    s += label(LETTERS[i], GX + i * CELL + CELL / 2, GY - 9, 'middle');
    s += label(String(i + 1), GX - 8, GY + i * CELL + CELL / 2 + 5, 'end');
  }
  for (const ship of p.board.ships) {
    if (!p.showShips && !ship.sunk) continue;
    for (const [r, c] of ship.cells) {
      const x = GX + c * CELL + 3, y = GY + r * CELL + 3;
      s += `<rect x="${x}" y="${y}" width="${CELL - 6}" height="${CELL - 6}" rx="7" fill="${ship.sunk ? '#3b4149' : '#a7b2bf'}" stroke="${ship.sunk ? '#15181c' : '#4d5966'}" stroke-width="1.5"/>`;
    }
  }
  for (const ship of p.board.ships) {
    if (!ship.sunk) continue;
    for (const [r, c] of ship.cells) {
      const x0 = GX + c * CELL + 9, y0 = GY + r * CELL + 9, x1 = GX + (c + 1) * CELL - 9, y1 = GY + (r + 1) * CELL - 9;
      s += `<path d="M${x0} ${y0} L${x1} ${y1} M${x1} ${y0} L${x0} ${y1}" stroke="#ff3b3b" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
  for (const [k, v] of p.board.shots) {
    const [r, c] = k.split(',').map(Number);
    const cx = GX + c * CELL + CELL / 2, cy = GY + r * CELL + CELL / 2;
    const idx = p.board.cellShip.get(k);
    const sunkShip = idx !== undefined && p.board.ships[idx].sunk;
    if (v === 'miss') s += `<circle cx="${cx}" cy="${cy}" r="5" fill="#e8f6ff"/>`;
    else if (!sunkShip) s += explosion(cx, cy);
  }
  return s;
}

async function renderPanels(panels) {
  const W = panels.length * PANEL_W;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${PANEL_H}" viewBox="0 0 ${W} ${PANEL_H}">` +
    `<rect width="${W}" height="${PANEL_H}" fill="#0b2a3c"/>`;
  panels.forEach((p, i) => { svg += `<g transform="translate(${i * PANEL_W} 0)">${panelBody(p)}</g>`; });
  svg += '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function exampleBoard() {
  const b = newBoard();
  for (const spot of EXAMPLE) {
    const m = spot.match(PLACE_RE);
    placeNext(b, parseInt(m[2]) - 1, LETTERS.indexOf(m[1].toUpperCase()), m[3].toUpperCase());
  }
  return b;
}

// ---------- Mensajes ----------
const INTRO = `🚢 *Batalla Naval*

Coloca tu flota aquí, en este chat privado.
Flota: Portaaviones (5), Acorazado (4), Crucero (3), Submarino (3), Destructor (2).

*Cómo colocar:* escribe la casilla inicial y la dirección:
• *A1 H* = empieza en A1 y va a la derecha (horizontal)
• *A1 V* = empieza en A1 y va hacia abajo (vertical)

Ejemplo (mira la imagen): *A1 H, A3 V, G4 H, H7 H, I9 H*

Comandos: *ver* (tu tablero), *deshacer* (quita el último barco), *reset* (empezar de nuevo), *ayuda*.

Cuando tus 5 barcos estén colocados, la partida empieza en el grupo si el otro jugador también terminó.`;

function nextShipText(board) {
  if (board.ships.length >= FLEET.length) return '✅ ¡Flota completa!';
  const next = FLEET[board.ships.length];
  return `Siguiente: *${next.name}* (${next.size} casillas). Escribe la casilla y dirección, ej: *C5 H*. Te faltan ${FLEET.length - board.ships.length}.`;
}

async function sendDM(sock, jid, content) {
  try { await sock.sendMessage(jid, content); }
  catch (e) { console.error('[BATTLESHIP DM]', e.message); }
}

async function sendGroup(sock, groupJid, content) {
  return sock.sendMessage(groupJid, content);
}

function placingPlayer(senderJid) {
  for (const g of U.activeGames.values()) {
    if (g.type !== 'battleship' || g.phase !== 'placing') continue;
    const p = g.players.find(pl => sameUser(pl, senderJid));
    if (p) return { game: g, player: p };
  }
  return null;
}

// ---------- Ciclo de juego ----------
async function createGame(sock, groupJid, creatorJid) {
  if (U.activeGames.has(groupJid)) return { ok: false };
  const game = {
    type: 'battleship',
    groupJid,
    creator: creatorJid,
    players: [creatorJid],
    started: false,
    stopped: false,
    phase: 'lobby',
    boards: new Map(),
    turn: 0,
    timeout: null,
    placeTimeout: null,
  };
  game.timeout = setTimeout(() => {
    const g = U.activeGames.get(groupJid);
    if (g && g.type === 'battleship' && g.phase === 'lobby') {
      U.activeGames.delete(groupJid);
      sendGroup(sock, groupJid, { text: '⏱️ Tiempo agotado. Batalla naval cancelada.' });
    }
  }, LOBBY_TIMEOUT);
  U.activeGames.set(groupJid, game);
  return { ok: true };
}

async function startGame(sock, groupJid, game) {
  game.started = true;
  game.phase = 'placing';
  if (game.timeout) clearTimeout(game.timeout);
  const image = await renderPanels([{ title: 'Ejemplo de flota', board: exampleBoard(), showShips: true }]);
  for (const p of game.players) {
    game.boards.set(p, newBoard());
    await sendDM(sock, p, { image, caption: INTRO, mentions: [] });
  }
  game.placeTimeout = setTimeout(() => {
    const g = U.activeGames.get(groupJid);
    if (g === game && g.phase === 'placing') {
      U.activeGames.delete(groupJid);
      sendGroup(sock, groupJid, { text: '⏱️ Tiempo de colocación agotado. Batalla naval cancelada.' });
    }
  }, PLACE_TIMEOUT);
  await sendGroup(sock, groupJid, {
    text: `🚢 *Batalla naval iniciada*\n\n${game.players.map((p, i) => `Jugador ${i + 1}: ${tag(p)}`).join('\n')}\n\nColoquen sus barcos en el *chat privado* con el bot. Cuando ambos terminen, la batalla empieza aquí.`,
    mentions: game.players,
  });
}

async function onPlayerReady(sock, game, player) {
  const readyCount = game.players.filter(p => game.boards.get(p).ready).length;
  if (readyCount < game.players.length) {
    await sendGroup(sock, game.groupJid, {
      text: `✅ ${tag(player)} terminó de colocar sus barcos (${readyCount}/2). Esperando al otro jugador...`,
      mentions: [player],
    });
    return;
  }
  game.phase = 'battle';
  game.turn = 0;
  if (game.placeTimeout) clearTimeout(game.placeTimeout);
  const [p0, p1] = game.players;
  const image = await renderPanels([
    { title: 'Jugador 1', board: game.boards.get(p0), showShips: false },
    { title: 'Jugador 2', board: game.boards.get(p1), showShips: false },
  ]);
  await sendGroup(sock, game.groupJid, {
    image,
    caption: `⚓ *¡Comienza la batalla!*\n\n🔴 Jugador 1: ${tag(p0)}\n🔵 Jugador 2: ${tag(p1)}\n\nTurno de ${tag(p0)}. Dispara escribiendo una casilla, ej: *D5*.\n💥 = tocado · ⚪ = agua · 🔥 = hundido`,
    mentions: game.players,
  });
}

// Mensajes privados: colocación de barcos.
async function handlePrivate(sock, msg, text) {
  const sender = U.getSenderJid(msg);
  const found = placingPlayer(sender);
  if (!found) return false;
  const { game, player } = found;
  const board = game.boards.get(player);
  const chat = msg.key.remoteJid;
  const t = text.trim();
  const low = t.toLowerCase();
  const reply = content => sendDM(sock, chat, content);
  const showBoard = caption => renderPanels([{ title: 'Tu flota', board, showShips: true }])
    .then(image => reply({ image, caption }));

  // Ya colocó su flota: el resto de la partida es solo en el grupo, no se responde por privado.
  if (board.ready) return true;

  if (['ayuda', 'help', 'menu'].includes(low)) {
    const image = await renderPanels([{ title: 'Ejemplo de flota', board: exampleBoard(), showShips: true }]);
    await reply({ image, caption: INTRO });
    return true;
  }
  if (low === 'ver') { await showBoard(nextShipText(board)); return true; }
  if (low === 'reset' || low === 'reiniciar') {
    board.ships = [];
    board.cellShip.clear();
    await showBoard(`🔄 Flota reiniciada. ${nextShipText(board)}`);
    return true;
  }
  if (low === 'deshacer') {
    if (!undoShip(board)) await reply({ text: 'No hay barcos para deshacer.' });
    else await showBoard(`↩️ Quitado. ${nextShipText(board)}`);
    return true;
  }

  const m = t.match(PLACE_RE);
  if (!m) {
    await reply({ text: '⚠️ Formato no válido. Ejemplo: *A1 H* (H = horizontal, V = vertical). Escribe *ayuda* para ver más.' });
    return true;
  }
  const r = parseInt(m[2]) - 1, c = LETTERS.indexOf(m[1].toUpperCase());
  const res = placeNext(board, r, c, m[3].toUpperCase());
  if (!res.ok) {
    await reply({ text: `⚠️ ${res.error}` });
    return true;
  }
  if (board.ships.length === FLEET.length) {
    board.ready = true;
    await showBoard('✅ ¡Flota lista! Espera a que el otro jugador termine.');
    await onPlayerReady(sock, game, player);
    return true;
  }
  await showBoard(`✅ ${board.ships[board.ships.length - 1].name} colocado. ${nextShipText(board)}`);
  return true;
}

// Disparos en el grupo (handler pasivo).
async function handleShot(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'battleship' || game.phase !== 'battle' || game.stopped) return false;
  const m = text.trim().match(SHOT_RE);
  if (!m) return false;
  const attacker = game.players[game.turn];
  if (senderJid !== attacker) return false;

  const r = parseInt(m[2]) - 1, c = LETTERS.indexOf(m[1].toUpperCase());
  const defender = game.players[1 - game.turn];
  const board = game.boards.get(defender);
  const res = fire(board, r, c);
  const coord = coordName(r, c);
  if (res.repeat) {
    await sendGroup(sock, groupJid, { text: `⚠️ Ya disparaste a *${coord}*. Elige otra casilla.` }, { quoted: msg });
    return true;
  }

  let result;
  if (res.result === 'water') result = `⚪ ¡Agua en ${coord}!`;
  else if (res.result === 'sunk') result = `🔥 ¡HUNDIDO! El *${res.ship.name}* (${res.ship.size}) fue destruido.`;
  else result = `💥 ¡Tocado en ${coord}!`;
  const header = `🎯 ${tag(attacker)} disparó a *${coord}*\n${result}`;

  if (allSunk(board)) {
    game.phase = 'ended';
    const [p0, p1] = game.players;
    const image = await renderPanels([
      { title: 'Jugador 1', board: game.boards.get(p0), showShips: true },
      { title: 'Jugador 2', board: game.boards.get(p1), showShips: true },
    ]);
    U.activeGames.delete(groupJid);
    if (game.timeout) clearTimeout(game.timeout);
    if (game.placeTimeout) clearTimeout(game.placeTimeout);
    await sendGroup(sock, groupJid, {
      image,
      caption: `${header}\n\n🏆 *¡${tag(attacker)} GANÓ!* Se hundió toda la flota enemiga.`,
      mentions: game.players,
    });
    return true;
  }

  game.turn = 1 - game.turn;
  const next = game.players[game.turn];
  const image = await renderPanels([
    { title: 'Jugador 1', board: game.boards.get(game.players[0]), showShips: false },
    { title: 'Jugador 2', board: game.boards.get(game.players[1]), showShips: false },
  ]);
  await sendGroup(sock, groupJid, {
    image,
    caption: `${header}\n\nTurno de ${tag(next)}.`,
    mentions: [attacker, next],
  });
  return true;
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'battleship') return false;
  game.stopped = true;
  if (game.timeout) clearTimeout(game.timeout);
  if (game.placeTimeout) clearTimeout(game.placeTimeout);
  U.activeGames.delete(groupJid);
  return true;
}

module.exports = { createGame, startGame, handleShot, handlePrivate, stopGame, renderPanels, fire, placeNext, FLEET };

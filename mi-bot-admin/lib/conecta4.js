const U = require('./utils');

const ROWS = 6, COLS = 7;
const EMPTY = '⚫', P1 = '🔴', P2 = '🟡';

function newBoard() { return Array(ROWS).fill(null).map(() => Array(COLS).fill(EMPTY)); }
function render(b) {
  let out = '1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣\n';
  for (let r = 0; r < ROWS; r++) out += b[r].join('') + '\n';
  return out;
}
function drop(b, col, sym) {
  if (col < 0 || col >= COLS) return null;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][col] === EMPTY) { b[r][col] = sym; return r; }
  }
  return null;
}
function checkWin(b, sym) {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c <= COLS - 4; c++)
      if ([0,1,2,3].every(k => b[r][c+k] === sym)) return true;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r <= ROWS - 4; r++)
      if ([0,1,2,3].every(k => b[r+k][c] === sym)) return true;
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 0; c <= COLS - 4; c++)
      if ([0,1,2,3].every(k => b[r+k][c+k] === sym)) return true;
  for (let r = 0; r <= ROWS - 4; r++)
    for (let c = 3; c < COLS; c++)
      if ([0,1,2,3].every(k => b[r+k][c-k] === sym)) return true;
  return false;
}
function full(b) { return b[0].every(c => c !== EMPTY); }

async function createGame(sock, groupJid, creatorJid) {
  if (U.activeGames.has(groupJid)) return { ok: false };
  const game = {
    type: 'conecta4',
    creator: creatorJid,
    players: [creatorJid],
    started: false,
    stopped: false,
    board: newBoard(),
    turn: 0,
  };
  game.timeout = setTimeout(() => {
    const g = U.activeGames.get(groupJid);
    if (g && g.type === 'conecta4' && !g.started) {
      U.activeGames.delete(groupJid);
      sock.sendMessage(groupJid, { text: '⏱️ Tiempo agotado. Conecta 4 cancelado.' }).catch(() => {});
    }
  }, 120000);
  U.activeGames.set(groupJid, game);
  return { ok: true };
}

async function startGame(sock, groupJid, game) {
  game.started = true;
  if (game.timeout) clearTimeout(game.timeout);
  await sock.sendMessage(groupJid, {
    text: `🎮 *Conecta 4 iniciado*\n\n@${game.players[0].split('@')[0]} = 🔴\n@${game.players[1].split('@')[0]} = 🟡\n\n${render(game.board)}\n\nTurno de @${game.players[0].split('@')[0]} (🔴).\nEscribe un número del *1* al *7* para tirar en esa columna.`,
    mentions: game.players,
  });
}

async function handleMove(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'conecta4' || !game.started || game.stopped) return false;
  const t = text.trim();
  if (!/^[1-7]$/.test(t)) return false;
  if (senderJid !== game.players[game.turn]) return false;

  const col = parseInt(t) - 1;
  const sym = game.turn === 0 ? P1 : P2;
  const row = drop(game.board, col, sym);
  if (row === null) {
    await sock.sendMessage(groupJid, { text: `⚠️ Columna ${t} llena. Elige otra.` }, { quoted: msg });
    return true;
  }

  if (checkWin(game.board, sym)) {
    await sock.sendMessage(groupJid, {
      text: `${render(game.board)}\n\n🏆 ¡@${senderJid.split('@')[0]} GANÓ! (${sym})`,
      mentions: [senderJid],
    });
    U.activeGames.delete(groupJid);
    return true;
  }
  if (full(game.board)) {
    await sock.sendMessage(groupJid, { text: `${render(game.board)}\n\n🤝 Empate.` });
    U.activeGames.delete(groupJid);
    return true;
  }

  game.turn = 1 - game.turn;
  const next = game.players[game.turn];
  const nSym = game.turn === 0 ? P1 : P2;
  await sock.sendMessage(groupJid, {
    text: `${render(game.board)}\n\nTurno de @${next.split('@')[0]} (${nSym}).\nEscribe un número del *1* al *7*.`,
    mentions: [next],
  });
  return true;
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'conecta4') return false;
  game.stopped = true;
  if (game.timeout) clearTimeout(game.timeout);
  U.activeGames.delete(groupJid);
  return true;
}

module.exports = { createGame, startGame, handleMove, stopGame };
const { Chess } = require('chess.js');
const sharp = require('sharp');
const U = require('./utils');

const SQ = 80, MARGIN = 32, SIZE = SQ * 8 + MARGIN * 2;
const LIGHT = '#f0d9b5', DARK = '#b58863', LAST_LIGHT = '#f7ec74', LAST_DARK = '#dac33b', CHECK = '#e8564b';
const NAMES = { p: 'Peón', n: 'Caballo', b: 'Alfil', r: 'Torre', q: 'Dama', k: 'Rey' };
const COLOR_NAME = { w: '⚪ Blancas', b: '⚫ Negras' };

// Siluetas propias en una caja de 45x45
const SHAPES = {
  p: '<circle cx="22.5" cy="13" r="6"/><path d="M16 38 Q17 25 22.5 21 Q28 25 29 38 Z"/><rect x="12" y="37" width="21" height="4" rx="2"/>',
  r: '<path d="M12 38 V32 H15 V19 H12 V9 H17 V13 H20 V9 H25 V13 H28 V9 H33 V19 H30 V32 H33 V38 Z"/><rect x="10" y="37" width="25" height="4" rx="2"/>',
  n: '<path d="M13 38 Q13 26 21 20 Q15 19 12 24 L9 22 Q13 11 22 9 L24 5 L27 9 Q35 13 34 38 Z"/><circle cx="21" cy="14" r="1.6" class="eye"/><rect x="10" y="37" width="25" height="4" rx="2"/>',
  b: '<circle cx="22.5" cy="9" r="3.5"/><path d="M22.5 13 Q32 20 29 30 Q28 33 31 38 H14 Q17 33 16 30 Q13 20 22.5 13 Z"/><path d="M19 21 L26 28" class="eye" stroke-width="2"/><rect x="11" y="37" width="23" height="4" rx="2"/>',
  q: '<circle cx="8" cy="12" r="3"/><circle cx="15" cy="8" r="3"/><circle cx="22.5" cy="6.5" r="3"/><circle cx="30" cy="8" r="3"/><circle cx="37" cy="12" r="3"/><path d="M9 14 L14 30 L16 12 L20 28 L22.5 10 L25 28 L29 12 L31 30 L36 14 L34 37 H11 Z"/><rect x="9" y="37" width="27" height="4" rx="2"/>',
  k: '<rect x="21" y="3" width="3" height="11" class="fillonly"/><rect x="17.5" y="6.5" width="10" height="3" class="fillonly"/><path d="M22.5 15 Q9 13 9 26 Q9 31 14 33 L12 38 H33 L31 33 Q36 31 36 26 Q36 13 22.5 15 Z"/><rect x="9" y="37" width="27" height="4" rx="2"/>',
};

function pieceSvg(type, color, x, y) {
  const fill = color === 'w' ? '#ffffff' : '#2b2b2b';
  const stroke = color === 'w' ? '#1a1a1a' : '#000000';
  const eye = color === 'w' ? '#1a1a1a' : '#ffffff';
  const s = (SQ - 8) / 45;
  return `<g transform="translate(${x + 4} ${y + 4}) scale(${s})" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round">` +
    SHAPES[type].replace(/class="eye"/g, `fill="${eye}" stroke="${eye}"`).replace(/class="fillonly"/g, `fill="${fill}"`) + '</g>';
}

async function renderBoard(chess, lastMove) {
  const board = chess.board();
  const checkedKing = chess.inCheck() ? chess.turn() : null;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<rect width="${SIZE}" height="${SIZE}" fill="#2f2a26"/>`;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = 'abcdefgh'[c] + (8 - r);
      const light = (r + c) % 2 === 0;
      const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
      const piece = board[r][c];
      let fill = light ? (isLast ? LAST_LIGHT : LIGHT) : (isLast ? LAST_DARK : DARK);
      if (checkedKing && piece && piece.type === 'k' && piece.color === checkedKing) fill = CHECK;
      const x = MARGIN + c * SQ, y = MARGIN + r * SQ;
      svg += `<rect x="${x}" y="${y}" width="${SQ}" height="${SQ}" fill="${fill}"/>`;
      if (piece) svg += pieceSvg(piece.type, piece.color, x, y);
    }
  }
  const label = (t, x, y) => `<text x="${x}" y="${y}" fill="#e8e0d4" font-size="20" font-weight="bold" font-family="DejaVu Sans, Arial, sans-serif" text-anchor="middle">${t}</text>`;
  for (let i = 0; i < 8; i++) {
    const file = 'ABCDEFGH'[i], rank = 8 - i;
    const cx = MARGIN + i * SQ + SQ / 2, cy = MARGIN + i * SQ + SQ / 2 + 7;
    svg += label(file, cx, 22) + label(file, cx, SIZE - 8);
    svg += label(rank, 16, cy) + label(rank, SIZE - 16, cy);
  }
  svg += '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const tag = jid => '@' + jid.split('@')[0];

async function sendBoard(sock, groupJid, game, caption, mentions, quoted) {
  const image = await renderBoard(game.chess, game.lastMove);
  return sock.sendMessage(groupJid, { image, caption, mentions }, quoted ? { quoted } : {});
}

async function createGame(sock, groupJid, creatorJid) {
  if (U.activeGames.has(groupJid)) return { ok: false };
  const game = {
    type: 'ajedrez',
    creator: creatorJid,
    players: [creatorJid],
    started: false,
    stopped: false,
    chess: new Chess(),
    lastMove: null,
  };
  game.timeout = setTimeout(() => {
    const g = U.activeGames.get(groupJid);
    if (g && g.type === 'ajedrez' && !g.started) {
      U.activeGames.delete(groupJid);
      sock.sendMessage(groupJid, { text: '⏱️ Tiempo agotado. Ajedrez cancelado.' }).catch(() => {});
    }
  }, 120000);
  U.activeGames.set(groupJid, game);
  return { ok: true };
}

async function startGame(sock, groupJid, game) {
  game.started = true;
  if (game.timeout) clearTimeout(game.timeout);
  const [w, b] = game.players;
  await sendBoard(sock, groupJid, game,
    `♟️ *Ajedrez iniciado*\n\n⚪ ${tag(w)}\n⚫ ${tag(b)}\n\nTurno de ${tag(w)} (⚪ Blancas).\nEscribe origen y destino, ej: *E2 E4*`,
    game.players);
}

async function handleMove(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'ajedrez' || !game.started || game.stopped) return false;
  const m = text.trim().toLowerCase().match(/^([a-h][1-8])\s*[-\s]?\s*([a-h][1-8])(?:\s*=?\s*([qrbn]))?$/);
  if (!m) return false;
  const color = game.chess.turn();
  if (senderJid !== game.players[color === 'w' ? 0 : 1]) return false;

  const [, from, to, promo] = m;
  const piece = game.chess.get(from);
  let move;
  try {
    move = game.chess.move({ from, to, promotion: promo || 'q' });
  } catch (e) {
    const why = !piece ? `No hay ninguna pieza en ${from.toUpperCase()}.`
      : piece.color !== color ? `Esa pieza no es tuya.`
      : `${NAMES[piece.type]} de ${from.toUpperCase()} no puede ir a ${to.toUpperCase()}.`;
    await sock.sendMessage(groupJid, { text: `⚠️ Movimiento inválido. ${why}` }, { quoted: msg });
    return true;
  }

  game.lastMove = { from: move.from, to: move.to };
  const chess = game.chess;
  let desc = `${NAMES[move.piece]} ${move.from.toUpperCase()} → ${move.to.toUpperCase()}`;
  if (move.captured) desc += ` (captura ${NAMES[move.captured]})`;
  if (move.isKingsideCastle() || move.isQueensideCastle()) desc += ' (enroque)';
  if (move.promotion) desc += ` (corona ${NAMES[move.promotion]})`;
  const header = `♟️ ${COLOR_NAME[color]} ${tag(senderJid)}: *${desc}*`;

  if (chess.isCheckmate()) {
    await sendBoard(sock, groupJid, game, `${header}\n\n♚ *¡Jaque mate!*\n🏆 ¡${tag(senderJid)} GANÓ!`, [senderJid]);
    U.activeGames.delete(groupJid);
    return true;
  }
  if (chess.isDraw()) {
    const why = chess.isStalemate() ? 'rey ahogado' : chess.isInsufficientMaterial() ? 'material insuficiente'
      : chess.isThreefoldRepetition() ? 'triple repetición' : 'regla de 50 movimientos';
    await sendBoard(sock, groupJid, game, `${header}\n\n🤝 *Tablas* (${why}).`, game.players);
    U.activeGames.delete(groupJid);
    return true;
  }

  const next = game.players[chess.turn() === 'w' ? 0 : 1];
  await sendBoard(sock, groupJid, game,
    `${header}${chess.inCheck() ? '\n⚠️ *¡Jaque!*' : ''}\n\nTurno de ${tag(next)} (${COLOR_NAME[chess.turn()]}).`,
    [senderJid, next]);
  return true;
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'ajedrez') return false;
  game.stopped = true;
  if (game.timeout) clearTimeout(game.timeout);
  U.activeGames.delete(groupJid);
  return true;
}

module.exports = { createGame, startGame, handleMove, stopGame, renderBoard };

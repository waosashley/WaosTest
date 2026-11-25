const U = require('./utils');

async function createGame(sock, groupJid, creatorJid, isFake) {
  if (U.activeGames.has(groupJid)) return { ok: false, reason: 'Ya hay un juego activo en este grupo.' };
  const game = {
    type: 'ruleta',
    creator: creatorJid,
    players: [creatorJid],
    started: false,
    stopped: false,
    isFake,
    chambers: 12,
    bulletAt: Math.floor(Math.random() * 12) + 1,
    currentShot: 0,
    turnOrder: [],
    currentPlayerIdx: 0,
  };
  game.timeout = setTimeout(() => {
    const g = U.activeGames.get(groupJid);
    if (g && g.type === 'ruleta' && !g.started) {
      U.activeGames.delete(groupJid);
      sock.sendMessage(groupJid, { text: '⏱️ Tiempo agotado. Ruleta cancelada.' }).catch(() => {});
    }
  }, 60000);
  U.activeGames.set(groupJid, game);
  return { ok: true };
}

async function startGame(sock, groupJid, game) {
  game.started = true;
  if (game.timeout) clearTimeout(game.timeout);
  game.turnOrder = U.shuffle(game.players);
  game.currentPlayerIdx = 0;
  game.currentShot = 0;
  console.log(`[RULETA] Bala en ${game.bulletAt}/12. Turno de ${game.turnOrder[0]}`);
  const first = game.turnOrder[0];
  await sock.sendMessage(groupJid, {
    text: `🔫 *Ruleta rusa iniciada*\n\nRevólver: 12 recámaras, 1 bala.\n${game.isFake ? 'Modo fake: nadie es expulsado.\n' : 'El que reciba la bala es expulsado.\n'}\nOrden de turnos:\n${game.turnOrder.map((p, i) => `${i + 1}. @${p.split('@')[0]}`).join('\n')}\n\nEs el turno de @${first.split('@')[0]}.\nEscribe *bang* para disparar.`,
    mentions: game.turnOrder,
  });
}

async function handleBang(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'ruleta' || !game.started || game.stopped) return false;
  if (text.trim().toLowerCase() !== 'bang') return false;
  const current = game.turnOrder[game.currentPlayerIdx];
  if (senderJid !== current) return false;

  game.currentShot++;
  const dead = game.currentShot === game.bulletAt;

  if (dead) {
    await sock.sendMessage(groupJid, {
      text: `💥 *BANG*\n\n@${senderJid.split('@')[0]} jaló el gatillo... y la bala estaba ahí.\n${game.isFake ? '(Fake: no es expulsado)' : 'Ha perdido. Adiós.'}`,
      mentions: [senderJid],
    });
    if (!game.isFake) {
      try { await sock.groupParticipantsUpdate(groupJid, [senderJid], 'remove'); }
      catch (e) { console.error('[RULETA KICK]', e.message); }
    }
    U.activeGames.delete(groupJid);
    return true;
  }

  const remaining = game.chambers - game.currentShot;
  game.currentPlayerIdx = (game.currentPlayerIdx + 1) % game.turnOrder.length;
  const next = game.turnOrder[game.currentPlayerIdx];
  await sock.sendMessage(groupJid, {
    text: `😅 *click*\n\n@${senderJid.split('@')[0]} sobrevive.\nRecámaras restantes: ${remaining}/${game.chambers}\n\nEs el turno de @${next.split('@')[0]}. Escribe *bang* para disparar.`,
    mentions: [senderJid, next],
  });
  return true;
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'ruleta') return false;
  game.stopped = true;
  if (game.timeout) clearTimeout(game.timeout);
  U.activeGames.delete(groupJid);
  return true;
}

const APPROVAL_TTL = 60000;
const pendingApprovals = new Map(); // groupJid -> { requester, msgId, timer }

const rusaCreatedText = creator =>
  `🔫 *Ruleta rusa creada*\n\nCreador: @${creator.split('@')[0]}\n60s para unirse con *!ruletarusa unirme*.\nMáx 4 jugadores.\n\nRevólver: 12 recámaras, 1 bala.\nCada uno escribe *bang* en su turno.\nEl que reciba la bala es expulsado.\n\nEl creador inicia con *!ruletarusa iniciar*.`;

async function requestApproval(sock, groupJid, requesterJid, quoted) {
  if (U.activeGames.has(groupJid)) return { ok: false, reason: 'Ya hay un juego activo en este grupo.' };
  if (pendingApprovals.has(groupJid)) return { ok: false, reason: 'Ya hay una solicitud de ruleta rusa pendiente.' };
  const sent = await sock.sendMessage(groupJid, {
    text: `🔫 @${requesterJid.split('@')[0]} quiere crear una *ruleta rusa* (el perdedor es expulsado).\n\nUn administrador debe responder a este mensaje con *aprobar* o *rechazar*.\n(Expira en 60s)`,
    mentions: [requesterJid],
  }, { quoted });
  const timer = setTimeout(() => {
    if (pendingApprovals.get(groupJid)?.msgId !== sent.key.id) return;
    pendingApprovals.delete(groupJid);
    sock.sendMessage(groupJid, { text: '⏱️ Solicitud de ruleta rusa expirada.' }).catch(() => {});
  }, APPROVAL_TTL);
  pendingApprovals.set(groupJid, { requester: requesterJid, msgId: sent.key.id, timer });
  return { ok: true };
}

async function handleApproval(sock, groupJid, senderJid, msg, text) {
  const pending = pendingApprovals.get(groupJid);
  if (!pending) return false;
  const word = U.normalizeText(text).trim();
  if (word !== 'aprobar' && word !== 'rechazar') return false;
  const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
  if (quotedId && quotedId !== pending.msgId) return false;

  if (!(await U.isSenderAdmin(sock, groupJid, senderJid))) {
    if (quotedId) await sock.sendMessage(groupJid, { text: '⚠️ Solo un administrador puede aprobar.' }, { quoted: msg });
    return !!quotedId;
  }

  clearTimeout(pending.timer);
  pendingApprovals.delete(groupJid);
  if (word === 'rechazar') {
    await sock.sendMessage(groupJid, { text: '🚫 Solicitud de ruleta rusa rechazada.', mentions: [pending.requester] }, { quoted: msg });
    return true;
  }
  const r = await createGame(sock, groupJid, pending.requester, false);
  if (!r.ok) {
    await sock.sendMessage(groupJid, { text: r.reason }, { quoted: msg });
    return true;
  }
  await sock.sendMessage(groupJid, { text: '✅ Aprobada.\n\n' + rusaCreatedText(pending.requester), mentions: [pending.requester] }, { quoted: msg });
  return true;
}

module.exports = { createGame, startGame, handleBang, stopGame, requestApproval, handleApproval, rusaCreatedText };
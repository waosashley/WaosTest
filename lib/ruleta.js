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

module.exports = { createGame, startGame, handleBang, stopGame };
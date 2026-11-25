const { Aki } = require('aki-api');
const U = require('./utils');

const REGION = 'es';
const MAX_STEPS = 80;
const IDLE_MS = 5 * 60 * 1000;

// Claves sin tildes (U.normalizeText las quita antes de comparar).
const ANSWERS = {
  si: 0, s: 0, yes: 0,
  no: 1, n: 1,
  'no se': 2, ns: 2,
  probablemente: 3,
  'probablemente no': 4,
};
const YES_CODES = [0, 3];

function parseAnswer(text) {
  const key = U.normalizeText(text.trim());
  return key in ANSWERS ? ANSWERS[key] : null;
}

function hint() {
  return 'Responde: *sí*, *no*, *no sé*, *probablemente* o *probablemente no*.';
}

function armTimeout(sock, groupJid, game) {
  if (game.timeout) clearTimeout(game.timeout);
  game.timeout = setTimeout(() => {
    if (U.activeGames.get(groupJid) !== game) return;
    U.activeGames.delete(groupJid);
    sock.sendMessage(groupJid, { text: '⏱️ Se acabó el tiempo. Akinator cancelado.' }).catch(() => {});
  }, IDLE_MS);
}

function endGame(groupJid, game) {
  if (game.timeout) clearTimeout(game.timeout);
  if (U.activeGames.get(groupJid) === game) U.activeGames.delete(groupJid);
}

async function sendGuess(sock, groupJid, guess) {
  const caption = `🧞 ¿Tu personaje es *${guess.name_proposition}*?\n${guess.description_proposition || ''}\n\nResponde *sí* o *no*.`;
  if (guess.photo) {
    try {
      await sock.sendMessage(groupJid, { image: { url: guess.photo }, caption });
      return;
    } catch (e) {
      console.error('[AKINATOR] imagen:', e.message);
    }
  }
  await sock.sendMessage(groupJid, { text: caption });
}

async function createGame(sock, groupJid, starterJid) {
  if (U.activeGames.has(groupJid)) return { ok: false };
  const game = { type: 'akinator', player: starterJid, aki: null, phase: 'question', steps: 0, timeout: null };
  U.activeGames.set(groupJid, game);
  try {
    game.aki = await new Aki({ region: REGION }).start();
  } catch (e) {
    console.error('[AKINATOR] start:', e.message);
    endGame(groupJid, game);
    return { ok: false, error: 'No pude conectar con Akinator. Intenta de nuevo.' };
  }
  armTimeout(sock, groupJid, game);
  return { ok: true, question: game.aki.question };
}

async function stopGame(sock, groupJid) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'akinator') return false;
  endGame(groupJid, game);
  return true;
}

// Respuestas del jugador (handler pasivo). Solo el jugador que inició responde.
async function handleAnswer(sock, groupJid, senderJid, msg, text) {
  const game = U.activeGames.get(groupJid);
  if (!game || game.type !== 'akinator' || senderJid !== game.player) return false;
  const code = parseAnswer(text);
  if (code === null) return false;

  armTimeout(sock, groupJid, game);
  try {
    if (game.phase === 'guess') {
      if (YES_CODES.includes(code)) {
        endGame(groupJid, game);
        await sock.sendMessage(groupJid, { text: '🧞 ¡Lo adiviné! Gracias por jugar.' });
        return true;
      }
      const res = await game.aki.continue();
      game.phase = 'question';
      return sendQuestion(sock, groupJid, res.question);
    }

    const res = await game.aki.step(code);
    game.steps++;
    if (res.id_base_proposition) {
      game.phase = 'guess';
      await sendGuess(sock, groupJid, res);
      return true;
    }
    if (game.steps >= MAX_STEPS) {
      endGame(groupJid, game);
      await sock.sendMessage(groupJid, { text: '🧞 Me rindo, no pude adivinarlo. ¡Buen intento!' });
      return true;
    }
    return sendQuestion(sock, groupJid, res.question);
  } catch (e) {
    console.error('[AKINATOR]', e.message);
    endGame(groupJid, game);
    await sock.sendMessage(groupJid, { text: '⚠️ Error con Akinator. La partida se cerró, intenta de nuevo.' }).catch(() => {});
    return true;
  }
}

async function sendQuestion(sock, groupJid, question) {
  await sock.sendMessage(groupJid, { text: `🧞 ${question}\n${hint()}` });
  return true;
}

module.exports = { createGame, stopGame, handleAnswer };

const U = require('./utils');

// akinator-client solo tiene entrada ESM funcional (su build CJS falla al cargar got-scraping).
let akiLib = null;
function loadAkinator() {
  akiLib ??= import('akinator-client');
  return akiLib;
}

const MAX_STEPS = 80;
const IDLE_MS = 5 * 60 * 1000;

const OPTIONS = [
  { letter: 'a', label: 'sí', code: 0 },
  { letter: 'b', label: 'no', code: 1 },
  { letter: 'c', label: 'no lo sé', code: 2 },
  { letter: 'd', label: 'probablemente', code: 3 },
  { letter: 'e', label: 'probablemente no', code: 4 },
];
const YES_CODES = [0, 3];

function parseAnswer(text) {
  const key = U.normalizeText(text.trim());
  const opt = OPTIONS.find(o => o.letter === key);
  return opt ? opt.code : null;
}

function formatQuestion(number, question) {
  const opts = OPTIONS.map(o => `${o.letter}) ${o.label}`).join('\n');
  return `🧞 *Pregunta ${number}:* ${question}\n\nResponde con:\n${opts}\n\n_(Escribe 'salir' para abandonar)_`;
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
  const opts = OPTIONS.map(o => `${o.letter}) ${o.label}`).join('\n');
  const caption = `🧞 ¿Tu personaje es *${guess.name}*?\n${guess.description || ''}\n\nResponde con:\n${opts}\n\n_(Escribe 'salir' para abandonar)_`;
  if (guess.pictureUrl) {
    try {
      await sock.sendMessage(groupJid, { image: { url: guess.pictureUrl }, caption });
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
  let first;
  try {
    const { AkinatorClient, Languages } = await loadAkinator();
    game.aki = new AkinatorClient({ language: Languages.Spanish, childMode: false });
    first = await game.aki.start();
  } catch (e) {
    console.error('[AKINATOR] start:', e.message);
    endGame(groupJid, game);
    return { ok: false, error: 'No pude conectar con Akinator. Intenta de nuevo.' };
  }
  armTimeout(sock, groupJid, game);
  return { ok: true, question: first.question };
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
  if (U.normalizeText(text.trim()) === 'salir') {
    endGame(groupJid, game);
    await sock.sendMessage(groupJid, { text: '🛑 Abandonaste el Akinator.' });
    return true;
  }
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
      return sendQuestion(sock, groupJid, game, res.question);
    }

    const res = await game.aki.answer(code);
    game.steps++;
    if (res.won) {
      game.phase = 'guess';
      await sendGuess(sock, groupJid, game.aki.winResult);
      return true;
    }
    if (game.steps >= MAX_STEPS) {
      endGame(groupJid, game);
      await sock.sendMessage(groupJid, { text: '🧞 Me rindo, no pude adivinarlo. ¡Buen intento!' });
      return true;
    }
    return sendQuestion(sock, groupJid, game, res.question);
  } catch (e) {
    console.error('[AKINATOR]', e.message);
    endGame(groupJid, game);
    await sock.sendMessage(groupJid, { text: '⚠️ Error con Akinator. La partida se cerró, intenta de nuevo.' }).catch(() => {});
    return true;
  }
}

async function sendQuestion(sock, groupJid, game, question) {
  await sock.sendMessage(groupJid, { text: formatQuestion(game.steps + 1, question) });
  return true;
}

module.exports = { createGame, stopGame, handleAnswer, formatQuestion };

const U = require('./utils');

let lastQuestionText = null;

const TIEMPO_RESPUESTA_MS = 30 * 1000;
const COOLDOWN_MS = 60 * 1000;
const CASTIGO_COOLDOWN_MS = 5 * 60 * 1000;
const cooldownHasta = new Map(); // userNum -> timestamp en que puede volver a lanzar una trivia

function marcarFin(jid) {
  if (jid) cooldownHasta.set(U.userNum(jid), Date.now() + COOLDOWN_MS);
}

// Castigo a quien lanzó la trivia: -1 victoria y 5 min sin poder lanzar otra.
function castigar(groupJid, jid) {
  if (!jid) return;
  if (!U.triviaWins[groupJid]) U.triviaWins[groupJid] = {};
  U.triviaWins[groupJid][jid] = (U.triviaWins[groupJid][jid] || 0) - 1;
  U.saveJSON("triviaWins.json", U.triviaWins);
  cooldownHasta.set(U.userNum(jid), Date.now() + CASTIGO_COOLDOWN_MS);
}

function cooldownRestante(jid) {
  return Math.max(0, (cooldownHasta.get(U.userNum(jid)) || 0) - Date.now());
}

const ri = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[ri(0, arr.length - 1)];

function formatQuadratic(b, c) {
  let s = 'x²';
  if (b !== 0) s += b > 0 ? ` + ${b}x` : ` - ${Math.abs(b)}x`;
  if (c !== 0) s += c > 0 ? ` + ${c}` : ` - ${Math.abs(c)}`;
  return s;
}

const facil = [
  () => { const a = ri(2, 20), b = ri(2, 20); return { text: `${a} + ${b}`, answer: String(a + b) }; },
  () => { const a = ri(10, 50), b = ri(2, a - 1); return { text: `${a} - ${b}`, answer: String(a - b) }; },
  () => { const a = ri(2, 10), b = ri(2, 10); return { text: `${a} × ${b}`, answer: String(a * b) }; },
  () => { const b = ri(2, 9), ans = ri(2, 10); return { text: `${b * ans} ÷ ${b}`, answer: String(ans) }; },
];

const medio = [
  () => { const a = ri(10, 50), b = ri(2, 9), c = ri(2, 9); return { text: `${a} + ${b} × ${c}`, answer: String(a + b * c) }; },
  () => { const a = ri(3, 12), b = ri(3, 12), c = ri(1, 20); return { text: `${a} × ${b} - ${c}`, answer: String(a * b - c) }; },
  () => { const a = ri(5, 15); return { text: `${a}²`, answer: String(a * a) }; },
  () => { const a = ri(3, 7); let f = 1; for (let i = 2; i <= a; i++) f *= i; return { text: `${a}!`, answer: String(f) }; },
  () => { const p = ri(2, 10) * 5, n = ri(5, 50) * 10; return { text: `${p}% de ${n}`, answer: String(p * n / 100) }; },
  () => { const a = ri(11, 30), b = ri(3, 9); return { text: `${a} × ${b}`, answer: String(a * b) }; },
];

const dificil = [
  () => { const r = ri(5, 20); return { text: `√(${r * r})`, answer: String(r) }; },
  () => {
    const n = ri(5, 10), k = ri(1, n - 1);
    const fact = (x) => { let f = 1; for (let i = 2; i <= x; i++) f *= i; return f; };
    return { text: `C(${n},${k})`, answer: String(fact(n) / (fact(k) * fact(n - k))) };
  },
  () => { const a = ri(11, 99), b = ri(11, 99); return { text: `${a} × ${b}`, answer: String(a * b) }; },
  () => { const a = ri(10, 40), b = ri(10, 40), c = ri(10, 40); return { text: `${a} + ${b} + ${c}`, answer: String(a + b + c) }; },
  () => { const b = ri(2, 5), e = ri(2, 4); return { text: `${b}^${e}`, answer: String(Math.pow(b, e)) }; },
  () => { const a = ri(2, 9), b = ri(2, 9), c = ri(2, 9); return { text: `${a} × ${b} + ${c}²`, answer: String(a * b + c * c) }; },
];

const avanzado = [
  () => {
    const n = ri(2, 5), k = ri(2, 4);
    return { text: `d/dx(x^${n}) en x = ${k}`, answer: String(n * Math.pow(k, n - 1)) };
  },
  () => {
    const base = pick([2, 3, 5]), exp = ri(2, 5);
    return { text: `log_${base}(${Math.pow(base, exp)})`, answer: String(exp) };
  },
  () => { const n = ri(10, 100); return { text: `Suma de 1 a ${n}`, answer: String(n * (n + 1) / 2) }; },
  () => { const a = ri(100, 999), b = ri(3, 19); return { text: `${a} mod ${b}`, answer: String(a % b) }; },
  () => {
    const b = ri(2, 9), c = ri(1, 15);
    return { text: `Discriminante de ${formatQuadratic(b, c)}`, answer: String(b * b - 4 * c) };
  },
  () => {
    const opts = [
      { t: 'sin(30°)', a: '0.5' },
      { t: 'sin(90°)', a: '1' },
      { t: 'cos(60°)', a: '0.5' },
      { t: 'cos(0°)', a: '1' },
      { t: 'tan(45°)', a: '1' },
      { t: 'tan(0°)', a: '0' },
      { t: 'sin(30°) + cos(60°)', a: '1' },
    ];
    const o = pick(opts);
    return { text: o.t, answer: o.a };
  },
];

function generateProblem() {
  const r = Math.random();
  let gens, difficulty;
  if (r < 0.35) { gens = facil; difficulty = 'fácil ⭐'; }
  else if (r < 0.65) { gens = medio; difficulty = 'medio ⭐⭐'; }
  else if (r < 0.88) { gens = dificil; difficulty = 'difícil ⭐⭐⭐'; }
  else { gens = avanzado; difficulty = 'avanzado ⭐⭐⭐⭐'; }

  let problem, attempts = 0;
  do {
    problem = pick(gens)();
    attempts++;
  } while (problem.text === lastQuestionText && attempts < 20);

  lastQuestionText = problem.text;
  return { ...problem, difficulty };
}

function normalize(s) {
  return String(s).trim().toLowerCase()
    .replace(/\s+/g, '').replace(/,/g, '.')
    .replace(/=+$/, '').replace(/%$/, '').replace(/^\+/, '');
}

function answersMatch(given, expected) {
  const g = normalize(given), e = normalize(expected);
  if (g === e) return true;
  const parse = (s) => {
    const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  const gn = parse(g), en = parse(e);
  if (gn !== null && en !== null && Math.abs(gn - en) < 1e-9) return true;
  return false;
}

async function startGame(sock, groupJid, starterJid) {
  const prev = U.pendingTrivia.get(groupJid);
  if (prev?.timeout) clearTimeout(prev.timeout);

  const problem = generateProblem();
  console.log(`[TRIVIA] (${problem.difficulty}) ${problem.text} = ${problem.answer}`);

  const sent = await sock.sendMessage(groupJid, {
    text: `🧮 *Trivia Math* — ${problem.difficulty}\n\n${problem.text} = ?\n\n_Responde a este mensaje con el resultado. El primero en acertar gana._`,
  });

  const state = {
    answer: problem.answer,
    starter: starterJid,
    questionText: problem.text,
    difficulty: problem.difficulty,
    messageId: sent.key.id,
    answered: false,
  };

  state.timeout = setTimeout(() => {
    const cur = U.pendingTrivia.get(groupJid);
    if (cur && !cur.answered && cur.messageId === state.messageId) {
      U.pendingTrivia.delete(groupJid);
      castigar(groupJid, cur.starter);
      sock.sendMessage(groupJid, {
        text: `⏱️ Se acabó el tiempo. La respuesta era *${problem.answer}*.\n\n📉 @${cur.starter.split("@")[0]} recibe -1 y 5 min de cooldown.`,
        mentions: [cur.starter],
      }).catch(() => {});
    }
  }, TIEMPO_RESPUESTA_MS);

  U.pendingTrivia.set(groupJid, state);
  return true;
}

async function checkAnswer(sock, groupJid, senderJid, msg, text) {
  const state = U.pendingTrivia.get(groupJid);
  if (!state || state.answered || !text) return false;

  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx?.stanzaId || ctx.stanzaId !== state.messageId) return false;

  if (!answersMatch(text, state.answer)) {
    // Solo la respuesta incorrecta de quien lanzó la trivia termina la partida con castigo.
    if (!state.starter || U.userNum(senderJid) !== U.userNum(state.starter)) return false;
    state.answered = true;
    clearTimeout(state.timeout);
    U.pendingTrivia.delete(groupJid);
    castigar(groupJid, state.starter);
    await sock.sendMessage(groupJid, {
      text: `❌ @${senderJid.split("@")[0]} respondió mal.\n\nLa respuesta era *${state.answer}*.\n\n📉 Recibe -1 y 5 min de cooldown.`,
      mentions: [senderJid],
    }, { quoted: msg });
    return true;
  }

  state.answered = true;
  clearTimeout(state.timeout);
  U.pendingTrivia.delete(groupJid);
  marcarFin(state.starter);

  if (!U.triviaWins[groupJid]) U.triviaWins[groupJid] = {};
  U.triviaWins[groupJid][senderJid] = (U.triviaWins[groupJid][senderJid] || 0) + 1;
  U.saveJSON('triviaWins.json', U.triviaWins);

  const count = U.triviaWins[groupJid][senderJid];
  await sock.sendMessage(groupJid, {
    text: `✅ ¡@${senderJid.split('@')[0]} acertó!\n\n${state.questionText} = *${state.answer}*\n\n🏆 Victorias: ${count}`,
    mentions: [senderJid],
  }, { quoted: msg });

  return true;
}

module.exports = { startGame, checkAnswer, marcarFin, cooldownRestante };

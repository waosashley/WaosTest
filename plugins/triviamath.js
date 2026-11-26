const T = require('../lib/trivia');
const U = require('../lib/utils');

module.exports = {
  name: 'triviamath',
  aliases: ['math', 'matetrivia', 'tm'],
  public: true,
  run: async ({ sock, groupJid, senderJid, args, reply }) => {
    const sub = args[0]?.toLowerCase();

    if (sub === 'stop' || sub === 'cancelar') {
      const state = U.pendingTrivia.get(groupJid);
      if (!state) return reply({ text: 'No hay trivia activa.' });
      clearTimeout(state.timeout);
      U.pendingTrivia.delete(groupJid);
      return reply({ text: `🛑 Trivia cancelada. La respuesta era *${state.answer}*.` });
    }

    if (sub === 'rank' || sub === 'ranking' || sub === 'top') {
      const totales = {};
      for (const wins of Object.values(U.triviaWins)) {
        for (const [jid, w] of Object.entries(wins)) totales[jid] = (totales[jid] || 0) + w;
      }
      const mejorRacha = {};
      for (const rachas of Object.values(U.triviaStreak)) {
        for (const [jid, r] of Object.entries(rachas)) mejorRacha[jid] = Math.max(mejorRacha[jid] || 0, r);
      }
      const entries = Object.entries(totales).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const rachas = Object.entries(mejorRacha).filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!entries.length && !rachas.length) return reply({ text: 'Nadie ha ganado todavía.' });
      const medals = ['🥇', '🥈', '🥉'];
      const sections = [];
      if (entries.length) {
        const lines = entries.map(([jid, w], i) =>
          `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]}: ${w} ${w === 1 ? 'victoria' : 'victorias'}`
        );
        sections.push(`🏆 *Victorias*\n${lines.join('\n')}`);
      }
      if (rachas.length) {
        const lines = rachas.map(([jid, r], i) =>
          `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]}: ${r} ${r === 1 ? 'acierto' : 'aciertos'} seguidos`
        );
        sections.push(`🔥 *Racha de aciertos*\n${lines.join('\n')}`);
      }
      const mentions = [...new Set([...entries, ...rachas].map(([j]) => j))];
      return reply({
        text: `*Ranking Global Trivia Math*\n\n${sections.join('\n\n')}`,
        mentions,
      });
    }

    const restante = T.cooldownRestante(senderJid);
    if (restante > 0) return reply({ text: `⏳ Espera ${Math.ceil(restante / 1000)} s para lanzar otra trivia.` });

    return T.startGame(sock, groupJid, senderJid);
  },
};

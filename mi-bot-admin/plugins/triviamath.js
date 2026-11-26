const T = require('../lib/trivia');
const U = require('../lib/utils');

module.exports = {
  name: 'triviamath',
  aliases: ['math', 'matetrivia'],
  run: async ({ sock, groupJid, args, reply }) => {
    const sub = args[0]?.toLowerCase();

    if (sub === 'stop' || sub === 'cancelar') {
      const state = U.pendingTrivia.get(groupJid);
      if (!state) return reply({ text: 'No hay trivia activa.' });
      clearTimeout(state.timeout);
      U.pendingTrivia.delete(groupJid);
      return reply({ text: `🛑 Trivia cancelada. La respuesta era *${state.answer}*.` });
    }

    if (sub === 'rank' || sub === 'ranking' || sub === 'top') {
      const wins = U.triviaWins[groupJid] || {};
      const entries = Object.entries(wins).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!entries.length) return reply({ text: 'Nadie ha ganado todavía.' });
      const medals = ['🥇', '🥈', '🥉'];
      const lines = entries.map(([jid, w], i) =>
        `${medals[i] || `${i + 1}.`} @${jid.split('@')[0]}: ${w} ${w === 1 ? 'victoria' : 'victorias'}`
      );
      return reply({
        text: `*Ranking Trivia Math*\n\n${lines.join('\n')}`,
        mentions: entries.map(([j]) => j),
      });
    }

    return T.startGame(sock, groupJid);
  },
};

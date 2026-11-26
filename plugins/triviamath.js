const T = require('../lib/trivia');
const U = require('../lib/utils');

module.exports = {
  name: 'triviamath',
  aliases: ['math', 'matetrivia', 'tm'],
  public: true,
  run: async ({ sock, groupJid, senderJid, senderPn, args, reply }) => {
    const sub = args[0]?.toLowerCase();

    if (sub === 'shield') {
      if (!U.isBotOwner(senderJid, senderPn)) return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
      const modo = args[1]?.toLowerCase();
      if (modo !== 'on' && modo !== 'off') {
        return reply({ text: `🛡️ Shield: ${U.triviaShield.on ? 'activado' : 'desactivado'}. Uso: !tm shield on/off` });
      }
      U.triviaShield.on = modo === 'on';
      U.saveJSON('triviaShield.json', U.triviaShield);
      return reply({ text: `🛡️ Shield ${U.triviaShield.on ? 'activado' : 'desactivado'}.` });
    }

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
      const entries = Object.entries(totales).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const rachas = Object.entries(U.triviaStreak).filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
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

    const esOwner = U.isBotOwner(senderJid, senderPn);
    const restante = T.cooldownRestante(senderJid, esOwner);
    if (restante > 0) return reply({ text: `⏳ Espera ${Math.ceil(restante / 1000)} s para lanzar otra trivia.` });

    return T.startGame(sock, groupJid, senderJid, esOwner);
  },
};

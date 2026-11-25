const U = require('../lib/utils');
const R = require('../lib/ruleta');

module.exports = {
  name: 'ruletarusa',
  public: true,
  aliases: ['ruleta'],
  run: async ({ sock, msg, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'create' || !sub) {
      if (!isAdmin) {
        const q = await R.requestApproval(sock, groupJid, senderJid, msg);
        if (!q.ok) return reply({ text: q.reason });
        return;
      }
      const r = await R.createGame(sock, groupJid, senderJid, false);
      if (!r.ok) return reply({ text: r.reason });
      return reply({ text: R.rusaCreatedText(senderJid), mentions: [senderJid] });
    }
    if (sub === 'unirme' || sub === 'join') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ruleta' || g.started) return reply({ text: 'No hay ruleta abierta.' });
      if (g.players.includes(senderJid)) return reply({ text: 'Ya estás dentro.' });
      if (g.players.length >= 4) return reply({ text: 'Llena (máx 4).' });
      g.players.push(senderJid);
      return reply({
        text: `✅ @${senderJid.split('@')[0]} se unió.\nJugadores (${g.players.length}/4): ${g.players.map(p => '@' + p.split('@')[0]).join(', ')}`,
        mentions: g.players,
      });
    }
    if (sub === 'iniciar' || sub === 'start') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ruleta') return reply({ text: 'No hay ruleta.' });
      if (g.started) return;
      if (g.creator !== senderJid) return reply({ text: 'Solo el creador inicia.' });
      if (g.players.length < 2) return reply({ text: 'Mínimo 2 jugadores.' });
      await R.startGame(sock, groupJid, g);
      return;
    }
    if (sub === 'stop') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ruleta') return reply({ text: 'No hay ruleta.' });
      if (g.creator !== senderJid && !isAdmin) return reply({ text: 'Solo el creador o un admin la detiene.' });
      await R.stopGame(sock, groupJid);
      return reply({ text: '🛑 Ruleta detenida.' });
    }
    return reply({ text: 'Subcomandos: create, unirme, iniciar, stop' });
  },
};
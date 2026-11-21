const U = require('../lib/utils');
const C4 = require('../lib/conecta4');

module.exports = {
  name: 'conecta4',
  aliases: ['c4'],
  run: async ({ sock, groupJid, senderJid, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'stop' || sub === 'cancelar') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'conecta4') return reply({ text: 'No hay conecta 4 activo.' });
      if (g.creator !== senderJid) return reply({ text: 'Solo el creador lo detiene.' });
      await C4.stopGame(sock, groupJid);
      return reply({ text: '🛑 Conecta 4 detenido.' });
    }
    if (sub === 'unirme' || sub === 'join') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'conecta4' || g.started) return reply({ text: 'No hay conecta 4 abierto.' });
      if (g.players.includes(senderJid)) return reply({ text: 'Ya estás dentro.' });
      if (g.players.length >= 2) return reply({ text: 'Ya hay 2 jugadores.' });
      g.players.push(senderJid);
      return reply({
        text: `✅ @${senderJid.split('@')[0]} se unió.\n\nEl creador inicia con *!conecta4 iniciar*.`,
        mentions: [senderJid],
      });
    }
    if (sub === 'iniciar' || sub === 'start') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'conecta4') return reply({ text: 'No hay conecta 4.' });
      if (g.started) return;
      if (g.creator !== senderJid) return reply({ text: 'Solo el creador inicia.' });
      if (g.players.length < 2) return reply({ text: 'Se necesitan 2 jugadores.' });
      await C4.startGame(sock, groupJid, g);
      return;
    }
    const r = await C4.createGame(sock, groupJid, senderJid);
    if (!r.ok) return reply({ text: 'Ya hay un juego activo en el grupo.' });
    return reply({
      text: `🎮 *Conecta 4 creado*\n\nCreador: @${senderJid.split('@')[0]}\nOtro jugador debe unirse con *!conecta4 unirme*.\n\nTablero: 6x7. Gana quien alinee 4.\n\nEl creador inicia con *!conecta4 iniciar*.`,
      mentions: [senderJid],
    });
  },
};
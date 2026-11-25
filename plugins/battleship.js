const U = require('../lib/utils');
const BS = require('../lib/battleship');

module.exports = {
  name: 'battleship',
  public: true,
  aliases: ['bn', 'batallanaval'],
  run: async ({ sock, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'stop' || sub === 'cancelar') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'battleship') return reply({ text: 'No hay batalla naval activa.' });
      if (g.creator !== senderJid && !g.players.includes(senderJid) && !isAdmin) {
        return reply({ text: 'Solo el creador, los jugadores o un admin la detienen.' });
      }
      await BS.stopGame(sock, groupJid);
      return reply({ text: '🛑 Batalla naval detenida.' });
    }
    if (sub === 'unirme' || sub === 'join') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'battleship' || g.started) return reply({ text: 'No hay batalla naval abierta.' });
      if (g.players.includes(senderJid)) return reply({ text: 'Ya estás dentro.' });
      if (g.players.length >= 2) return reply({ text: 'Ya hay 2 jugadores.' });
      g.players.push(senderJid);
      return reply({
        text: `✅ @${senderJid.split('@')[0]} se unió.\n\nEl creador inicia con *!battleship iniciar*.\nLos barcos se colocan en el chat privado conmigo.`,
        mentions: [senderJid],
      });
    }
    if (sub === 'iniciar' || sub === 'start') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'battleship') return reply({ text: 'No hay batalla naval.' });
      if (g.started) return;
      if (g.creator !== senderJid) return reply({ text: 'Solo el creador inicia.' });
      if (g.players.length < 2) return reply({ text: 'Se necesitan 2 jugadores.' });
      await BS.startGame(sock, groupJid, g);
      return;
    }
    const r = await BS.createGame(sock, groupJid, senderJid);
    if (!r.ok) return reply({ text: 'Ya hay un juego activo en el grupo.' });
    return reply({
      text: `🚢 *Batalla naval creada*\n\nCreador: @${senderJid.split('@')[0]}\nOtro jugador debe unirse con *!battleship unirme*.\n\nFlota de 5 barcos en tablero 10x10. Cada uno coloca sus barcos en privado; la batalla empieza en el grupo.\n\nEl creador inicia con *!battleship iniciar*.`,
      mentions: [senderJid],
    });
  },
};

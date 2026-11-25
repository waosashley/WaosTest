const U = require('../lib/utils');
const A = require('../lib/ajedrez');

module.exports = {
  name: 'ajedrez',
  public: true,
  aliases: ['chess'],
  run: async ({ sock, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'stop' || sub === 'cancelar') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ajedrez') return reply({ text: 'No hay ajedrez activo.' });
      if (g.creator !== senderJid && !g.players.includes(senderJid) && !isAdmin) return reply({ text: 'Solo un jugador o un admin lo detiene.' });
      await A.stopGame(sock, groupJid);
      return reply({ text: '🛑 Ajedrez detenido.' });
    }
    if (sub === 'unirme' || sub === 'join') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ajedrez' || g.started) return reply({ text: 'No hay ajedrez abierto.' });
      if (g.players.includes(senderJid)) return reply({ text: 'Ya estás dentro.' });
      if (g.players.length >= 2) return reply({ text: 'Ya hay 2 jugadores.' });
      g.players.push(senderJid);
      return reply({
        text: `✅ @${senderJid.split('@')[0]} se unió (⚫ Negras).\n\nEl creador inicia con *!ajedrez iniciar*.`,
        mentions: [senderJid],
      });
    }
    if (sub === 'iniciar' || sub === 'start') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'ajedrez') return reply({ text: 'No hay ajedrez.' });
      if (g.started) return;
      if (g.creator !== senderJid) return reply({ text: 'Solo el creador inicia.' });
      if (g.players.length < 2) return reply({ text: 'Se necesitan 2 jugadores.' });
      await A.startGame(sock, groupJid, g);
      return;
    }
    const r = await A.createGame(sock, groupJid, senderJid);
    if (!r.ok) return reply({ text: 'Ya hay un juego activo en el grupo.' });
    return reply({
      text: `♟️ *Ajedrez creado*\n\n⚪ Blancas: @${senderJid.split('@')[0]}\nOtro jugador se une con *!ajedrez unirme* (⚫ Negras).\n\nSe mueve escribiendo origen y destino, ej: *E2 E4*.\nPromoción automática a dama (o añade la pieza: *E7 E8 N*).\n\nEl creador inicia con *!ajedrez iniciar*.\nSe detiene con *!ajedrez stop*.`,
      mentions: [senderJid],
    });
  },
};

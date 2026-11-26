const U = require('../lib/utils');
const B = require('../lib/buscaminas');

module.exports = {
  name: 'buscaminas',
  public: true,
  run: async ({ sock, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'stop' || sub === 'cancelar') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'buscaminas') return reply({ text: 'No hay buscaminas activo.' });
      if (U.userNum(g.player) !== U.userNum(senderJid) && !isAdmin) {
        return reply({ text: 'Solo quien jugó o un admin lo detiene.' });
      }
      await B.stopGame(sock, groupJid);
      return reply({ text: '🛑 Buscaminas detenido.' });
    }

    const mode = B.parseMode(args[0]);
    if (!mode) {
      return reply({ text: 'Uso: *!buscaminas facil|medio|dificil*\nLuego juega con *A1 e* (excavar) o *A1 b* (bandera).' });
    }

    const left = B.cooldownLeft(senderJid);
    if (left > 0) {
      const min = Math.ceil(left / 60000);
      return reply({ text: `⏳ Perdiste hace poco. Espera ${min} min para volver a jugar.`, mentions: [senderJid] });
    }

    const r = await B.createGame(sock, groupJid, senderJid, mode);
    if (!r.ok) return reply({ text: r.reason });
  },
};

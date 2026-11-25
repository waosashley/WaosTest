const U = require('../lib/utils');
const AK = require('../lib/akinator');

module.exports = {
  name: 'akinator',
  public: true,
  aliases: ['aki'],
  run: async ({ sock, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'stop' || sub === 'cancelar') {
      const g = U.activeGames.get(groupJid);
      if (!g || g.type !== 'akinator') return reply({ text: 'No hay Akinator activo.' });
      if (g.player !== senderJid && !isAdmin) return reply({ text: 'Solo quien inició o un admin lo detiene.' });
      await AK.stopGame(sock, groupJid);
      return reply({ text: '🛑 Akinator detenido.' });
    }
    const r = await AK.createGame(sock, groupJid, senderJid);
    if (!r.ok) {
      return reply({ text: r.error || 'Ya hay un juego activo en el grupo.' });
    }
    return reply({
      text: `🧞 *Akinator*\n\nPiensa en un personaje y yo intentaré adivinarlo.\nSolo tú puedes responder (@${senderJid.split('@')[0]}).\n\n🧞 ${r.question}\nResponde: *sí*, *no*, *no sé*, *probablemente* o *probablemente no*.\n\nPara cancelar: *!akinator stop*`,
      mentions: [senderJid],
    });
  },
};

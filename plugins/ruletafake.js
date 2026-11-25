const R = require('../lib/ruleta');
module.exports = {
  name: 'ruletafake',
  public: true,
  run: async ({ sock, groupJid, senderJid, reply }) => {
    const r = await R.createGame(sock, groupJid, senderJid, true);
    if (!r.ok) return reply({ text: r.reason });
    return reply({
      text: `🎭 *Ruleta fake creada*\n\nCreador: @${senderJid.split('@')[0]}\n60s para unirse con *!ruletarusa unirme*.\nMáx 4. *Nadie es expulsado.*\n\nRevólver: 12 recámaras, 1 bala.\nCada uno escribe *bang* en su turno.\n\nEl creador inicia con *!ruletarusa iniciar*.`,
      mentions: [senderJid],
    });
  },
};
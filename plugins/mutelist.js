const Mutes = require('../lib/mutes');
module.exports = {
  name: 'mutelist',
  aliases: ['listmute'],
  run: async ({ groupJid, reply }) => {
    const lista = Mutes.listar(groupJid);
    if (lista.length === 0) return reply({ text: 'No hay usuarios muteados en este grupo.' });
    const lineas = lista.map((m, i) =>
      `${i + 1}. @${m.jid.split('@')[0]} — ${Mutes.formatoRestante(m.restanteMs)}`
    );
    return reply({
      text: `🔇 *Usuarios muteados*\n\n${lineas.join('\n')}\n\nUsa !unmute <número> para quitar un mute.`,
      mentions: lista.map(m => m.jid),
    });
  },
};

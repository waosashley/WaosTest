const U = require('../lib/utils');
const Mutes = require('../lib/mutes');
module.exports = {
  name: 'mute',
  aliases: ['silenciar'],
  run: async ({ sock, groupJid, senderJid, getTarget, args, reply }) => {
    const target = getTarget();
    if (target) {
      if (target === senderJid) return;
      if (await U.isSenderAdmin(sock, groupJid, target))
        return reply({ text: 'No puedo mutear a un administrador.' });
      const durToken = args.find(a => /^\d+[smhd]$/i.test(a));
      const ms = durToken ? Mutes.parseDuracion(durToken) : null;
      Mutes.mutear(groupJid, target, ms);
      const duracion = ms == null ? '' : ` por ${Mutes.formatoRestante(ms)}`;
      return reply({ text: `🔇 @${target.split('@')[0]} silenciado${duracion}.`, mentions: [target] });
    }
    try { await sock.groupSettingUpdate(groupJid, 'announcement'); }
    catch (e) { console.error('[MUTE]', e.message); }
  },
};

const Mutes = require('../lib/mutes');
module.exports = {
  name: 'unmute',
  aliases: ['dessilenciar', 'abrir'],
  run: async ({ sock, groupJid, args, getTarget, reply }) => {
    const target = getTarget();
    if (target) {
      if (!Mutes.desmutear(groupJid, target)) return;
      return reply({ text: `🔊 @${target.split('@')[0]} desilenciado.`, mentions: [target] });
    }
    const pos = /^\d+$/.test(args[0] || '') ? Number(args[0]) : null;
    if (pos != null) {
      const item = Mutes.listar(groupJid)[pos - 1];
      if (!item) return reply({ text: 'Número inválido. Revisa !mutelist.' });
      Mutes.desmutear(groupJid, item.jid);
      return reply({ text: `🔊 @${item.jid.split('@')[0]} desilenciado.`, mentions: [item.jid] });
    }
    try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); }
    catch (e) { console.error('[UNMUTE]', e.message); }
  },
};

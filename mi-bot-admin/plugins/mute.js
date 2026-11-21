const U = require('../lib/utils');
module.exports = {
  name: 'mute',
  aliases: ['silenciar'],
  run: async ({ sock, groupJid, senderJid, getTarget, reply }) => {
    const target = getTarget();
    if (target) {
      if (target === senderJid) return;
      if (await U.isSenderAdmin(sock, groupJid, target))
        return reply({ text: 'No puedo mutear a un administrador.' });
      U.mutedUsers[`${groupJid}:${target}`] = true;
      U.saveJSON('mutedUsers.json', U.mutedUsers);
      return reply({ text: `🔇 @${target.split('@')[0]} silenciado.`, mentions: [target] });
    }
    try { await sock.groupSettingUpdate(groupJid, 'announcement'); }
    catch (e) { console.error('[MUTE]', e.message); }
  },
};

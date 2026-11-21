const U = require('../lib/utils');
module.exports = {
  name: 'unmute',
  aliases: ['dessilenciar', 'abrir'],
  run: async ({ sock, groupJid, getTarget, reply }) => {
    const target = getTarget();
    if (target) {
      const key = `${groupJid}:${target}`;
      if (!U.mutedUsers[key]) return;
      delete U.mutedUsers[key];
      U.saveJSON('mutedUsers.json', U.mutedUsers);
      return reply({ text: `🔊 @${target.split('@')[0]} desilenciado.`, mentions: [target] });
    }
    try { await sock.groupSettingUpdate(groupJid, 'not_announcement'); }
    catch (e) { console.error('[UNMUTE]', e.message); }
  },
};

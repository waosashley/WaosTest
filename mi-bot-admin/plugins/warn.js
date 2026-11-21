const U = require('../lib/utils');
module.exports = {
  name: 'warn',
  aliases: ['advertir'],
  run: async ({ sock, groupJid, senderJid, getTarget }) => {
    const target = getTarget();
    if (!target || target === senderJid) return;
    const key = `${groupJid}:${target}`;
    const n = (U.warns[key] || 0) + 1;
    U.warns[key] = n;
    U.saveJSON('warns.json', U.warns);
    if (n >= 3) {
      try {
        await sock.groupParticipantsUpdate(groupJid, [target], 'remove');
        delete U.warns[key];
        U.saveJSON('warns.json', U.warns);
      } catch (e) { console.error('[WARN→KICK]', e.message); }
    }
  },
};

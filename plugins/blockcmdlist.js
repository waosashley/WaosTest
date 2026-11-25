const U = require('../lib/utils');

module.exports = {
  name: 'blockcmdlist',
  aliases: ['bcl'],
  run: async ({ sock, groupJid, senderJid, reply }) => {
    if (!(await U.isGroupCreator(sock, groupJid, senderJid))) {
      return reply({ text: '🔒 Solo la creadora del grupo puede usar este comando.' });
    }
    const list = U.blockedCmds[groupJid] || [];
    if (list.length === 0) return reply({ text: '✅ No hay comandos bloqueados en este grupo.' });
    return reply({ text: `🚫 *Comandos bloqueados en este grupo:*\n${list.map(c => `▸ !${c}`).join('\n')}` });
  },
};

const U = require('../lib/utils');

module.exports = {
  name: 'blockcmdlist',
  aliases: ['bcl'],
  run: async ({ sock, groupJid, senderJid, senderPn, reply }) => {
    if (!U.isBotOwner(senderJid, senderPn)) {
      return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
    }
    const list = U.blockedCmds[groupJid] || [];
    if (list.length === 0) return reply({ text: '✅ No hay comandos bloqueados en este grupo.' });
    return reply({ text: `🚫 *Comandos bloqueados en este grupo:*\n${list.map(c => `▸ !${c}`).join('\n')}` });
  },
};

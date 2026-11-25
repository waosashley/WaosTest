const U = require('../lib/utils');

module.exports = {
  name: 'unblockcmd',
  run: async ({ sock, groupJid, senderJid, args, plugins, reply }) => {
    if (!(await U.isGroupCreator(sock, groupJid, senderJid))) {
      return reply({ text: '🔒 Solo la creadora del grupo puede usar este comando.' });
    }
    const raw = (args[0] || '').replace(/^[!.]/, '').toLowerCase();
    if (!raw) return reply({ text: 'Uso: !unblockcmd !comando (ej. !unblockcmd !sa)' });

    const plugin = plugins.get(raw);
    const name = plugin ? plugin.name : raw;
    const list = U.blockedCmds[groupJid] || [];
    if (!list.includes(name)) return reply({ text: `ℹ️ !${name} no está bloqueado en este grupo.` });

    U.blockedCmds[groupJid] = list.filter(c => c !== name);
    if (U.blockedCmds[groupJid].length === 0) delete U.blockedCmds[groupJid];
    U.saveJSON('blockedCmds.json', U.blockedCmds);
    return reply({ text: `✅ !${name} desbloqueado en este grupo.` });
  },
};

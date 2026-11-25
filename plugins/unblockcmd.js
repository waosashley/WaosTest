const U = require('../lib/utils');

module.exports = {
  name: 'unblockcmd',
  run: async ({ sock, groupJid, senderJid, args, plugins, reply }) => {
    if (!U.isBotOwner(senderJid)) {
      return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
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
    if (U.blockedCmdMsgs[groupJid]?.[name]) {
      delete U.blockedCmdMsgs[groupJid][name];
      if (Object.keys(U.blockedCmdMsgs[groupJid]).length === 0) delete U.blockedCmdMsgs[groupJid];
      U.saveJSON('blockedCmdMsgs.json', U.blockedCmdMsgs);
    }
    return reply({ text: `✅ !${name} desbloqueado en este grupo.` });
  },
};

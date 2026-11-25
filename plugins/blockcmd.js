const U = require('../lib/utils');

// Comandos de gestión: no se pueden bloquear para no quedar fuera del control.
const PROTECTED = ['blockcmd', 'unblockcmd', 'blockcmdlist'];

module.exports = {
  name: 'blockcmd',
  run: async ({ sock, groupJid, senderJid, args, plugins, reply }) => {
    if (!U.isBotOwner(senderJid)) {
      return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
    }
    const raw = (args[0] || '').replace(/^[!.]/, '').toLowerCase();
    if (!raw) return reply({ text: 'Uso: !blockcmd !comando [mensaje] (ej. !blockcmd !sa Mensaje opcional)' });
    const message = args.slice(1).join(' ').trim();

    const plugin = plugins.get(raw);
    if (!plugin) return reply({ text: `❌ No existe el comando !${raw}` });
    if (PROTECTED.includes(plugin.name)) return reply({ text: '❌ Ese comando no se puede bloquear.' });

    const list = U.blockedCmds[groupJid] || [];
    if (list.includes(plugin.name) && !message) {
      return reply({ text: `ℹ️ !${plugin.name} ya está bloqueado en este grupo.` });
    }

    if (!list.includes(plugin.name)) {
      U.blockedCmds[groupJid] = [...list, plugin.name];
      U.saveJSON('blockedCmds.json', U.blockedCmds);
    }
    if (message) {
      U.blockedCmdMsgs[groupJid] = { ...(U.blockedCmdMsgs[groupJid] || {}), [plugin.name]: message };
      U.saveJSON('blockedCmdMsgs.json', U.blockedCmdMsgs);
    }
  },
};

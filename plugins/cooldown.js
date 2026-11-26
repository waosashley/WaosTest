const B = require('../lib/buscaminas');

module.exports = {
  name: 'cooldown',
  run: async ({ isOwner, args, getTarget, reply }) => {
    if (!isOwner) return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
    const target = getTarget();
    if (!target || args[args.length - 1]?.toLowerCase() !== 'off') {
      return reply({ text: 'Uso: *!cooldown @usuario off*' });
    }
    B.clearCooldown(target);
    return reply({ text: `✅ Cooldown de buscaminas quitado a @${target.split('@')[0]}.`, mentions: [target] });
  },
};

const S = require('../lib/scheduler');

module.exports = {
  name: 'delprogramar',
  run: async ({ groupJid, args, reply }) => {
    const list = S.listFor(groupJid);
    if (!list.length) return reply({ text: 'ℹ️ No hay programaciones en este grupo.' });

    const n = Number(args.find(Boolean));
    if (!Number.isInteger(n) || n < 1 || n > list.length) {
      return reply({ text: `Uso: !delprogramar <número> (1-${list.length}). Revisa con !programar lista` });
    }

    const target = list[n - 1];
    S.remove(target.id, groupJid);
    return reply({ text: `✅ Programación ${n} eliminada (${target.action} ${target.time}).` });
  },
};

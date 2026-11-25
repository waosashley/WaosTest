const U = require('../lib/utils');

module.exports = {
  name: 'unbanwordgroup',
  aliases: ['ubwg'],
  run: async ({ groupJid, args, reply }) => {
    const palabra = args.join(' ').trim();
    if (!palabra) return reply({ text: 'Uso: !unbanwordgroup <palabra>  (o !ubwg <palabra>)' });

    const list = U.groupBannedWords[groupJid] || [];
    const objetivo = U.normalizeText(palabra);
    const restantes = list.filter(w => U.normalizeText(w) !== objetivo);
    if (restantes.length === list.length) {
      return reply({ text: `ℹ️ "${palabra}" no está baneada en este grupo.` });
    }

    if (restantes.length) U.groupBannedWords[groupJid] = restantes;
    else delete U.groupBannedWords[groupJid];
    U.saveJSON('groupBannedWords.json', U.groupBannedWords);
    return reply({ text: `✅ Palabra desbaneada en este grupo: "${palabra}"` });
  },
};

const U = require('../lib/utils');
module.exports = {
  name: 'banword',
  run: async ({ groupJid, getTarget, args }) => {
    const target = getTarget();
    if (!target) return;
    const mentionText = '@' + target.split('@')[0];
    const wordsPart = args.join(' ').replace(mentionText, '').trim();
    if (!wordsPart) return;
    const palabras = wordsPart.split(',').map(p => p.trim()).filter(Boolean);
    if (!palabras.length) return;
    const key = `${groupJid}:${target}`;
    U.bannedWords[key] = [...new Set([...(U.bannedWords[key] || []), ...palabras])];
    U.saveJSON('bannedWords.json', U.bannedWords);
  },
};

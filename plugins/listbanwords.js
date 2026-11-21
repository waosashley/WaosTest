const U = require('../lib/utils');
module.exports = {
  name: 'listbanwords',
  run: async ({ groupJid, reply }) => {
    const entries = Object.entries(U.bannedWords).filter(([k]) => k.startsWith(groupJid + ':'));
    if (!entries.length) return reply({ text: 'No hay palabras prohibidas en este grupo.' });
    const mentions = entries.map(([k]) => k.split(':')[1]);
    const lines = entries.map(([k, ws]) => `@${k.split(':')[1].split('@')[0]}: ${ws.join(', ')}`);
    return reply({ text: `*Palabras prohibidas*\n\n${lines.join('\n')}`, mentions });
  },
};

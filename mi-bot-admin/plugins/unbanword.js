const U = require('../lib/utils');
module.exports = {
  name: 'unbanword',
  run: async ({ groupJid, getTarget }) => {
    const target = getTarget();
    if (!target) return;
    delete U.bannedWords[`${groupJid}:${target}`];
    U.saveJSON('bannedWords.json', U.bannedWords);
  },
};

const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'stickersbans',
  run: async ({ groupJid, sock, reply }) => {
    const hashes = Object.keys(U.bannedStickers);
    if (!hashes.length) return reply({ text: 'No hay stickers baneados.' });
    await sock.sendMessage(groupJid, { text: `Stickers baneados: ${hashes.length}` });
    for (const h of hashes) {
      const fp = path.join(U.STICKERS_DIR, `${h}.webp`);
      if (fs.existsSync(fp)) {
        try { await sock.sendMessage(groupJid, { sticker: fs.readFileSync(fp) }); } catch (e) {}
      }
    }
  },
};

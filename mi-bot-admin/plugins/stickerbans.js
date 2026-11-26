const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'stickersbans',
  aliases: ['stickerbans'],
  run: async ({ senderJid, groupJid, sock, reply }) => {
    const hashes = Object.keys(U.bannedStickers);
    if (!hashes.length) return reply({ text: 'No hay stickers baneados.' });
    await sock.sendMessage(senderJid, { text: `Stickers baneados: ${hashes.length}` });
    for (const h of hashes) {
      const fp = path.join(U.STICKERS_DIR, `${h}.webp`);
      if (fs.existsSync(fp)) {
        try { await sock.sendMessage(senderJid, { sticker: fs.readFileSync(fp) }); } catch (e) {}
      }
    }
    await reply({ text: '📩 Te envié los stickers baneados por privado.' });
  },
};

const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'bansticker',
  run: async ({ msg, reply }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q?.stickerMessage?.fileSha256) return reply({ text: 'Responde a un sticker con !bansticker' });
    const sticker = q.stickerMessage;
    const fileSha = U.hashToHex(sticker.fileSha256);
    let contentHash = null;
    try {
      const buf = await U.downloadStickerBuffer(sticker);
      contentHash = U.sha256Hex(buf);
      fs.writeFileSync(path.join(U.STICKERS_DIR, `${contentHash}.webp`), buf);
    } catch (e) {}
    const entry = U.stickerCommands[fileSha];
    if (entry) {
      if (entry.fileSha) delete U.stickerCommands[entry.fileSha];
      if (entry.contentHash) delete U.stickerCommands[entry.contentHash];
      U.saveJSON('stickerCommands.json', U.stickerCommands);
    }
    U.bannedStickers[fileSha] = true;
    if (contentHash) U.bannedStickers[contentHash] = true;
    U.saveJSON('bannedStickers.json', U.bannedStickers);
  },
};

const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'delcmd',
  run: async ({ msg, reply }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q?.stickerMessage?.fileSha256)
      return reply({ text: 'Uso: responde al sticker con !delcmd' });
    const fileSha = U.hashToHex(q.stickerMessage.fileSha256);
    let entry = U.stickerCommands[fileSha];
    if (!entry) {
      try {
        const buf = await U.downloadStickerBuffer(q.stickerMessage);
        entry = U.stickerCommands[U.sha256Hex(buf)];
      } catch (e) {}
    }
    if (!entry) return reply({ text: 'Ese sticker no tiene comando asignado.' });
    const removed = entry.cmd;
    if (entry.fileSha) delete U.stickerCommands[entry.fileSha];
    if (entry.contentHash) delete U.stickerCommands[entry.contentHash];
    U.saveJSON('stickerCommands.json', U.stickerCommands);
    if (entry.contentHash) {
      const fp = path.join(U.STICKERS_DIR, `${entry.contentHash}.webp`);
      if (fs.existsSync(fp) && !U.bannedStickers[entry.contentHash]) fs.unlinkSync(fp);
    }
    return reply({ text: `✅ Comando ${removed} eliminado.` });
  },
};

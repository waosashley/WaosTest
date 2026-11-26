const U = require('../lib/utils');
module.exports = {
  name: 'unbansticker',
  run: async ({ msg, reply }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q?.stickerMessage?.fileSha256) return reply({ text: 'Responde al sticker con !unbansticker' });
    const fileSha = U.hashToHex(q.stickerMessage.fileSha256);
    delete U.bannedStickers[fileSha];
    try {
      const buf = await U.downloadStickerBuffer(q.stickerMessage);
      delete U.bannedStickers[U.sha256Hex(buf)];
    } catch (e) {}
    U.saveJSON('bannedStickers.json', U.bannedStickers);
  },
};

const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'addcmd',
  run: async ({ msg, args, reply }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!q?.stickerMessage?.fileSha256)
      return reply({ text: 'Uso: responde a un sticker con !addcmd !comando' });
    const cmd = args.join(' ').trim();
    if (!cmd) return reply({ text: 'Falta el comando. Uso: !addcmd !comando' });
    const registered = (cmd.startsWith('!') || cmd.startsWith('.')) ? cmd : '!' + cmd;
    const sticker = q.stickerMessage;
    const fileSha = U.hashToHex(sticker.fileSha256);
    let contentHash = null;
    try {
      const buf = await U.downloadStickerBuffer(sticker);
      contentHash = U.sha256Hex(buf);
      fs.writeFileSync(path.join(U.STICKERS_DIR, `${contentHash}.webp`), buf);
    } catch (e) {}
    const entry = { cmd: registered, fileSha, contentHash };
    U.stickerCommands[fileSha] = entry;
    if (contentHash) U.stickerCommands[contentHash] = entry;
    U.saveJSON('stickerCommands.json', U.stickerCommands);
    return reply({ text: `✅ Sticker registrado como ${registered}` });
  },
};

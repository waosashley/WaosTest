const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
module.exports = {
  name: 'listcmd',
  run: async ({ groupJid, sock, reply }) => {
    const seen = new Set();
    const unique = [];
    for (const e of Object.values(U.stickerCommands)) {
      if (seen.has(e)) continue;
      seen.add(e); unique.push(e);
    }
    if (!unique.length) return reply({ text: 'No hay comandos de sticker registrados.' });
    await sock.sendMessage(groupJid, { text: `Comandos de sticker: ${unique.length}` });
    for (const e of unique) {
      const fp = e.contentHash ? path.join(U.STICKERS_DIR, `${e.contentHash}.webp`) : null;
      if (fp && fs.existsSync(fp)) {
        try {
          await sock.sendMessage(groupJid, { sticker: fs.readFileSync(fp) });
          await sock.sendMessage(groupJid, { text: `→ ${e.cmd}` });
        } catch (err) {}
      } else {
        await sock.sendMessage(groupJid, { text: `(${(e.fileSha || '').slice(0, 8)}...) → ${e.cmd}` });
      }
    }
  },
};

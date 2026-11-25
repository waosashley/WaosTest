const U = require('../lib/utils');
const A = require('../lib/audiosticker');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = {
  name: 'sav',
  aliases: ['stickervideo'],
  public: true,
  run: async ({ sock, groupJid, msg, reply }) => {
    const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const vid = q?.videoMessage || msg.message?.videoMessage;
    if (!vid) return reply({ text: 'Uso: responde a un VIDEO con !sav para convertirlo en sticker con su audio.' });

    const outId = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(U.TMP_DIR, `${outId}_in.mp4`);
    const webpPath = path.join(U.TMP_DIR, `${outId}.webp`);
    const oggPath = path.join(U.TMP_DIR, `${outId}.ogg`);

    try {
      await U.downloadMediaTo(vid, 'video', inPath);
      const { buffer } = await A.toStickerWebp(inPath, webpPath, { packname: 'WaosBot', author: 'ASHP', maxSeconds: 8 });
      await A.toOggOpus(inPath, oggPath, 8);
      await A.sendStickerWithAudio(sock, groupJid, buffer, oggPath);
    } catch (e) {
      console.error('[SAV]', e);
      return reply({ text: '❌ No se pudo crear el sticker con audio. ' + String(e.message || e).slice(0, 120) });
    } finally {
      for (const f of [inPath, webpPath, oggPath]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} }
    }
  },
};

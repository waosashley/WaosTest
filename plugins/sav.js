const U = require('../lib/utils');
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
    const mp4Path = path.join(U.TMP_DIR, `${outId}.mp4`);

    try {
      await U.downloadMediaTo(vid, 'video', inPath);
      await U.createVideoStickerWithAudio(inPath, mp4Path, { maxDuration: 8 });
      if (!fs.existsSync(mp4Path)) throw new Error('No se generó el video');
      await U.sendAudioSticker(sock, groupJid, mp4Path);
    } catch (e) {
      console.error('[SAV]', e);
      return reply({ text: '❌ No se pudo crear el sticker con audio. ' + String(e.message || e).slice(0, 120) });
    } finally {
      for (const f of [inPath, mp4Path]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} }
    }
  },
};

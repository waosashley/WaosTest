const U = require('../lib/utils');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Estado en memoria: quien ejecuto !sa -> { stickerPath, expires }
const pending = new Map();
const TTL = 3 * 60 * 1000; // 3 minutos para responder con el audio

function cleanupTmp() {
  try {
    for (const f of fs.readdirSync(U.TMP_DIR)) {
      const fp = path.join(U.TMP_DIR, f);
      try { if (Date.now() - fs.statSync(fp).mtimeMs > 30 * 60 * 1000) fs.unlinkSync(fp); } catch (e) {}
    }
  } catch (e) {}
}

async function resolveStickerPath(msg) {
  const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const st = q?.stickerMessage || msg.message?.stickerMessage;
  if (!st?.fileSha256) return null;
  const fileSha = U.hashToHex(st.fileSha256);
  const cached = path.join(U.STICKERS_DIR, `${fileSha}.webp`);
  if (fs.existsSync(cached)) return cached;
  try {
    const buf = await U.downloadStickerBuffer(st);
    fs.writeFileSync(cached, buf);
    return cached;
  } catch (e) { return null; }
}

module.exports = {
  name: 'sa',
  aliases: ['stickeraudio'],
  public: true,
  run: async ({ sock, groupJid, senderJid, msg, reply }) => {
    cleanupTmp();
    const key = `${groupJid}:${senderJid}`;
    const pend = pending.get(key);
    if (pend && Date.now() < pend.expires) {
      pending.delete(key);

      const q = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const au = q?.audioMessage || msg.message?.audioMessage
        || q?.videoMessage || msg.message?.videoMessage;
      if (!au) return reply({ text: '🎤 Ahora responde a un AUDIO (o video) con !sa para combinarlo.' });

      let outId;
      try { outId = crypto.randomBytes(6).toString('hex'); }
      catch (e) { outId = String(Date.now()); }
      const ext = U.audioExtFromMime(au.mimetype);
      const audioPath = path.join(U.TMP_DIR, `${outId}_audio${ext}`);
      const mp4Path = path.join(U.TMP_DIR, `${outId}.mp4`);

      try {
        await U.downloadMediaTo(au, 'audio', audioPath);
        await U.createAudioStickerVideo(pend.stickerPath, audioPath, mp4Path, { maxDuration: 8 });
        if (!fs.existsSync(mp4Path)) throw new Error('No se genero el video');
        await U.sendAudioSticker(sock, groupJid, mp4Path);
      } catch (e) {
        console.error('[SA]', e);
        return reply({ text: '❌ No se pudo crear el sticker con audio. ' + String(e.message || e).slice(0, 120) });
      } finally {
        for (const f of [audioPath, mp4Path]) { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} }
      }
      return;
    }

    const stickerPath = await resolveStickerPath(msg);
    if (!stickerPath) return reply({ text: 'Uso: !sa respondiendo a un STICKER, luego !sa respondiendo a un AUDIO.' });

    pending.set(key, { stickerPath, expires: Date.now() + TTL });
    return reply({ text: '🖼️ Sticker listo. Ahora responde a un AUDIO (o video) con !sa y te devuelvo el sticker con sonido. (tienes 3 min)' });
  },
};

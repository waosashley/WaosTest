const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const U = require('../lib/utils');
const ff = require('../lib/ffmpeg');

const USO = 'Uso: responde a un audio con *!modvoice aguda 5* o *!modvoice grave 5*\n(número de tonos: 1 a 12).';

module.exports = {
  name: 'modvoice',
  aliases: ['voz'],
  run: async ({ sock, msg, groupJid, args, reply }) => {
    const mode = args[0]?.toLowerCase();
    const n = Number(args[1]);
    if (!['aguda', 'grave'].includes(mode) || !Number.isInteger(n) || n < 1 || n > 12) return reply({ text: USO });

    const q = U.getQuotedMedia(msg);
    if (!q || (q.type !== 'audio' && q.type !== 'video')) return reply({ text: USO });

    // Cambia el tono sin alterar la velocidad: reescala el sample rate y compensa con atempo
    const ratio = Math.pow(2, (mode === 'aguda' ? n : -n) / 12);
    const filter = `aresample=48000,asetrate=${(48000 * ratio).toFixed(2)},aresample=48000,atempo=${(1 / ratio).toFixed(6)}`;

    const id = crypto.randomBytes(6).toString('hex');
    const inPath = path.join(U.TMP_DIR, `${id}_in${U.audioExtFromMime(q.media.mimetype)}`);
    const outPath = path.join(U.TMP_DIR, `${id}_out.ogg`);
    try {
      await U.downloadMediaTo(q.media, q.type, inPath);
      await ff.runFFmpeg([
        '-i', inPath, '-vn', '-t', '180',
        '-af', filter,
        '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000', '-ac', '1',
        '-f', 'ogg', outPath,
      ], '-');
      await sock.sendMessage(groupJid, {
        audio: fs.readFileSync(outPath),
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
      }, { quoted: msg });
    } catch (e) {
      console.error('[MODVOICE]', e);
      return reply({ text: '❌ No se pudo modificar el audio. ' + String(e.message || e).slice(0, 120) });
    } finally {
      for (const f of [inPath, outPath]) { try { fs.unlinkSync(f); } catch (e) {} }
    }
  },
};

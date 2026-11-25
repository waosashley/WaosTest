const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { prepareWAMessageMedia, generateWAMessageFromContent, proto, downloadContentFromMessage } = require('@whiskeysockets/baileys');
const U = require('../lib/utils');

const execFileAsync = promisify(execFile);
const DURACION_MAXIMA = 10;
const TTL_SESION = 10 * 60 * 1000;
const LIMITE_WEBP = 500 * 1024;
const USO = 'Uso:\n1) Responde a un audio con *!sa* para guardarlo.\n2) Responde a una foto, vídeo o sticker con *!sa Pack | Autor* (opcional).\nSi respondes a un vídeo sin audio guardado, se usa su propio audio.';

// Sesiones de audio por grupo y usuario: "grupo:usuario" -> { ogg, seconds, ts }
const sesiones = new Map();

// Baileys rc14 no incluye audioStickerMessage en su proto: se añade el campo al codificar.
// StickerMessage.audioMessage = campo 26 (tag 210); Message.audioStickerMessage = campo 134 (tag 1074).
function parchearProto() {
  const M = proto.Message;
  if (M.__audioStickerPatched) return;

  const codificarSticker = M.StickerMessage.encode;
  M.StickerMessage.encode = function (mensaje, writer) {
    const w = codificarSticker.call(this, mensaje, writer);
    if (mensaje?.audioMessage) M.AudioMessage.encode(mensaje.audioMessage, w.uint32(210).fork()).ldelim();
    return w;
  };

  const codificarMensaje = M.encode;
  M.encode = function (mensaje, writer) {
    const w = codificarMensaje.call(this, mensaje, writer);
    if (mensaje?.audioStickerMessage) M.FutureProofMessage.encode(mensaje.audioStickerMessage, w.uint32(1074).fork()).ldelim();
    return w;
  };

  M.__audioStickerPatched = true;
}

function tmpPath(extension) {
  return path.join(U.TMP_DIR, `sa_${crypto.randomBytes(6).toString('hex')}${extension}`);
}

function borrar(archivos) {
  for (const f of archivos) { try { fs.unlinkSync(f); } catch (e) {} }
}

async function descargar(media, tipo) {
  const stream = await downloadContentFromMessage(media, tipo);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function convertirAOgg(buffer, extension) {
  const entrada = tmpPath(extension);
  const salida = tmpPath('.ogg');
  try {
    fs.writeFileSync(entrada, buffer);
    await execFileAsync('ffmpeg', [
      '-y', '-i', entrada, '-vn', '-map', '0:a:0', '-t', String(DURACION_MAXIMA),
      '-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on', '-ac', '1', '-ar', '48000',
      '-application', 'audio', '-f', 'ogg', salida,
    ]);
    const ogg = fs.readFileSync(salida);
    if (ogg.length < 200) throw new Error('Audio vacío o inválido.');
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', salida]);
    const seconds = Math.max(1, Math.min(DURACION_MAXIMA, Math.round(parseFloat(stdout) || 1)));
    return { ogg, seconds };
  } finally {
    borrar([entrada, salida]);
  }
}

async function extraerAudioDeVideo(videoBuffer) {
  try {
    return await convertirAOgg(videoBuffer, '.mp4');
  } catch (e) {
    return null;
  }
}

// Convierte imagen o vídeo a WebP de 512x512 (vídeo animado, máximo 10 s)
async function visualAWebp(buffer, esVideo) {
  const entrada = tmpPath('.bin');
  const salida = tmpPath('.webp');
  const escala = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba';
  try {
    fs.writeFileSync(entrada, buffer);
    let webp = null;
    for (const calidad of esVideo ? [60, 40, 25] : [80]) {
      const args = esVideo
        ? ['-y', '-i', entrada, '-t', String(DURACION_MAXIMA), '-vf', `fps=15,${escala}`, '-an',
          '-c:v', 'libwebp_anim', '-loop', '0', '-quality', String(calidad), '-f', 'webp', salida]
        : ['-y', '-i', entrada, '-frames:v', '1', '-vf', escala,
          '-c:v', 'libwebp', '-quality', String(calidad), '-f', 'webp', salida];
      await execFileAsync('ffmpeg', args);
      webp = fs.readFileSync(salida);
      if (webp.length <= LIMITE_WEBP) break;
    }
    return webp;
  } finally {
    borrar([entrada, salida]);
  }
}

function esWebpAnimado(buf) {
  return buf.length > 20 && buf.toString('ascii', 12, 16) === 'VP8X' && (buf[20] & 0x02) !== 0;
}

function crearExif(packname, author) {
  const json = {
    'sticker-pack-id': 'com.ashp.audiosticker',
    'sticker-pack-name': packname,
    'sticker-pack-publisher': author,
    emojis: ['🔊'],
  };
  const cabecera = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const datosJson = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([cabecera, datosJson]);
  exif.writeUIntLE(datosJson.length, 14, 4);
  return exif;
}

// Sustituye el EXIF del WebP (nombre del pack y autor) conservando la imagen
function reemplazarExifEnWebp(webpBuffer, packname, author) {
  if (webpBuffer.length < 16 || webpBuffer.toString('ascii', 0, 4) !== 'RIFF' || webpBuffer.toString('ascii', 8, 12) !== 'WEBP') {
    return webpBuffer;
  }
  const datosExif = crearExif(packname, author);
  const fragmentos = [];
  let offset = 12;
  let tieneVp8x = false;

  while (offset + 8 <= webpBuffer.length) {
    const id = webpBuffer.toString('ascii', offset, offset + 4);
    const size = webpBuffer.readUInt32LE(offset + 4);
    const final = Math.min(webpBuffer.length, offset + 8 + size + (size % 2));
    const fragmento = Buffer.from(webpBuffer.subarray(offset, final));
    if (id === 'VP8X') tieneVp8x = true;
    if (id !== 'EXIF') fragmentos.push({ id, fragmento });
    offset = final;
  }

  if (!tieneVp8x) {
    const vp8x = Buffer.alloc(18);
    vp8x.write('VP8X', 0, 4, 'ascii');
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x18;
    vp8x.writeUIntLE(511, 12, 3);
    vp8x.writeUIntLE(511, 15, 3);
    fragmentos.unshift({ id: 'VP8X', fragmento: vp8x });
  } else {
    const entradaVp8x = fragmentos.find(f => f.id === 'VP8X');
    if (entradaVp8x && entradaVp8x.fragmento.length >= 18) entradaVp8x.fragmento[8] |= 0x08;
  }

  const relleno = datosExif.length % 2 === 1 ? Buffer.from([0x00]) : Buffer.alloc(0);
  const cabeceraExif = Buffer.alloc(8);
  cabeceraExif.write('EXIF', 0, 4, 'ascii');
  cabeceraExif.writeUInt32LE(datosExif.length, 4);
  fragmentos.push({ id: 'EXIF', fragmento: Buffer.concat([cabeceraExif, datosExif, relleno]) });

  const cuerpo = Buffer.concat(fragmentos.map(f => f.fragmento));
  const cabecera = Buffer.alloc(12);
  cabecera.write('RIFF', 0, 4, 'ascii');
  cabecera.writeUInt32LE(cuerpo.length + 4, 4);
  cabecera.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([cabecera, cuerpo]);
}

async function enviarStickerConAudio(sock, groupJid, quoted, webp, ogg, seconds, animado) {
  parchearProto();
  const opts = { upload: sock.waUploadToServer };
  const st = await prepareWAMessageMedia({ sticker: webp }, opts);
  const au = await prepareWAMessageMedia({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: false }, opts);

  const stickerMessage = {
    ...st.stickerMessage,
    mimetype: 'image/webp',
    width: 512,
    height: 512,
    isAnimated: animado,
    audioMessage: {
      ...au.audioMessage,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: false,
      seconds,
    },
  };

  const waMsg = generateWAMessageFromContent(
    groupJid,
    { audioStickerMessage: { message: { stickerMessage } } },
    { userJid: sock.user.id, quoted }
  );
  await sock.relayMessage(groupJid, waMsg.message, { messageId: waMsg.key.id });
}

function limpiarNombre(texto, maximo) {
  return String(texto || '').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, maximo);
}

module.exports = {
  name: 'sa',
  aliases: ['stickeraudio', 'saudio'],
  run: async ({ sock, msg, groupJid, senderJid, args, reply }) => {
    const clave = `${groupJid}:${senderJid}`;
    const q = U.getQuotedMedia(msg);

    try {
      if (q?.type === 'audio') {
        const raw = await descargar(q.media, 'audio');
        if (!raw.length) return reply({ text: '❌ No se pudo descargar el audio citado.' });
        const { ogg, seconds } = await convertirAOgg(raw, U.audioExtFromMime(q.media.mimetype));
        sesiones.set(clave, { ogg, seconds, ts: Date.now() });
        return reply({ text: `🔊 Audio guardado (${seconds}s). Responde a una foto, vídeo o sticker con *!sa*.` });
      }

      if (!q || !['image', 'video', 'sticker'].includes(q.type)) return reply({ text: USO });

      const texto = (args || []).join(' ').trim();
      let packname = 'Sticker con audio';
      let author = msg.pushName || 'User';
      if (texto) {
        const partes = texto.split('|');
        packname = limpiarNombre(partes[0], 50) || packname;
        if (partes.length > 1) author = limpiarNombre(partes.slice(1).join('|'), 50) || author;
      }

      const visual = await descargar(q.media, q.type);
      if (!visual.length) return reply({ text: '❌ No se pudo descargar el archivo citado.' });

      let audio = null;
      const sesion = sesiones.get(clave);
      if (sesion && Date.now() - sesion.ts < TTL_SESION) {
        audio = sesion;
      } else if (q.type === 'video') {
        audio = await extraerAudioDeVideo(visual);
      }
      if (!audio) {
        return reply({ text: '❌ Primero responde a un audio con *!sa* (o usa un vídeo que tenga sonido).' });
      }

      let webp;
      let animado;
      if (q.type === 'sticker') {
        webp = visual;
        animado = esWebpAnimado(visual);
      } else {
        animado = q.type === 'video';
        webp = await visualAWebp(visual, animado);
      }

      await enviarStickerConAudio(sock, groupJid, msg, reemplazarExifEnWebp(webp, packname, author), audio.ogg, audio.seconds, animado);
      sesiones.delete(clave);
    } catch (e) {
      console.error('[SA]', e);
      return reply({ text: `❌ Error al crear el sticker con audio: ${String(e.message || e).slice(0, 120)}` });
    }
  },
};

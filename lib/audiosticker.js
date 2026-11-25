const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const baileys = require('@whiskeysockets/baileys');
const ff = require('./ffmpeg');

const execFileAsync = promisify(execFile);
const MAX_AUDIO_SECONDS = 10;
const AUDIO_MIME = 'audio/ogg; codecs=opus';

// WhatsApp no tiene sticker con audio en el esquema de rc14: se inyecta el campo audioStickerMessage (1074)
// y el audioMessage dentro de StickerMessage (210) parcheando los encoders de proto.
let patched = false;
function patchProto() {
  if (patched) return;
  const M = baileys.proto.Message;
  const encodeSticker = M.StickerMessage.encode;
  M.StickerMessage.encode = function (msg, writer) {
    const w = encodeSticker.call(this, msg, writer);
    if (msg?.audioMessage) M.AudioMessage.encode(msg.audioMessage, w.uint32((210 << 3) | 2).fork()).ldelim();
    return w;
  };
  const encodeMessage = M.encode;
  M.encode = function (msg, writer) {
    const w = encodeMessage.call(this, msg, writer);
    if (msg?.audioStickerMessage) M.FutureProofMessage.encode(msg.audioStickerMessage, w.uint32((1074 << 3) | 2).fork()).ldelim();
    return w;
  };
  patched = true;
}

function ffArgs(args) {
  if (!ff.FFMPEG) throw new Error('ffmpeg no está instalado en el servidor');
  return execFileAsync(ff.FFMPEG, ['-y', ...args]);
}

async function durationOf(file) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const d = parseFloat(stdout.trim());
    return isNaN(d) ? null : d;
  } catch (e) { return null; }
}

function crearExif(packname, author) {
  const json = { 'sticker-pack-id': 'com.waos.audiosticker', 'sticker-pack-name': packname, 'sticker-pack-publisher': author, emojis: ['🔊'] };
  const cabecera = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
  const cuerpo = Buffer.from(JSON.stringify(json), 'utf-8');
  const exif = Buffer.concat([cabecera, cuerpo]);
  exif.writeUIntLE(cuerpo.length, 14, 4);
  return exif;
}

// Inserta el chunk EXIF (nombre del pack) en un webp RIFF.
function insertarExif(webp, packname, author) {
  const datos = crearExif(packname, author);
  const fragmentos = [];
  let offset = 12;
  let tieneVp8x = false;
  while (offset + 8 <= webp.length) {
    const id = webp.toString('ascii', offset, offset + 4);
    const size = webp.readUInt32LE(offset + 4);
    const fin = Math.min(webp.length, offset + 8 + size + (size % 2));
    if (id === 'VP8X') tieneVp8x = true;
    if (id !== 'EXIF') fragmentos.push(Buffer.from(webp.subarray(offset, fin)));
    offset = fin;
  }
  if (!tieneVp8x) {
    const vp8x = Buffer.alloc(18);
    vp8x.write('VP8X', 0, 4, 'ascii');
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x08;
    vp8x.writeUIntLE(511, 12, 3);
    vp8x.writeUIntLE(511, 15, 3);
    fragmentos.unshift(vp8x);
  } else {
    const i = fragmentos.findIndex((f) => f.toString('ascii', 0, 4) === 'VP8X');
    fragmentos[i][8] |= 0x08;
  }
  const cabeceraExif = Buffer.alloc(8);
  cabeceraExif.write('EXIF', 0, 4, 'ascii');
  cabeceraExif.writeUInt32LE(datos.length, 4);
  fragmentos.push(Buffer.concat([cabeceraExif, datos, datos.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]));
  const cuerpo = Buffer.concat(fragmentos);
  const cabecera = Buffer.alloc(12);
  cabecera.write('RIFF', 0, 4, 'ascii');
  cabecera.writeUInt32LE(cuerpo.length + 4, 4);
  cabecera.write('WEBP', 8, 4, 'ascii');
  return Buffer.concat([cabecera, cuerpo]);
}

// Convierte imagen/sticker/video a webp cuadrado 512x512 (animado si la entrada tiene varios frames).
async function toStickerWebp(input, output, { packname = 'Sticker', author = 'Bot', maxSeconds = 8 } = {}) {
  const vf = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,setsar=1,fps=15';
  await ffArgs(['-i', input, '-t', String(maxSeconds), '-vf', vf, '-an', '-c:v', 'libwebp', '-loop', '0', '-q:v', '60', output]);
  const webp = insertarExif(fs.readFileSync(output), packname, author);
  fs.writeFileSync(output, webp);
  return { buffer: webp };
}

async function toOggOpus(input, output, maxSeconds = MAX_AUDIO_SECONDS) {
  await ffArgs(['-i', input, '-vn', '-map', '0:a:0', '-t', String(maxSeconds), '-c:a', 'libopus', '-b:a', '64k', '-ac', '1', '-ar', '48000', '-f', 'ogg', output]);
  if (!fs.existsSync(output) || fs.statSync(output).size < 200) throw new Error('Audio vacío o inválido.');
  return output;
}

// Envía un sticker webp con su audio ogg como audioStickerMessage (sticker con sonido nativo de WhatsApp).
async function sendStickerWithAudio(sock, jid, webp, oggPath, quoted) {
  patchProto();
  const seconds = Math.max(1, Math.min(MAX_AUDIO_SECONDS, Math.round((await durationOf(oggPath)) || 1)));
  const oggBuffer = fs.readFileSync(oggPath);
  const opts = { upload: sock.waUploadToServer };
  const st = await baileys.prepareWAMessageMedia({ sticker: webp }, opts);
  const au = await baileys.prepareWAMessageMedia({ audio: oggBuffer, mimetype: AUDIO_MIME, ptt: false }, opts);
  const stickerMessage = {
    ...st.stickerMessage,
    mimetype: 'image/webp',
    width: 512,
    height: 512,
    isAnimated: webp.includes(Buffer.from('ANIM')),
    audioMessage: { ...au.audioMessage, mimetype: AUDIO_MIME, ptt: false, seconds },
  };
  const userJid = sock.user?.id;
  const msg = baileys.generateWAMessageFromContent(jid, { audioStickerMessage: { message: { stickerMessage } } }, { userJid, quoted });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

module.exports = { toStickerWebp, toOggOpus, sendStickerWithAudio, durationOf };

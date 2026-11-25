const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const MAX_SEGUNDOS = 45 * 60;
const MAX_BYTES = 600 * 1024 * 1024;
const TIMEOUT_DESCARGA = 15 * 60 * 1000;
const DIR_TMP = path.join(__dirname, '..', 'data', 'tmp');

// Solo una descarga a la vez para no llenar el disco.
let ocupado = false;

function esUrl(texto) {
  return /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(texto.trim());
}

async function correrYtdlp(args, timeout) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', args, { timeout, maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('yt-dlp no está instalado en el servidor.');
    if (e.killed) throw new Error('La descarga tardó demasiado y se canceló.');
    const detalle = String(e.stderr || e.message || '').split('\n').filter(l => l.includes('ERROR')).pop() || 'error desconocido';
    throw new Error(detalle.replace(/^.*ERROR:\s*/, '').slice(0, 200));
  }
}

// Busca o lee la info del video sin descargarlo.
async function obtenerInfo(consulta) {
  const objetivo = esUrl(consulta) ? consulta.trim() : `ytsearch1:${consulta.trim()}`;
  const salida = await correrYtdlp(
    ['--no-warnings', '--no-playlist', '--skip-download', '--dump-single-json', objetivo],
    60 * 1000
  );
  let info = JSON.parse(salida);
  if (info._type === 'playlist') info = (info.entries || []).find(Boolean);
  if (!info) throw new Error('No encontré resultados para esa búsqueda.');
  if (info.is_live) throw new Error('No se pueden descargar transmisiones en vivo.');
  if (!info.duration) throw new Error('No pude leer la duración del contenido.');
  if (info.duration > MAX_SEGUNDOS) {
    throw new Error(`El contenido dura más de 45 minutos (${formatTiempo(info.duration)}).`);
  }
  return {
    id: info.id,
    titulo: info.title || 'Sin título',
    canal: info.channel || info.uploader || 'Desconocido',
    duracion: info.duration,
  };
}

function formatTiempo(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatPeso(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function sondear(archivo) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', archivo,
    ], { timeout: 30 * 1000 });
    const d = JSON.parse(stdout);
    const video = (d.streams || []).find(s => s.codec_type === 'video');
    if (video) return `${video.height}p`;
    const bitrate = Math.round(Number(d.format?.bit_rate || 0) / 1000);
    return bitrate ? `${bitrate} kbps` : 'desconocida';
  } catch (e) {
    return 'desconocida';
  }
}

// Descarga en una carpeta temporal y devuelve la ruta del archivo final.
// Siempre hay que llamar a limpiar(dir) después de enviarlo.
async function descargar(id, tipo) {
  fs.mkdirSync(DIR_TMP, { recursive: true });
  const dir = fs.mkdtempSync(path.join(DIR_TMP, `${tipo}-`));
  const args = [
    '--no-warnings', '--no-playlist', '--no-part',
    '--max-filesize', '600M',
    '-o', path.join(dir, '%(id)s.%(ext)s'),
  ];
  if (tipo === 'audio') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0', '-f', 'bestaudio/best');
  } else {
    args.push(
      '-f', 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]',
      '--merge-output-format', 'mp4'
    );
  }
  args.push(`https://www.youtube.com/watch?v=${id}`);

  try {
    await correrYtdlp(args, TIMEOUT_DESCARGA);
    const archivo = fs.readdirSync(dir).map(f => path.join(dir, f)).find(f => fs.statSync(f).isFile());
    if (!archivo) throw new Error('No se generó el archivo.');
    const bytes = fs.statSync(archivo).size;
    if (bytes > MAX_BYTES) throw new Error(`El archivo pesa ${formatPeso(bytes)} y el límite es 600 MB.`);
    return { dir, archivo, bytes, calidad: await sondear(archivo) };
  } catch (e) {
    limpiar(dir);
    throw e;
  }
}

function limpiar(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// Ejecuta una descarga completa: info, descarga, envío y borrado. Solo una a la vez.
async function procesar(consulta, tipo, enviar) {
  if (ocupado) throw new Error('Ya hay una descarga en curso, espera a que termine.');
  ocupado = true;
  let dir = null;
  try {
    const info = await obtenerInfo(consulta);
    const res = await descargar(info.id, tipo);
    dir = res.dir;
    const detalles = [
      `Nombre del video: ${info.titulo}`,
      `Nombre del canal: ${info.canal}`,
      `Tiempo: ${formatTiempo(info.duracion)}`,
      `Peso: ${formatPeso(res.bytes)}`,
      `Calidad: ${res.calidad}`,
    ].join('\n');
    await enviar(res.archivo, detalles);
  } finally {
    if (dir) limpiar(dir);
    ocupado = false;
  }
}

module.exports = { procesar, formatTiempo, formatPeso };

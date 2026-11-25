const media = require('../lib/media');

module.exports = {
  name: 'playaudio',
  run: async ({ sock, groupJid, msg, args, reply }) => {
    const consulta = args.join(' ').trim();
    if (!consulta) return reply({ text: 'Uso: !playaudio <nombre de la canción o link de YouTube>' });

    await reply({ text: '⏳ Descargando audio, esto puede tardar un poco...' });
    try {
      await media.procesar(consulta, 'audio', async (archivo, detalles) => {
        await sock.sendMessage(groupJid, { audio: { url: archivo }, mimetype: 'audio/mpeg' }, { quoted: msg });
        await sock.sendMessage(groupJid, { text: detalles }, { quoted: msg });
      });
    } catch (e) {
      await reply({ text: `❌ No pude descargar el audio: ${e.message}` });
    }
  },
};

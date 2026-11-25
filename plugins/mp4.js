const media = require('../lib/media');

module.exports = {
  name: 'mp4',
  run: async ({ sock, groupJid, msg, args, reply }) => {
    const consulta = args.join(' ').trim();
    if (!consulta) return reply({ text: 'Uso: !mp4 <nombre del video o link de YouTube>' });

    await reply({ text: '⏳ Descargando video, esto puede tardar un poco...' });
    try {
      await media.procesar(consulta, 'video', async (archivo, detalles) => {
        await sock.sendMessage(groupJid, { video: { url: archivo }, mimetype: 'video/mp4', caption: detalles }, { quoted: msg });
      });
    } catch (e) {
      await reply({ text: `❌ No pude descargar el video: ${e.message}` });
    }
  },
};

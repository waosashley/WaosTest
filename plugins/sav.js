const U = require('../lib/utils');
const { crearStickerDeVideo } = require('./sa');

module.exports = {
  name: 'sav',
  aliases: ['stickeraudiovideo'],
  run: async ({ sock, msg, groupJid, args, reply }) => {
    const q = U.getQuotedMedia(msg);
    if (q?.type !== 'video') return reply({ text: '❌ Responde a un vídeo con *!sav*.' });

    try {
      await crearStickerDeVideo({ sock, msg, groupJid, args, reply, q });
    } catch (e) {
      console.error('[SAV]', e);
      return reply({ text: `❌ Error al crear el sticker con audio: ${String(e.message || e).slice(0, 120)}` });
    }
  },
};

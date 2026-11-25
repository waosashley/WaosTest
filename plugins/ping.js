const U = require('../lib/utils');

module.exports = {
  name: 'ping',
  public: true,
  run: async ({ senderJid, senderPn, reply }) => {
    if (!U.isBotOwner(senderJid, senderPn)) {
      return reply({ text: '🔒 Solo la creadora del bot puede usar este comando.' });
    }
    // Tiempo que tarda WhatsApp en confirmar el envío de la respuesta.
    const start = Date.now();
    await reply({ text: '🏓 Pong!' });
    const ms = Date.now() - start;
    return reply({ text: `⚡ Velocidad de respuesta: ${ms} ms` });
  },
};

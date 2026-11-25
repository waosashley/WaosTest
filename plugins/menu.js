const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const BOT = 'ASHPPIE_BOT_V1.3';

const categories = [
  { title: '🛡️ Moderación', rows: [
    ['!mute', 'Cierra el grupo / silencia a @usuario'],
    ['!unmute', 'Abre el grupo / desilencia a @usuario'],
    ['!kick @usuario', 'Saca a alguien'],
    ['!warn @usuario', 'Advertencia (3 y se va)'],
  ] },
  { title: '🚫 Filtros', rows: [
    ['!banword @usuario palabras', 'Prohíbe palabras'],
    ['!unbanword @usuario', 'Quita prohibiciones'],
    ['!listbanwords', 'Palabras prohibidas'],
    ['!bansticker', 'Responde a un sticker para prohibirlo'],
    ['!unbansticker', 'Responde a un sticker para quitarlo'],
    ['!stickersbans', 'Stickers prohibidos'],
  ] },
  { title: '🎭 Stickers', rows: [
    ['!addcmd !comando', 'Responde a un sticker para registrarlo'],
    ['!delcmd', 'Responde a un sticker para eliminarlo'],
    ['!listcmd', 'Comandos registrados'],
    ['!modvoice aguda/grave N', 'Responde a un audio; cambia el tono (1-12) y lo envía como nota de voz'],
  ] },
  { title: '⚙️ Solo creadora', rows: [
    ['!blockcmd !comando', 'Bloquea un comando en este grupo (ej. !blockcmd !sa)'],
    ['!unblockcmd !comando', 'Desbloquea un comando en este grupo'],
    ['!blockcmdlist / !bcl', 'Lista los comandos bloqueados en este grupo'],
  ] },
  { title: '🎮 Juegos', rows: [
    ['!triviamath', 'Trivia (rank / stop)'],
    ['!ruletarusa', 'create / unirme / iniciar / stop (bang en tu turno)'],
    ['!ruletafake', 'Ruleta sin expulsar'],
    ['!conecta4', 'unirme / iniciar / stop (6x7, 2 jugadores)'],
    ['!ajedrez', 'unirme / iniciar / stop (mueve con E2 E4)'],
    ['!battleship', 'unirme / iniciar / stop (barcos por privado, disparos con D5)'],
    ['!akinator', 'el genio adivina tu personaje (responde sí/no)'],
  ] },
];

const textMenu = () =>
  `✨ *${BOT}* ✨\n📋 *Lista de comandos*\n\n` +
  categories.map(c =>
    `*${c.title}*\n` + c.rows.map(([cmd, d]) => `▸ ${cmd} — ${d}`).join('\n')
  ).join('\n\n') + '\n\n❔ !menu — esta lista';

module.exports = {
  name: 'menu',
  aliases: ['help', 'comandos'],
  run: async ({ sock, msg, groupJid, reply }) => {
    try {
      const sections = categories.map(c => ({
        title: c.title,
        rows: c.rows.map(([cmd, d]) => ({ title: cmd, description: d, id: cmd })),
      }));

      const content = {
        viewOnceMessage: { message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header: { title: `✨ ${BOT} ✨`, hasMediaAttachment: false },
            body: { text: '📋 *Lista de comandos*\n\n🛡️ Moderación · 🚫 Filtros\n🎭 Stickers · 🎮 Juegos\n\nToca el botón para verlos por categoría 👇' },
            footer: { text: 'Prefijo: !' },
            nativeFlowMessage: { buttons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify({ title: '📖 Ver comandos', sections }),
            }] },
          }),
        } },
      };

      const waMsg = generateWAMessageFromContent(groupJid, content, { quoted: msg, userJid: sock.user.id });
      await sock.relayMessage(groupJid, waMsg.message, {
        messageId: waMsg.key.id,
        additionalNodes: [{
          tag: 'biz', attrs: {},
          content: [{ tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
            content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }] }],
        }],
      });
    } catch (e) {
      await reply({ text: textMenu() });
    }
  },
};

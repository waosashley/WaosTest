const BOT_TITLE = '✨ ASHPPIE_BOT_V1.3 ✨';

// key: argumento de !menu <key>; items: [comando, descripción corta]
const CATEGORIES = [
  { key: 'moderacion', title: '🛡️ Moderación', items: [
    ['!kick', 'Saca a alguien del grupo (@usuario)'],
    ['!warn', 'Advertencia; a la tercera se va (@usuario)'],
    ['!mute', 'Cierra el grupo, o silencia a @usuario'],
    ['!unmute', 'Abre el grupo, o desilencia a @usuario'],
    ['!mutelist', 'Lista de silenciados'],
  ] },
  { key: 'filtros', title: '🚫 Filtros', items: [
    ['!banword', 'Prohíbe palabras a @usuario'],
    ['!unbanword', 'Quita las prohibiciones de @usuario'],
    ['!banwordgroup', 'Prohíbe una palabra en todo el grupo'],
    ['!unbanwordgroup', 'Quita una palabra prohibida del grupo'],
    ['!listbanwords', 'Lista las palabras prohibidas'],
  ] },
  { key: 'stickers', title: '🎭 Stickers', items: [
    ['!bansticker', 'Prohíbe un sticker (responde al sticker)'],
    ['!unbansticker', 'Quita la prohibición (responde al sticker)'],
    ['!stickersbans', 'Te envía en privado los stickers baneados'],
    ['!addcmd', 'Registra un sticker como comando: !addcmd !comando'],
    ['!delcmd', 'Elimina un sticker-comando (responde al sticker)'],
    ['!listcmd', 'Lista los sticker-comandos'],
    ['!sa', 'Sticker con sonido (audio + foto/video/sticker)'],
    ['!sav', 'Sticker con el audio de un video'],
  ] },
  { key: 'audio', title: '🎵 Audio', items: [
    ['!playaudio', 'Descarga audio: !playaudio <canción o link>'],
    ['!mp4', 'Descarga video: !mp4 <nombre o link>'],
    ['!modvoice', 'Cambia el tono de un audio: aguda/grave 1-12'],
  ] },
  { key: 'juegos', title: '🎮 Juegos', items: [
    ['!buscaminas', 'facil / medio / dificil / multi (A1 e · A1 b)'],
    ['!triviamath', 'Trivia (rank / stop) · alias !tm'],
    ['!ruletarusa', 'create / unirme / iniciar / stop (bang en tu turno)'],
    ['!ruletafake', 'Ruleta sin expulsar'],
    ['!conecta4', 'unirme / iniciar / stop (6x7, 2 jugadores)'],
    ['!ajedrez', 'unirme / iniciar / stop (mueve con E2 E4)'],
    ['!battleship', 'unirme / iniciar / stop (barcos por privado, disparos con D5)'],
    ['!akinator', 'el genio adivina tu personaje (responde sí/no)'],
  ] },
  { key: 'utilidades', title: '⚙️ Utilidades', items: [
    ['!blockcmd', 'Bloquea un comando en el grupo (solo creadora)'],
    ['!unblockcmd', 'Desbloquea un comando en el grupo'],
    ['!blockcmdlist', 'Lista los comandos bloqueados'],
    ['!programar', 'Programa apertura/cierre del grupo'],
    ['!delprogramar', 'Elimina una programación'],
    ['!cooldown', 'Quita el cooldown de buscaminas (solo creadora)'],
    ['!ping', 'Comprueba si el bot responde'],
    ['!menu', 'Este menú'],
  ] },
];

const findCategory = key => CATEGORIES.find(c => c.key === key);

const PARAMS_TEXT = `*Comandos con parámetros*

!kick @usuario — saca a alguien
!warn @usuario — advertencia (3 y se va)
!mute @usuario — silencia a alguien
!unmute @usuario — desilencia
!banword @usuario palabras — prohíbe palabras
!unbanword @usuario — quita prohibiciones
!bansticker (responder sticker) — prohíbe sticker
!unbansticker (responder sticker) — lo quita
!addcmd !comando (responder sticker) — registra sticker
!delcmd (responder sticker) — elimina comando
A1 e — excava la casilla A1 (durante una partida)
A1 b — pone o quita bandera (durante una partida)
A1e B2e C3b — varias jugadas en un mensaje
!buscaminas multi facil — multijugador por turnos (2 a 4)
!cooldown @usuario off — quita cooldown de buscaminas (solo creadora)`;

const mainBody = () =>
  '📋 *Lista de comandos*\n\n' +
  '🛡️ Moderación · 🚫 Filtros\n' +
  '🎭 Stickers · 🎵 Audio\n' +
  '🎮 Juegos · ⚙️ Utilidades\n\n' +
  'Toca el botón para verlos por categoría 👇\n' +
  'Prefijo: !';

const categoryBody = c =>
  `*${c.title}*\n\n` + c.items.map(([cmd, d]) => `*${cmd}*\n${d}`).join('\n\n');

// Baileys 7.0.0-rc14: sendMessage no soporta listMessage/interactiveMessage,
// así que se envía con relayMessage + nodo biz (single_select nativo).
async function sendMenu({ sock, groupJid, body, buttonTitle, sections }) {
  const buttonParamsJson = JSON.stringify({ title: buttonTitle, sections });
  await sock.relayMessage(groupJid, {
    interactiveMessage: {
      header: { title: BOT_TITLE, hasMediaAttachment: false },
      body: { text: body },
      nativeFlowMessage: { buttons: [{ name: 'single_select', buttonParamsJson }] },
    },
  }, {
    additionalNodes: [{
      tag: 'biz',
      attrs: {},
      content: [{
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }],
      }],
    }],
  });
}

module.exports = {
  name: 'menu',
  aliases: ['help', 'comandos'],
  public: true,
  run: async ({ args, reply, sock, groupJid }) => {
    const arg = (args[0] || '').toLowerCase();

    if (arg === 'params') return reply({ text: PARAMS_TEXT });

    const category = findCategory(arg);
    if (category) {
      const rows = category.items.map(([cmd, d]) => ({ title: cmd, description: d, id: cmd }));
      rows.push({ title: '🔙 Volver', description: 'Volver a las categorías', id: '!menu' });
      return sendMenu({
        sock, groupJid,
        body: categoryBody(category),
        buttonTitle: '📋 Elegir comando',
        sections: [{ title: category.title, rows }],
      });
    }

    const rows = CATEGORIES.map(c => ({ title: c.title, description: `${c.items.length} comandos`, id: `!menu ${c.key}` }));
    rows.push({ title: '⌨️ Con parámetros', description: 'Comandos que llevan @usuario u otros datos', id: '!menu params' });
    return sendMenu({
      sock, groupJid,
      body: mainBody(),
      buttonTitle: '📖 Ver categorías',
      sections: [{ title: 'Categorías', rows }],
    });
  },
};

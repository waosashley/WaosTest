// Cada sección: [comando principal que se ejecuta al elegirlo, descripción, subcomandos (solo en el texto)]
const SECTIONS = [
  { title: '🎲 Buscaminas y trivia', items: [
    ['!buscaminas', 'Buscaminas (facil, medio, dificil, multi)', ['facil', 'medio', 'dificil', 'multi', 'unirme', 'iniciar', 'stop']],
    ['!triviamath', 'Trivia de matemáticas', ['rank', 'stop']],
  ] },
  { title: '🎮 Juegos', items: [
    ['!ruletarusa', 'Ruleta rusa', ['unirme', 'iniciar', 'stop']],
    ['!ruletafake', 'Ruleta fake', []],
    ['!conecta4', 'Conecta 4', ['unirme', 'iniciar', 'stop']],
    ['!battleship', 'Batalla naval', ['unirme', 'iniciar', 'stop']],
    ['!ajedrez', 'Ajedrez', ['unirme', 'iniciar', 'stop']],
    ['!akinator', 'Adivina el personaje', ['stop']],
  ] },
  { title: '🎵 Audio y video', items: [
    ['!playaudio', 'Descargar audio: !playaudio <canción o link>', []],
    ['!mp4', 'Descargar video: !mp4 <nombre o link>', []],
    ['!sa', 'Sticker con sonido (responde audio + foto/video/sticker)', []],
    ['!sav', 'Sticker con el audio de un video', []],
    ['!modvoice', 'Cambia la voz de un audio: aguda/grave 1-12', []],
  ] },
  { title: '🛡️ Moderación', items: [
    ['!kick', 'Sacar del grupo: !kick @usuario', []],
    ['!warn', 'Advertencia (3 y se va): !warn @usuario', []],
    ['!mute', 'Cerrar grupo, o !mute @usuario', ['!unmute', '!mutelist']],
    ['!banword', 'Prohibir palabras: !banword @usuario palabras', ['!unbanword']],
    ['!banwordgroup', 'Prohibir palabra en el grupo: !banwordgroup <palabra>', ['!unbanwordgroup', '!listbanwords']],
  ] },
  { title: '🚫 Stickers y comandos', items: [
    ['!bansticker', 'Prohibir sticker (responder al sticker)', ['!unbansticker', '!stickersbans']],
    ['!addcmd', 'Registrar sticker como comando: !addcmd !comando', ['!delcmd', '!listcmd']],
    ['!blockcmd', 'Bloquear comando: !blockcmd !comando', ['!unblockcmd', '!blockcmdlist']],
  ] },
  { title: '⚙️ Programar y utilidades', items: [
    ['!programar', 'Programar apertura/cierre del grupo', ['!delprogramar']],
    ['!cooldown', 'Quitar cooldown (solo dueña): !cooldown @usuario off', []],
    ['!ping', 'Ver si el bot responde', []],
    ['!menu', 'Este menú', ['!menu params']],
  ] },
];

const MAIN_TITLE = '🤖 ASHP BOT · MENÚ';

function buildBody() {
  const lines = SECTIONS.map(s => `*${s.title}*\n` + s.items.map(([cmd, , subs]) => {
    const list = subs.map(x => (x.startsWith('!') ? x : `${cmd} ${x}`));
    return list.length ? `• ${cmd} → ${list.join(' · ')}` : `• ${cmd}`;
  }).join('\n'));
  return 'Toca *Ver comandos* y elige uno.\nLos subcomandos se escriben después del comando, ej. `!buscaminas facil`.\n\n' + lines.join('\n\n');
}

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
!cooldown @usuario off — quita cooldown de buscaminas (solo dueña)`;

module.exports = {
  name: 'menu',
  aliases: ['help', 'comandos'],
  public: true,
  run: async ({ args, reply, sock, groupJid }) => {
    if ((args[0] || '').toLowerCase() === 'params') return reply({ text: PARAMS_TEXT });

    // listMessage legado no se muestra en cuentas normales; se usa interactiveMessage (single_select nativo).
    // Baileys 7.0.0-rc14 sendMessage no lo soporta, así que se envía con relayMessage + nodo biz.
    const buttonParamsJson = JSON.stringify({
      title: '📋 Ver comandos',
      sections: SECTIONS.map(s => ({
        title: s.title,
        rows: s.items.map(([cmd, desc]) => ({ header: s.title, title: cmd, description: desc, id: cmd })),
      })),
    });
    await sock.relayMessage(groupJid, {
      interactiveMessage: {
        header: { title: MAIN_TITLE, hasMediaAttachment: false },
        body: { text: buildBody() },
        footer: { text: 'Comandos con @usuario: !menu params' },
        nativeFlowMessage: {
          buttons: [{ name: 'single_select', buttonParamsJson }],
        },
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
  },
};
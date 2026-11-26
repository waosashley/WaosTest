// Cada fila: [comando que se ejecuta al elegirla, descripción]
const SECTIONS = [
  { title: '🎲 Buscaminas y trivia', rows: [
    ['!buscaminas facil', 'Tablero 8x8, 10 minas'],
    ['!buscaminas medio', 'Tablero 12x12, 24 minas'],
    ['!buscaminas dificil', 'Tablero 16x16, 48 minas'],
    ['!buscaminas multi', 'Multijugador por turnos (2 a 4)'],
    ['!buscaminas unirme', 'Unirte a la partida multijugador'],
    ['!buscaminas iniciar', 'Iniciar partida multijugador (creador)'],
    ['!buscaminas stop', 'Cancelar buscaminas'],
    ['!triviamath', 'Trivia de matemáticas'],
    ['!triviamath rank', 'Ranking de trivia'],
    ['!triviamath stop', 'Cancelar trivia'],
  ] },
  { title: '🎮 Ruleta y mesas', rows: [
    ['!ruletarusa', 'Crear ruleta rusa'],
    ['!ruletarusa unirme', 'Unirte a la ruleta rusa'],
    ['!ruletarusa iniciar', 'Iniciar ruleta rusa'],
    ['!ruletarusa stop', 'Cancelar ruleta rusa'],
    ['!ruletafake', 'Ruleta fake'],
    ['!conecta4', 'Crear Conecta 4'],
    ['!conecta4 unirme', 'Unirte a Conecta 4'],
    ['!conecta4 iniciar', 'Iniciar Conecta 4'],
    ['!conecta4 stop', 'Cancelar Conecta 4'],
    ['!battleship', 'Crear batalla naval'],
  ] },
  { title: '♟️ Otros juegos', rows: [
    ['!ajedrez', 'Crear partida de ajedrez'],
    ['!ajedrez unirme', 'Unirte al ajedrez'],
    ['!ajedrez iniciar', 'Iniciar ajedrez'],
    ['!ajedrez stop', 'Cancelar ajedrez'],
    ['!battleship unirme', 'Unirte a batalla naval'],
    ['!battleship iniciar', 'Iniciar batalla naval'],
    ['!battleship stop', 'Cancelar batalla naval'],
    ['!akinator', 'Adivina el personaje'],
    ['!akinator stop', 'Cancelar akinator'],
  ] },
  { title: '🎵 Audio y video', rows: [
    ['!playaudio', 'Descargar audio: !playaudio <canción o link>'],
    ['!mp4', 'Descargar video: !mp4 <nombre o link>'],
    ['!sa', 'Sticker con sonido (responde audio + foto/video/sticker)'],
    ['!sav', 'Sticker con el audio de un video'],
    ['!modvoice', 'Cambia la voz de un audio: aguda/grave 1-12'],
  ] },
  { title: '🛡️ Moderación', rows: [
    ['!kick', 'Sacar del grupo: !kick @usuario'],
    ['!warn', 'Advertencia (3 y se va): !warn @usuario'],
    ['!mute', 'Cerrar grupo, o !mute @usuario'],
    ['!unmute', 'Abrir grupo, o !unmute @usuario'],
    ['!mutelist', 'Usuarios silenciados'],
    ['!banword', 'Prohibir palabras: !banword @usuario palabras'],
    ['!unbanword', 'Quitar prohibiciones: !unbanword @usuario'],
    ['!banwordgroup', 'Prohibir palabra en el grupo: !banwordgroup <palabra>'],
    ['!unbanwordgroup', 'Quitar palabra del grupo: !unbanwordgroup <palabra>'],
    ['!listbanwords', 'Palabras prohibidas'],
  ] },
  { title: '🚫 Stickers y comandos', rows: [
    ['!bansticker', 'Prohibir sticker (responder al sticker)'],
    ['!unbansticker', 'Quitar ban de sticker (responder)'],
    ['!stickersbans', 'Stickers baneados (se envían en privado)'],
    ['!addcmd', 'Registrar sticker como comando: !addcmd !comando'],
    ['!delcmd', 'Eliminar comando de sticker (responder)'],
    ['!listcmd', 'Comandos de stickers'],
    ['!blockcmd', 'Bloquear comando: !blockcmd !comando'],
    ['!unblockcmd', 'Desbloquear comando: !unblockcmd !comando'],
    ['!blockcmdlist', 'Comandos bloqueados'],
  ] },
  { title: '⚙️ Programar y utilidades', rows: [
    ['!programar', 'Programar apertura/cierre del grupo'],
    ['!delprogramar', 'Borrar programación: !delprogramar <número>'],
    ['!cooldown', 'Quitar cooldown (solo dueña): !cooldown @usuario off'],
    ['!ping', 'Ver si el bot responde'],
    ['!menu params', 'Comandos con @usuario (texto)'],
    ['!menu', 'Este menú'],
  ] },
];

const MAIN_TITLE = '🤖 ASHP BOT · MENÚ';

module.exports = {
  name: 'menu',
  aliases: ['help', 'comandos'],
  public: true,
  run: async ({ args, reply }) => {
    if ((args[0] || '').toLowerCase() === 'params') return reply({ text: PARAMS_TEXT });

    return reply({
      listMessage: {
        title: MAIN_TITLE,
        description: 'Toca *Ver comandos* y elige uno: se ejecuta al seleccionarlo.',
        buttonText: '📋 Ver comandos',
        footerText: 'Comandos con @usuario: !menu params',
        listType: 1,
        sections: SECTIONS.map(s => ({
          title: s.title,
          rows: s.rows.map(([cmd, desc]) => ({ title: cmd, description: desc, rowId: cmd })),
        })),
      },
    });
  },
};
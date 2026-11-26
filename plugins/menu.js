const Polls = require('../lib/polls');

const CATEGORIES = {
  buscaminas: {
    title: '🎲 Buscaminas y trivia',
    options: [
      { label: '🟢 Buscaminas fácil', cmd: '!buscaminas facil' },
      { label: '🟡 Buscaminas medio', cmd: '!buscaminas medio' },
      { label: '🔴 Buscaminas difícil', cmd: '!buscaminas dificil' },
      { label: '⛔ Cancelar buscaminas', cmd: '!buscaminas stop' },
      { label: '🧮 Trivia matemática', cmd: '!triviamath' },
      { label: '🏆 Ranking de trivia', cmd: '!triviamath rank' },
      { label: '🛑 Cancelar trivia', cmd: '!triviamath stop' },
    ],
  },
  ruleta: {
    title: '🎮 Ruleta y Conecta 4',
    options: [
      { label: '🔫 Ruleta rusa: crear', cmd: '!ruletarusa create' },
      { label: '✅ Ruleta rusa: unirme', cmd: '!ruletarusa unirme' },
      { label: '▶️ Ruleta rusa: iniciar', cmd: '!ruletarusa iniciar' },
      { label: '🛑 Ruleta rusa: cancelar', cmd: '!ruletarusa stop' },
      { label: '🎭 Ruleta fake', cmd: '!ruletafake' },
      { label: '🔴 Conecta 4: crear', cmd: '!conecta4' },
      { label: '✅ Conecta 4: unirme', cmd: '!conecta4 unirme' },
      { label: '▶️ Conecta 4: iniciar', cmd: '!conecta4 iniciar' },
      { label: '🛑 Conecta 4: cancelar', cmd: '!conecta4 stop' },
    ],
  },
  moderacion: {
    title: '🛡️ Moderación y stickers',
    options: [
      { label: '🔒 Cerrar grupo', cmd: '!mute' },
      { label: '🔓 Abrir grupo', cmd: '!unmute' },
      { label: '🚫 Palabras prohibidas', cmd: '!listbanwords' },
      { label: '🚫 Stickers baneados', cmd: '!stickersbans' },
      { label: '🧷 Comandos de stickers', cmd: '!listcmd' },
    ],
  },
};

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
!cooldown @usuario off — quita cooldown de buscaminas (solo dueña)`;

const MAIN_TITLE = '🤖 ASHP BOT · MENÚ';

module.exports = {
  name: 'menu',
  aliases: ['help', 'comandos'],
  public: true,
  run: async ({ sock, groupJid, msg, args, reply }) => {
    const key = (args[0] || '').toLowerCase();

    if (key === 'params') return reply({ text: PARAMS_TEXT });

    const category = CATEGORIES[key];
    if (category) {
      return Polls.sendPoll(sock, groupJid, { title: category.title, options: category.options, quoted: msg });
    }

    const options = [
      ...Object.entries(CATEGORIES).map(([id, c]) => ({ label: c.title, cmd: `!menu ${id}` })),
      { label: '📋 Comandos con @usuario', cmd: '!menu params' },
    ];
    return Polls.sendPoll(sock, groupJid, { title: MAIN_TITLE, options, quoted: msg });
  },
};
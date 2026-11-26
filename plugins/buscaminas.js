const U = require('../lib/utils');
const B = require('../lib/buscaminas');

const MULTI_WORDS = ['multi', 'multijugador', 'multiplayer'];
const mentionOf = jid => `@${U.userNum(jid)}`;

module.exports = {
  name: 'buscaminas',
  public: true,
  run: async ({ sock, groupJid, senderJid, isAdmin, args, reply }) => {
    const sub = args[0]?.toLowerCase();
    const g = U.activeGames.get(groupJid);
    const lobbyMulti = g?.type === 'buscaminas' && g.multi && !g.started;

    if (sub === 'stop' || sub === 'cancelar') {
      if (!g || g.type !== 'buscaminas') return reply({ text: 'No hay buscaminas activo.' });
      if (U.userNum(g.player) !== U.userNum(senderJid) && !isAdmin) {
        return reply({ text: 'Solo quien jugó o un admin lo detiene.' });
      }
      await B.stopGame(sock, groupJid);
      return reply({ text: '🛑 Buscaminas detenido.' });
    }
    if (sub === 'unirme' || sub === 'join') {
      if (!lobbyMulti) return reply({ text: 'No hay buscaminas multijugador abierto.' });
      const err = B.joinGame(g, senderJid);
      if (err) return reply({ text: err });
      return reply({
        text: `✅ ${mentionOf(senderJid)} se unió (${g.players.length}/${B.MAX_PLAYERS}).\n\nEl creador inicia con *!buscaminas iniciar*.`,
        mentions: [senderJid],
      });
    }
    if (sub === 'iniciar' || sub === 'start') {
      if (!lobbyMulti) return reply({ text: 'No hay buscaminas multijugador por iniciar.' });
      if (U.userNum(g.player) !== U.userNum(senderJid)) return reply({ text: 'Solo el creador inicia la partida.' });
      if (g.players.length < 2) return reply({ text: 'Se necesitan al menos 2 jugadores.' });
      return B.startGame(sock, groupJid, g);
    }

    const multi = args.some(a => MULTI_WORDS.includes(U.normalizeText(a)));
    const mode = args.map(a => B.parseMode(a)).find(Boolean) || (multi ? 'facil' : null);
    if (!mode) {
      return reply({
        text: 'Uso: *!buscaminas facil|medio|dificil* para jugar solo.\n' +
          'Multijugador: *!buscaminas multi [facil|medio|dificil]*.\n' +
          'Juega con *A1 e* (excavar) o *A1 b* (bandera). Varias a la vez: *A1 e B2 e C3 b*.',
      });
    }

    if (multi) {
      const r = await B.createGame(sock, groupJid, senderJid, mode, true);
      if (!r.ok) return reply({ text: r.reason });
      return reply({
        text: `🧨 *Buscaminas multijugador ${B.MODES[mode].label}* creado por ${mentionOf(senderJid)}.\n\n` +
          `Otros jugadores: *!buscaminas unirme* (2 a ${B.MAX_PLAYERS} jugadores).\n` +
          `El creador inicia con *!buscaminas iniciar*.`,
        mentions: [senderJid],
      });
    }

    const left = B.cooldownLeft(senderJid);
    if (left > 0) {
      const min = Math.ceil(left / 60000);
      return reply({ text: `⏳ Perdiste hace poco. Espera ${min} min para volver a jugar.`, mentions: [senderJid] });
    }

    const r = await B.createGame(sock, groupJid, senderJid, mode);
    if (!r.ok) return reply({ text: r.reason });
  },
};


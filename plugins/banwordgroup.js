const U = require('../lib/utils');

module.exports = {
  name: 'banwordgroup',
  aliases: ['bwg'],
  run: async ({ sock, groupJid, senderJid, senderPn, args, reply }) => {
    if ((args[0] || '').toLowerCase() === 'list') {
      const words = U.groupBannedWords[groupJid] || [];
      const text = words.length
        ? `*Palabras baneadas en este grupo*\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        : 'No hay palabras baneadas en este grupo.';
      const to = senderPn || senderJid;
      try {
        await sock.sendMessage(to, { text });
        return reply({ text: '📩 Te envié la lista por privado.' });
      } catch (e) {
        console.error('[BWG list]', e);
        return reply({ text: '❌ No pude enviarte la lista por privado. Escríbeme primero y vuelve a intentarlo.' });
      }
    }

    const palabra = args.join(' ').trim();
    if (!palabra) return reply({ text: 'Uso: !banwordgroup <palabra>  (o !bwg <palabra>)' });

    const list = U.groupBannedWords[groupJid] || [];
    const nueva = U.normalizeText(palabra);
    if (list.some(w => U.normalizeText(w) === nueva)) {
      return reply({ text: `ℹ️ "${palabra}" ya está baneada en este grupo.` });
    }

    U.groupBannedWords[groupJid] = [...list, palabra];
    U.saveJSON('groupBannedWords.json', U.groupBannedWords);
    return reply({ text: `✅ Palabra baneada en este grupo: "${palabra}"` });
  },
};

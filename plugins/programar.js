const S = require('../lib/scheduler');

const USO = 'Uso: !programar apertura|cierre HH:mm [count-tag]|[count]|[tag] [mensaje]\n'
  + 'Ej: !programar cierre 21:00 [count-tag] 🔒 Grupo cerrado, buenas noches\n'
  + 'Otros: !programar lista | !delprogramar <número de la lista>';

module.exports = {
  name: 'programar',
  run: async ({ groupJid, args, reply }) => {
    const tokens = args.filter(Boolean);
    const sub = (tokens[0] || '').toLowerCase();

    if (!sub) return reply({ text: USO });

    if (sub === 'lista') {
      const list = S.listFor(groupJid);
      if (!list.length) return reply({ text: 'ℹ️ No hay acciones programadas en este grupo.' });
      const lines = list.map((s, i) => {
        const op = s.countdown && s.tag ? '[count-tag]' : s.countdown ? '[count]' : s.tag ? '[tag]' : '';
        return `${i + 1}. ${s.action} ${s.time}${op ? ' ' + op : ''} (diario, hora Colombia)`;
      });
      return reply({ text: `📅 Programadas:\n${lines.join('\n')}` });
    }

    if (sub !== 'apertura' && sub !== 'cierre') return reply({ text: USO });

    const time = S.parseTime(tokens[1]);
    if (!time) return reply({ text: '❌ Hora inválida. Usa HH:mm, por ejemplo 21:00.\n' + USO });

    const OPCIONES = { 'count-tag': { countdown: true, tag: true }, count: { countdown: true, tag: false }, tag: { countdown: false, tag: true } };
    const opcion = OPCIONES[(tokens[2] || '').replace(/^\[|\]$/g, '').toLowerCase()];
    const hasOpcion = /^\[.*\]$/.test(tokens[2] || '');
    if (hasOpcion && !opcion) return reply({ text: '❌ Opción inválida. Usa [count-tag], [count] o [tag].\n' + USO });
    const { countdown = false, tag = false } = opcion || {};
    const message = tokens.slice(hasOpcion ? 3 : 2).join(' ').trim() || null;

    const entry = S.add({ groupJid, action: sub, time: time.time, countdown, tag, message });
    const extra = [countdown && 'cuenta regresiva', tag && 'mención a todos'].filter(Boolean);
    const hoyPasado = entry.lastRun !== null;
    return reply({
      text: `✅ Programación #${entry.id}: ${sub} a las ${time.time} (hora Colombia), todos los días`
        + (extra.length ? ` con ${extra.join(' y ')}` : '')
        + (hoyPasado ? '. Como hoy ya pasó esa hora, se ejecutará mañana.' : '.'),
    });
  },
};

const S = require('../lib/scheduler');

const USO = 'Uso: !programar apertura|cierre HH:mm [contar] [tag] [mensaje]\n'
  + 'Ej: !programar cierre 21:00 contar tag 🔒 Grupo cerrado, buenas noches\n'
  + 'Otros: !programar lista | !programar cancelar <id>';

module.exports = {
  name: 'programar',
  run: async ({ groupJid, args, reply }) => {
    const tokens = args.filter(Boolean);
    const sub = (tokens[0] || '').toLowerCase();

    if (!sub) return reply({ text: USO });

    if (sub === 'lista') {
      const list = S.listFor(groupJid);
      if (!list.length) return reply({ text: 'ℹ️ No hay acciones programadas en este grupo.' });
      const lines = list.map(s =>
        `#${s.id} ${s.action} ${s.time}${s.countdown ? ' contar' : ''}${s.tag ? ' tag' : ''} (diario, hora Colombia)`
      );
      return reply({ text: `📅 Programadas:\n${lines.join('\n')}` });
    }

    if (sub === 'cancelar') {
      const id = Number(tokens[1]);
      if (!Number.isInteger(id) || !S.remove(id, groupJid)) {
        return reply({ text: '❌ No encontré esa programación en este grupo. Revisa con !programar lista' });
      }
      return reply({ text: `✅ Programación #${id} cancelada.` });
    }

    if (sub !== 'apertura' && sub !== 'cierre') return reply({ text: USO });

    const time = S.parseTime(tokens[1]);
    if (!time) return reply({ text: '❌ Hora inválida. Usa HH:mm, por ejemplo 21:00.\n' + USO });

    let rest = tokens.slice(2);
    let countdown = false;
    let tag = false;
    while (rest.length) {
      const flag = rest[0].toLowerCase();
      if (flag === 'contar') countdown = true;
      else if (flag === 'tag') tag = true;
      else break;
      rest = rest.slice(1);
    }
    const message = rest.join(' ').trim() || null;

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

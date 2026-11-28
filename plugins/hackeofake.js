const bar = pct => {
  const filled = Math.round(pct / 10);
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${pct}%`;
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Datos ficticios: nombres inventados y rangos reservados para documentación (RFC 2606 / RFC 5737).
const FAKE_DATA = [
  '👤 Nombre ficticio: Fulano de Tal Ejemplo',
  '📧 Correo ficticio: fulano@example.com',
  '📍 Ubicación ficticia: Ciudad Inventada, MX',
  '🌐 IP de ejemplo: 192.0.2.42',
];

module.exports = {
  name: 'hackeofake',
  aliases: ['doxxear'],
  public: true,
  run: async ({ sock, groupJid, senderJid }) => {
    const who = senderJid.split('@')[0];
    const mentions = [senderJid];

    const sent = await sock.sendMessage(groupJid, {
      text: `🕵️ Iniciando "análisis" de @${who}...\n${bar(0)}`,
      mentions,
    });

    const steps = [25, 50, 75, 100];
    for (const pct of steps) {
      await sleep(1500);
      await sock.sendMessage(groupJid, {
        text: `🕵️ Analizando @${who}...\n${bar(pct)}`,
        mentions,
        edit: sent.key,
      });
    }

    await sleep(1000);
    await sock.sendMessage(groupJid, {
      text: `✅ Doxxeo listo. La información de @${who} es:\n\n${FAKE_DATA.join('\n')}\n\n😂 ¡Era broma! Todo es ficticio.`,
      mentions,
      edit: sent.key,
    });
  },
};

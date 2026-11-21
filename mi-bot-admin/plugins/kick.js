module.exports = {
  name: 'kick',
  aliases: ['echar', 'sacar'],
  run: async ({ sock, groupJid, senderJid, getTarget }) => {
    const target = getTarget();
    if (!target || target === senderJid) return;
    try {
      const result = await sock.groupParticipantsUpdate(groupJid, [target], 'remove');
      console.log('[KICK] OK:', JSON.stringify(result));
    } catch (e) { console.error('[KICK]', e.message); }
  },
};

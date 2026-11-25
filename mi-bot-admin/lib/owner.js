const PN_JID = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/;
const LID_JID = /^\d+(?::\d+)?@lid$/;

// Solo acepta JIDs de teléfono cuyo número coincide con OWNER_NUMBER.
// Nunca se compara un LID con el número.
function isOwner(jids) {
  const owner = (process.env.OWNER_NUMBER || '').replace(/^\+/, '');
  if (!/^\d+$/.test(owner) || !Array.isArray(jids)) return false;
  return jids.some(jid => {
    if (typeof jid !== 'string') return false;
    const match = PN_JID.exec(jid);
    return match !== null && match[1] === owner;
  });
}

function getSenderJids(msg) {
  const key = msg?.key || {};
  const ids = [key.participant, key.participantAlt];
  if (!key.remoteJid?.endsWith('@g.us')) ids.push(key.remoteJid);
  return [...new Set(ids.filter(id => typeof id === 'string' && id))];
}

// Añade el JID de teléfono que Baileys asocia al LID del remitente.
// Falla cerrado: sin API, sin mapeo, error o resultado inválido no se añade nada.
async function resolveSenderJids(sock, groupJid, msg) {
  const base = getSenderJids(msg);
  const resolved = [...base];
  const mapping = sock?.signalRepository?.lidMapping;
  if (typeof mapping?.getPNForLID !== 'function') return resolved;

  for (const jid of base) {
    if (!LID_JID.test(jid)) continue;
    try {
      const pn = await mapping.getPNForLID(jid);
      if (typeof pn === 'string' && PN_JID.test(pn) && !resolved.includes(pn)) {
        resolved.push(pn);
      }
    } catch (e) {}
  }
  return resolved;
}

module.exports = { isOwner, getSenderJids, resolveSenderJids };

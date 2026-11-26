const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { decryptPollVote, jidNormalizedUser } = require('@whiskeysockets/baileys');

// Baileys no entrega votos descifrados (el bloque en process-message.js está comentado),
// así que guardamos el secreto de cada encuesta y descifra los votos nosotros.
const STORE_FILE = process.env.POLLS_FILE || path.join(__dirname, '..', 'data', 'polls.json');
const TTL_MS = 24 * 60 * 60 * 1000;

let store = load();

function load() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch (e) { return {}; }
}

function save() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store));
}

function prune() {
  const now = Date.now();
  for (const id of Object.keys(store)) {
    if (now - store[id].createdAt > TTL_MS) delete store[id];
  }
}

const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex');

// options: [{ label, cmd }]. La etiqueta es lo que ve el usuario; cmd es lo que se ejecuta al votarla.
async function sendPoll(sock, groupJid, { title, options, quoted }) {
  const sent = await sock.sendMessage(groupJid, {
    poll: { name: title, values: options.map(o => o.label), selectableCount: 1 },
  }, quoted ? { quoted } : {});

  const secret = sent?.message?.messageContextInfo?.messageSecret;
  if (!secret) throw new Error('La encuesta no devolvió messageSecret');

  const creators = [...new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(jidNormalizedUser))];
  prune();
  store[sent.key.id] = {
    createdAt: Date.now(),
    creators,
    secret: Buffer.from(secret).toString('base64'),
    commands: Object.fromEntries(options.map(o => [hashOf(o.label), o.cmd])),
  };
  save();
  return sent;
}

// Devuelve el comando elegido en un mensaje de voto, o null si no aplica.
function getVotedCommand(msg) {
  const update = msg?.message?.pollUpdateMessage;
  const creationId = update?.pollCreationMessageKey?.id;
  const entry = creationId && store[creationId];
  if (!entry) return null;

  const voters = [...new Set([msg.key?.participant, msg.key?.participantAlt]
    .filter(Boolean).map(jidNormalizedUser))];

  for (const voterJid of voters) {
    for (const pollCreatorJid of entry.creators) {
      let vote;
      try {
        vote = decryptPollVote(update.vote, {
          pollEncKey: Buffer.from(entry.secret, 'base64'),
          pollCreatorJid,
          pollMsgId: creationId,
          voterJid,
        });
      } catch (e) { continue; }
      const selected = (vote.selectedOptions || []).map(b => Buffer.from(b).toString('hex'));
      const cmd = selected.map(h => entry.commands[h]).find(Boolean);
      return cmd || null;
    }
  }
  return null;
}

module.exports = { sendPoll, getVotedCommand, hashOf };

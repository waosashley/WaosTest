const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { proto, aesEncryptGCM, hmacSign } = require('@whiskeysockets/baileys');
const os = require('os');
const path = require('path');
process.env.POLLS_FILE = path.join(os.tmpdir(), `polls-test-${process.pid}.json`);
const Polls = require('../lib/polls');

const GROUP = '120363000000000000@g.us';
const BOT = '13099548582:9@s.whatsapp.net';
const VOTER = '5215500000001@s.whatsapp.net';

// Cifra un voto igual que WhatsApp (espejo de decryptPollVote de Baileys).
function encryptVote({ optionHash, secret, creator, voter, pollId }) {
  const sign = Buffer.concat([
    Buffer.from(pollId), Buffer.from(creator), Buffer.from(voter), Buffer.from('Poll Vote'), new Uint8Array([1]),
  ]);
  const key0 = hmacSign(secret, new Uint8Array(32), 'sha256');
  const encKey = hmacSign(sign, key0, 'sha256');
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(`${pollId}\u0000${voter}`);
  const plain = proto.Message.PollVoteMessage.encode({ selectedOptions: [Buffer.from(optionHash, 'hex')] }).finish();
  return { encPayload: aesEncryptGCM(plain, encKey, iv, aad), encIv: iv };
}

test('descifra el voto y devuelve el comando de la opción elegida', async () => {
  const secret = crypto.randomBytes(32);
  let pollId = null;
  const sock = {
    user: { id: BOT },
    sendMessage: async (jid, content) => {
      assert.deepStrictEqual(content.poll.values, ['🟢 Buscaminas fácil', '⛔ Cancelar buscaminas']);
      pollId = 'POLL-1';
      return { key: { id: pollId }, message: { messageContextInfo: { messageSecret: secret } } };
    },
  };
  await Polls.sendPoll(sock, GROUP, {
    title: 'test',
    options: [
      { label: '🟢 Buscaminas fácil', cmd: '!buscaminas facil' },
      { label: '⛔ Cancelar buscaminas', cmd: '!buscaminas stop' },
    ],
  });

  const creator = '13099548582@s.whatsapp.net';
  const vote = encryptVote({
    optionHash: Polls.hashOf('⛔ Cancelar buscaminas'), secret, creator, voter: VOTER, pollId,
  });
  const msg = {
    key: { remoteJid: GROUP, participant: VOTER, fromMe: false },
    message: { pollUpdateMessage: { pollCreationMessageKey: { id: pollId }, vote } },
  };
  assert.strictEqual(Polls.getVotedCommand(msg), '!buscaminas stop');

  const otherVoter = { ...msg, key: { ...msg.key, participant: '5215500000002@s.whatsapp.net' } };
  assert.strictEqual(Polls.getVotedCommand(otherVoter), null);
});

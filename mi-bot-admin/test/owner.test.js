const test = require('node:test');
const assert = require('node:assert');
const { isOwner, resolveSenderJids } = require('../lib/owner');

const OWNER = '15550001111';
const LID = '99887766554433@lid';
const msg = { key: { remoteJid: '1234@g.us', participant: LID } };
const sockWith = (fn) => ({ signalRepository: { lidMapping: { getPNForLID: fn } } });

process.env.OWNER_NUMBER = OWNER;

test('LID mapeado al propietario es aceptado', async () => {
  const sock = sockWith(async (l) => (l === LID ? `${OWNER}:0@s.whatsapp.net` : null));
  assert.strictEqual(isOwner(await resolveSenderJids(sock, '1234@g.us', msg)), true);
});

test('LID sin mapeo es rechazado', async () => {
  const sock = sockWith(async () => null);
  assert.strictEqual(isOwner(await resolveSenderJids(sock, '1234@g.us', msg)), false);
});

test('sin API de mapeo es rechazado', async () => {
  assert.strictEqual(isOwner(await resolveSenderJids({}, '1234@g.us', msg)), false);
});

test('error en el mapeo falla cerrado', async () => {
  const sock = sockWith(async () => { throw new Error('boom'); });
  assert.strictEqual(isOwner(await resolveSenderJids(sock, '1234@g.us', msg)), false);
});

test('mapeo a otro número es rechazado', async () => {
  const sock = sockWith(async () => '15559998888@s.whatsapp.net');
  assert.strictEqual(isOwner(await resolveSenderJids(sock, '1234@g.us', msg)), false);
});

test('resultado que no es JID de teléfono es ignorado', async () => {
  const sock = sockWith(async () => `${OWNER}@lid`);
  assert.strictEqual(isOwner(await resolveSenderJids(sock, '1234@g.us', msg)), false);
});

test('los dígitos del LID no se tratan como teléfono', () => {
  process.env.OWNER_NUMBER = '99887766554433';
  assert.strictEqual(isOwner([LID]), false);
  process.env.OWNER_NUMBER = OWNER;
});

test('JID de teléfono directo del propietario sigue funcionando', () => {
  assert.strictEqual(isOwner([`${OWNER}@s.whatsapp.net`]), true);
});

test('sin OWNER_NUMBER nadie es propietario', () => {
  delete process.env.OWNER_NUMBER;
  assert.strictEqual(isOwner([`${OWNER}@s.whatsapp.net`]), false);
  process.env.OWNER_NUMBER = OWNER;
});

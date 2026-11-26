const test = require('node:test');
const assert = require('node:assert');
const U = require('../lib/utils');
const B = require('../lib/buscaminas');

const GROUP = '120363000000000000@g.us';
const PLAYER = '5215500000001@s.whatsapp.net';

const fakeSock = () => {
  const sent = [];
  return { sent, sendMessage: async (jid, content) => { sent.push(content); return {}; } };
};

test('parsea casilla y acción, y acepta el modo con acento', () => {
  assert.deepStrictEqual(B.parseMove('A1 b'), { col: 0, row: 0, action: 'b' });
  assert.deepStrictEqual(B.parseMove('h10e'), { col: 7, row: 9, action: 'e' });
  assert.strictEqual(B.parseMove('A1 x'), null);
  assert.strictEqual(B.parseMode('fácil'), 'facil');
  assert.strictEqual(B.parseMode('dificil'), 'dificil');
  assert.strictEqual(B.parseMode('imposible'), null);
});

test('la primera excavación nunca tiene mina ni en sus vecinos', () => {
  const game = { size: 8, mines: 10, grid: Array.from({ length: 64 }, () => ({ mine: false, adj: 0 })) };
  B.placeMines(game, 0);
  assert.strictEqual(game.grid.filter(c => c.mine).length, 10);
  for (const i of [0, ...B.neighbors(8, 0)]) assert.strictEqual(game.grid[i].mine, false);
});

test('abrir una casilla sin minas alrededor abre la zona en cascada', () => {
  const game = { size: 3, mines: 1, grid: Array.from({ length: 9 }, () => ({ mine: false, adj: 0, revealed: false, flagged: false })) };
  game.grid[8].mine = true;
  game.grid.forEach((c, i) => { c.adj = B.neighbors(3, i).filter(n => game.grid[n].mine).length; });
  B.reveal(game, 0);
  assert.strictEqual(B.isWon(game), true);
});

test('perder una partida activa el cooldown y !cooldown lo quita', async () => {
  const groupJid = GROUP + '-lose';
  const sock = fakeSock();
  U.activeGames.delete(groupJid);
  await B.createGame(sock, groupJid, PLAYER, 'facil');
  const game = U.activeGames.get(groupJid);
  B.placeMines(game, 0);
  const mineIdx = game.grid.findIndex(c => c.mine);
  const msg = { key: { remoteJid: groupJid, participant: PLAYER } };
  const name = String.fromCharCode(65 + (mineIdx % 8)) + (Math.floor(mineIdx / 8) + 1);

  assert.strictEqual(await B.handleMove(sock, groupJid, PLAYER, msg, `${name} e`), true);
  assert.strictEqual(U.activeGames.has(groupJid), false);
  assert.ok(B.cooldownLeft(PLAYER) > 59 * 60 * 1000);

  B.clearCooldown(PLAYER);
  assert.strictEqual(B.cooldownLeft(PLAYER), 0);
});

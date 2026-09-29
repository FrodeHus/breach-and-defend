// tests/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {HostSession, GuestSession, newMatchId, validMatchId} from '../dist/session.mjs';
import {createStore} from '../dist/storage.mjs';
import {fakeNet} from './helpers/fake-net.mjs';
import {fakeTime, memoryBackend} from './helpers/versus.mjs';
import {choose, perform} from './helpers/policy.mjs';

const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const retry = () => new Promise(r => setImmediate(r));
const store = () => createStore(memoryBackend());
const settle = async ({guest}) => { await flush(); await guest.settled(); await flush(); };

async function pair({hostStore = store(), guestStore = store(), net = fakeNet()} = {}) {
  const host = await HostSession.create({net, store: hostStore, hostFaction: 'blue', clock: fakeTime()});
  const waiting = host.status;
  const guest = await GuestSession.join({net, store: guestStore, matchId: host.matchId, retry});
  const ctx = {host, guest, net, hostStore, guestStore, waiting};
  await settle(ctx);
  return ctx;
}
async function start(ctx) {
  ctx.host.pledge(); ctx.guest.pledge();
  await settle(ctx);
  return ctx;
}
async function keepBoth(ctx) {
  await ctx.guest.seat.game.keep([]);
  await ctx.host.seat.game.keep([]);
  await settle(ctx);
}
// Each seat plays the simple policy whenever it is that seat's move.
async function drive(ctx, seats, limit = 4000) {
  for (let i = 0; i < limit; i++) {
    const s = seats().find(s => s.game && s.game.winner === null && (s.game.phase === 'opening' ? !s.game.kept[0] : s.game.actor() === 0));
    if (!s) return;
    await Promise.resolve(perform(s.game, 0, choose(s.game, 0))).catch(() => {});
    await settle(ctx);
  }
}

test('match ids are 16 base32 characters', () => {
  assert.ok(validMatchId(newMatchId()));
  assert.equal(validMatchId('ABC'), false);
});

test('host and guest connect, pledge, and see mirrored, redacted views', async () => {
  const ctx = await pair();
  assert.equal(ctx.waiting, 'waiting');
  assert.equal(ctx.host.status, 'pledge');
  assert.equal(ctx.guest.status, 'pledge');
  assert.equal(ctx.guest.faction, 'red');
  ctx.host.pledge();
  await settle(ctx);
  assert.equal(ctx.host.status, 'pledged');
  ctx.guest.pledge();
  await settle(ctx);
  assert.equal(ctx.host.status, 'playing');
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.host.seat.game.players[0].faction, 'blue');
  assert.equal(ctx.guest.seat.game.players[0].faction, 'red');
  assert.ok(ctx.guest.seat.game.players[1].hand.every(c => c.hidden));
  assert.ok(ctx.host.seat.game.players[1].hand.every(c => c.hidden));
});

test('guest moves reach the host', async () => {
  const ctx = await start(await pair());
  await ctx.guest.seat.game.keep([]);
  assert.equal(ctx.host.seat.game.kept[1], true);
});

test('a third browser opening the link is turned away', async () => {
  const ctx = await pair();
  const intruder = await GuestSession.join({net: ctx.net, store: store(), matchId: ctx.host.matchId, retry});
  await settle({guest: intruder});
  assert.equal(intruder.status, 'error');
  assert.equal(intruder.error, 'full');
  assert.equal(ctx.host.status, 'pledge');
});

test('an intent lost in a dropped connection is rejected, not applied, and play resumes', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  const before = ctx.host.match.log.length;
  const lost = ctx.guest.seat.game.pass(0);
  ctx.net.dropAll();
  await assert.rejects(lost, /Connection lost/);
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.host.status, 'playing');
  assert.equal(ctx.host.match.log.length, before);
});

test('host and guest in the same browser keep separate records', async () => {
  const shared = store();
  const ctx = await start(await pair({hostStore: shared, guestStore: shared}));
  await keepBoth(ctx);
  assert.ok(shared.get(`host:${ctx.host.matchId}`).match);
  assert.equal(shared.get(`guest:${ctx.host.matchId}`).log.length, 2);
});

test('the host can reload mid-match; an impostor host is refused', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  const log = ctx.host.match.log.length;
  ctx.host.dispose(false);
  await flush();
  assert.equal(ctx.guest.status, 'reconnecting');
  const host = await HostSession.resume({net: ctx.net, store: ctx.hostStore, matchId: ctx.host.matchId, clock: fakeTime()});
  await settle(ctx);
  assert.equal(host.status, 'playing');
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(host.match.log.length, log);

  host.dispose(true);
  await flush();
  const impostor = await HostSession.create({net: ctx.net, store: store(), hostFaction: 'blue', matchId: ctx.host.matchId, clock: fakeTime()});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'error');
  assert.equal(ctx.guest.error, 'impostor');
  impostor.dispose();
});

test('leaving during the pledge cancels the match for both and clears storage', async () => {
  const ctx = await pair();
  ctx.guest.leave();
  await flush();
  assert.equal(ctx.guest.status, 'cancelled');
  assert.equal(ctx.host.status, 'cancelled');
  assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`), null);
  assert.equal(ctx.hostStore.get(`host:${ctx.host.matchId}`), null);
});

test('a full match with a guest reload mid-game ends verified for both', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 60);
  ctx.guest.dispose(false);
  await flush();
  assert.equal(ctx.host.status, 'paused');
  ctx.guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat]);
  if (ctx.host.seat.game.winner === null) await ctx.host.seat.game.concede(0);
  await settle(ctx);
  assert.equal(ctx.guest.status, 'ended');
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});

test('a match that ends while the guest is away is revealed and audited on return', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  ctx.guest.dispose(false);
  await flush();
  await ctx.host.seat.game.concede(0);
  assert.equal(ctx.host.status, 'ended');
  const guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle({guest});
  assert.equal(guest.seat.game.winner, 0);
  assert.equal(guest.status, 'ended');
  assert.deepEqual(guest.audit, {result: 'verified'});
});

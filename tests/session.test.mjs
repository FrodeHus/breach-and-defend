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
async function drive(ctx, seats, limit = 4000, pick = choose) {
  for (let i = 0; i < limit; i++) {
    const s = seats().find(s => s.game && s.game.winner === null && (s.game.phase === 'opening' ? !s.game.kept[0] : s.game.actor() === 0));
    if (!s) return;
    await Promise.resolve(perform(s.game, 0, pick(s.game, 0))).catch(() => {});
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

test('a guest leave message during a started match is a concede on the host', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  ctx.guest.conn.send({type: 'leave'});
  await settle(ctx);
  assert.equal(ctx.host.status, 'ended');
  assert.equal(ctx.host.seat.game.winner, 0);
});

test('guest.leave() mid-match while connected concedes', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  await ctx.guest.leave();
  await settle(ctx);
  assert.equal(ctx.host.status, 'ended');
  assert.equal(ctx.host.seat.game.winner, 0);
  assert.equal(ctx.guest.seat.game.winner, 1);
});

test('guest.leave() mid-match while disconnected cancels the guest and pauses the host', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  ctx.guest.conn.close();
  ctx.guest.conn = null;
  ctx.guest.leave();
  await flush();
  assert.equal(ctx.guest.status, 'cancelled');
  assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`), null);
});

const dropWelcome = net => ({
  ...net,
  async dial(id) {
    const c = await net.dial(id);
    let handler = () => {};
    Object.defineProperty(c, 'onmessage', {get: () => m => (m.type === 'welcome' ? c.close() : handler(m)), set: f => { handler = f; }});
    return c;
  },
});

test('a first-time guest whose connection drops before welcome errors and does not loop; a rejoin works', async () => {
  const net = fakeNet();
  const host = await HostSession.create({net, store: store(), hostFaction: 'blue', clock: fakeTime()});
  const guestStore = store();
  const guest = await GuestSession.join({net: dropWelcome(net), store: guestStore, matchId: host.matchId, retry});
  await flush();
  assert.equal(guest.status, 'error');
  assert.equal(guest.error, 'no-connection');
  const again = await GuestSession.join({net, store: guestStore, matchId: host.matchId, retry});
  await settle({guest: again});
  assert.equal(again.status, 'pledge');
  assert.equal(host.status, 'pledge');
});

// The UI waits on each intent's promise while input is locked, so no host intent may ever be left pending.
test('host intents settle synchronously through host reloads, guest reconnects and timeouts', async () => {
  const time = fakeTime();
  const net = fakeNet(), hostStore = store(), guestStore = store();
  const ctx = await start(await pair({net, hostStore, guestStore}));
  let host = ctx.host, mine = 0, acted = 0;
  const watch = h => { h.seat.onUpdate = (g, {mine: m}) => { if (m) mine++; }; };
  watch(host);
  const hostMove = () => {
    const g = host.seat.game;
    if (!g || g.winner !== null || (g.phase === 'opening' ? g.kept[0] : g.actor() !== 0)) return;
    const before = mine, p = perform(g, 0, choose(g, 0));
    p.catch(() => {});
    assert.equal(host.seat.pending.size, 0, 'the host intent was answered before act() returned');
    if (host.match.log.at(-1)?.seq === host.seat.seq) { acted++; assert.equal(mine, before + 1, 'the ack reached onUpdate as mine'); }
  };
  for (let round = 0; round < 12; round++) {
    await drive(ctx, () => [host.seat, ctx.guest.seat], 25);
    hostMove();
    if (round % 3 === 0) { // host reload: a fresh Seat whose seq restarts at 0
      host.dispose(false); await flush();
      host = ctx.host = await HostSession.resume({net, store: hostStore, matchId: host.matchId, clock: time});
      watch(host);
    } else if (round % 3 === 1) { // guest away, then back
      ctx.guest.dispose(false); await flush();
      hostMove();
      ctx.guest = await GuestSession.join({net, store: guestStore, matchId: host.matchId, retry});
    } else time.advance(100_000); // the referee plays out a turn by timeouts
    await settle(ctx);
    hostMove();
    await settle(ctx);
  }
  assert.ok(acted > 5, `host acted ${acted} times`);
});

// Never attacks, so the match runs long and the log and views grow past one PeerJS JSON message (about 16 KB).
const pacifist = (g, p) => { const a = choose(g, p); return a.type === 'attackers' ? {...a, uids: []} : a; };

test('a guest reloading late in a long match resumes and the match ends verified', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 350, pacifist);
  assert.equal(ctx.host.seat.game.winner, null);
  assert.ok(ctx.host.seat.game.turn >= 15, `turn ${ctx.host.seat.game.turn}`);
  assert.ok(JSON.stringify(ctx.host.match.log).length > 20_000);
  ctx.guest.dispose(false);
  await flush();
  assert.equal(ctx.host.status, 'paused');
  ctx.guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.host.status, 'playing');
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log);
  // Keep going until single views outgrow one message too, then reload once more and finish.
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 250, pacifist);
  assert.ok(JSON.stringify(ctx.host.match.view(1)).length > 16_000, 'late views exceed one PeerJS message');
  ctx.guest.dispose(false);
  await flush();
  ctx.guest = await GuestSession.join({net: ctx.net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  assert.equal(ctx.guest.status, 'playing');
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat]);
  if (ctx.host.seat.game.winner === null) await ctx.host.seat.game.concede(0);
  await settle(ctx);
  assert.equal(ctx.guest.status, 'ended');
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
  assert.deepEqual(ctx.net.tooBig, [], 'no message exceeded the transport limit');
});

// Lets a test watch what reaches the guest and rewrite what the guest sends.
const tap = (net, {seen = [], rewrite = m => m} = {}) => ({
  ...net, seen,
  async dial(id) {
    const c = await net.dial(id), send = c.send;
    let handler = () => {};
    c.send = m => send(rewrite(m));
    Object.defineProperty(c, 'onmessage', {get: () => m => { seen.push(m); handler(m); }, set: f => { handler = f; }});
    return c;
  },
});
async function rejoin(ctx, net) {
  ctx.guest.dispose(false);
  await flush();
  ctx.guest = await GuestSession.join({net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
}

test('a returning guest is sent only the log entries it lacks', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 40, pacifist);
  const have = ctx.guestStore.get(`guest:${ctx.host.matchId}`).log.length;
  ctx.guest.dispose(false);
  await flush();
  await drive(ctx, () => [ctx.host.seat], 3, pacifist); // the host moves on while the guest is away
  const seen = [];
  ctx.guest = await GuestSession.join({net: tap(ctx.net, {seen}), store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  const resume = seen.find(m => m.type === 'resume');
  assert.equal(resume.from, have);
  assert.equal(resume.log.length, ctx.host.match.log.length - have);
  assert.equal(ctx.guest.status, 'playing');
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log);
});

test('a resume overlapping what the guest has is accepted when it matches', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 30, pacifist);
  // An older client, or a count taken before an in-flight view was recorded.
  await rejoin(ctx, tap(ctx.net, {rewrite: m => (m.type === 'hello' ? {...m, have: 2} : m)}));
  assert.equal(ctx.guest.status, 'playing');
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log);
  await rejoin(ctx, tap(ctx.net, {rewrite: m => (m.type === 'hello' ? {type: 'hello', guestToken: m.guestToken} : m)}));
  assert.equal(ctx.guest.status, 'playing');
});

test('a host whose log is behind or differs from what the guest saw is refused', async () => {
  for (const [tamper, have] of [
    [r => r.log.push({...r.log.at(-1), n: r.log.length + 1}), undefined], // the host "forgot" an entry it sent
    [r => { r.log[1] = {...r.log[1], seq: 999}; }, 0],                    // the host rewrote re-requested history
  ]) {
    const ctx = await start(await pair());
    await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 20, pacifist);
    ctx.guest.dispose(false);
    await flush();
    const key = `guest:${ctx.host.matchId}`, r = ctx.guestStore.get(key);
    tamper(r);
    ctx.guestStore.set(key, r);
    const net = have === undefined ? ctx.net : tap(ctx.net, {rewrite: m => (m.type === 'hello' ? {...m, have} : m)});
    ctx.guest = await GuestSession.join({net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
    await settle(ctx);
    assert.equal(ctx.guest.status, 'error');
    assert.equal(ctx.guest.error, 'impostor');
  }
});

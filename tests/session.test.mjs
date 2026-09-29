// tests/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {HostSession, GuestSession, newMatchId, validMatchId} from '../dist/session.mjs';
import {createStore} from '../dist/storage.mjs';
import {fakeNet} from './helpers/fake-net.mjs';
import {fakeTime, memoryBackend} from './helpers/versus.mjs';
import {choose, perform} from './helpers/policy.mjs';
import {redactEntry} from '../dist/protocol.mjs';
import {audit} from '../dist/audit.mjs';

const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
const retry = () => new Promise(r => setImmediate(r));
const store = () => createStore(memoryBackend());
// Runs both sides until they are quiet: no frame in flight on the fake net and nothing queued on either session
// (the host's inbound queue and ordered outbox, the guest's queue). Hashing and seeding are real async crypto
// work whose timing varies by machine, so this waits for the work itself rather than a fixed number of ticks.
const settle = async ({guest, host, net}) => {
  for (let i = 0; i < 1000; i++) {
    await flush();
    await Promise.all([host?.settled(), guest?.settled()]);
    await flush();
    if ((net?.idle() ?? true) && !host?.pending && !guest?.pending) return;
  }
  throw Error('the sessions never went quiet');
};

// Fixed secrets make every shuffle, and so every test game, the same on every run.
const secrets = seed => { let i = 0; return () => (seed * 1_000_000 + ++i).toString(16).padStart(32, '0'); };
async function pair({hostStore = store(), guestStore = store(), net = fakeNet(), seed = 1, clock = fakeTime()} = {}) {
  const host = await HostSession.create({net, store: hostStore, hostFaction: 'blue', clock, random: secrets(seed)});
  const waiting = host.status;
  const guest = await GuestSession.join({net, store: guestStore, matchId: host.matchId, retry, random: secrets(seed + 500)});
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
  await settle({...ctx, guest: intruder});
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
  await settle({...ctx, guest});
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
  await settle({guest: again, host, net});
  assert.equal(again.status, 'pledge');
  assert.equal(host.status, 'pledge');
});

// The UI waits on each intent's promise while input is locked, so no host intent may ever be left pending.
test('host intents settle synchronously through host reloads, guest reconnects and timeouts', async () => {
  const time = fakeTime();
  const net = fakeNet(), hostStore = store(), guestStore = store();
  const ctx = await start(await pair({net, hostStore, guestStore, seed: 7}));
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
  // Deterministic (fixed secrets), and it runs rounds until the host has acted enough rather than a fixed count.
  let round = 0;
  for (; (round < 12 || acted <= 5) && round < 60 && host.seat.game?.winner === null; round++) {
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
  assert.ok(acted > 5, `host acted ${acted} times in ${round} rounds`);
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
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log.map(redactEntry));
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
const tap = (net, {seen = [], rewrite = m => m, inbound = m => m} = {}) => ({
  ...net, seen,
  async dial(id) {
    const c = await net.dial(id), send = c.send;
    let handler = () => {};
    c.send = m => send(rewrite(m));
    Object.defineProperty(c, 'onmessage', {get: () => m => { seen.push(m); handler(inbound(m)); }, set: f => { handler = f; }});
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
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log.map(redactEntry));
});

test('a resume overlapping what the guest has is accepted when it matches', async () => {
  const ctx = await start(await pair());
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat], 30, pacifist);
  // An older client, or a count taken before an in-flight view was recorded.
  await rejoin(ctx, tap(ctx.net, {rewrite: m => (m.type === 'hello' ? {...m, have: 2} : m)}));
  assert.equal(ctx.guest.status, 'playing');
  assert.deepEqual(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log, ctx.host.match.log.map(redactEntry));
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

// A host can send anything. The guest renders the view, so a view that is not exactly what viewFor makes stops the match.
test('a guest refuses a host view carrying markup, a bad faction, a prototype key or a revealed card', async () => {
  const attacks = [
    v => { v.reason = '<img src=x onerror=alert(1)>'; },
    v => { v.log[0] = '<script>alert(1)</script>'; },
    v => { v.players[1].faction = '"><script>alert(1)</script>'; },
    v => { v.players[0].hand[0].uid = '1" onmouseover="alert(1)'; },
    v => { v.turn = '<b>1</b>'; },
    v => { v.players[1].deck[0] = {hidden: true, id: 'b1', uid: 9}; },
    v => { v.mode = 'solo'; },
    v => Object.assign(v, JSON.parse('{"__proto__": {"polluted": true}}')),
    v => { v.players[0].field.push(JSON.parse('{"id":"b1","uid":900,"tapped":false,"sick":true,"damage":0,"bp":0,"bt":0,"constructor":{}}')); },
  ];
  for (const [i, attack] of attacks.entries()) {
    const ctx = await start(await pair({seed: 20 + i}));
    await keepBoth(ctx);
    // Once on a resume after a reload, and once on a live view.
    await rejoin(ctx, tap(ctx.net, {inbound: m => { if (m.type === 'resume') attack(m.view); return m; }}));
    assert.equal(ctx.guest.status, 'error', `attack ${i} on resume`);
    assert.equal(ctx.guest.error, 'impostor');
    assert.equal({}.polluted, undefined);

    const live = await start(await pair({seed: 40 + i, net: tap(fakeNet(), {inbound: m => { if (m.type === 'view' && m.entry?.n === 2) attack(m.view); return m; }})}));
    await keepBoth(live);
    assert.equal(live.guest.status, 'error', `attack ${i} on a live view`);
    assert.equal(live.guest.error, 'impostor');
  }
});

const hostKeepsWithUids = seen => seen.flatMap(m => (m.type === 'view' ? [m.entry] : m.type === 'resume' ? m.log : []))
  .filter(e => e?.by === 0 && e.type === 'keep' && 'bottom' in e);

async function finish(ctx) {
  await drive(ctx, () => [ctx.host.seat, ctx.guest.seat]);
  if (ctx.host.seat.game.winner === null) await ctx.host.seat.game.concede(0);
  await settle(ctx);
}

test('a host mulligan never shows its bottom cards to the guest, live or on resume, and still audits verified', async () => {
  const seen = [], base = fakeNet(), net = tap(base, {seen});
  const ctx = await start(await pair({net, seed: 3}));
  await ctx.host.seat.game.mulligan(0);
  await settle(ctx);
  const bottom = [ctx.host.seat.game.players[0].hand[2].uid];
  await ctx.host.seat.game.keep(bottom);
  await settle(ctx);
  assert.deepEqual(ctx.host.match.log.at(-1).bottom, bottom, 'the host keeps the full entry');
  // A guest that reports no entries is resent the whole log, overlapping what it has (compared in redacted form).
  await rejoin(ctx, tap(base, {seen, rewrite: m => (m.type === 'hello' ? {...m, have: 0} : m)}));
  assert.equal(ctx.guest.status, 'playing');
  const keep = ctx.guestStore.get(`guest:${ctx.host.matchId}`).log.find(e => e.by === 0 && e.type === 'keep');
  assert.equal(keep.bottomCount, 1);
  assert.equal('bottom' in keep, false);
  assert.ok(seen.some(m => m.type === 'resume' && m.log.length), 'a resume carried log entries');
  await finish(ctx);
  assert.deepEqual(hostKeepsWithUids(seen), []);
  const reveal = seen.find(m => m.type === 'reveal');
  assert.deepEqual(reveal.bottoms[keep.n], bottom, 'the bottoms are revealed at the end');
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});

test('a host timeout keep after a mulligan is redacted too and the match audits verified', async () => {
  const clock = fakeTime(), seen = [], net = tap(fakeNet(), {seen});
  const ctx = await start(await pair({net, clock, seed: 4}));
  await ctx.host.seat.game.mulligan(0);
  await ctx.guest.seat.game.keep([]);
  await settle(ctx);
  clock.advance(100_000); // the opening clock runs out: the referee keeps for the host, bottoming its costliest card
  await settle(ctx);
  const entry = ctx.host.match.log.find(e => e.by === 0 && e.type === 'keep');
  assert.equal(entry.timeout, true);
  assert.equal(entry.bottom.length, 1);
  await finish(ctx);
  assert.deepEqual(hostKeepsWithUids(seen), []);
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
});

test('revealed bottoms that do not fit the count, or are not what the host did, are caught', async () => {
  const ctx = await start(await pair({seed: 3}));
  await ctx.host.seat.game.mulligan(0);
  await settle(ctx);
  const hand = ctx.host.seat.game.players[0].hand.map(c => c.uid);
  await ctx.host.seat.game.keep([hand[2]]);
  await settle(ctx);
  await finish(ctx);
  const rec = ctx.guestStore.get(`guest:${ctx.host.matchId}`);
  assert.deepEqual(await audit(rec), {result: 'verified'});
  const n = rec.log.find(e => e.by === 0 && e.type === 'keep').n;
  const tried = async bottoms => (await audit({...rec, bottoms: {...rec.bottoms, [n]: bottoms}})).result;
  assert.equal(await tried([]), 'tampered', 'fewer bottoms than the count');
  assert.equal(await tried([hand[2], hand[3]]), 'tampered', 'more bottoms than the count');
  assert.equal(await tried([99999]), 'tampered', 'a card that was not in the hand');
  // Claiming a card went to the bottom that the host went on to play.
  const played = ctx.host.match.log.find(e => e.by === 0 && e.type === 'play' && hand.includes(e.uid) && e.uid !== hand[2]);
  assert.ok(played, 'the host played a card from its kept hand');
  assert.equal(await tried([played.uid]), 'tampered', 'a different card than the host bottomed');
  assert.equal((await audit({...rec, bottoms: null})).result, 'tampered', 'no bottoms revealed');
});

// A timeout: before the fix the two tabs displaced each other forever, and the test would hang.
test('a second tab joining the same match displaces the first, which stops for good', {timeout: 20_000}, async () => {
  let dials = 0;
  const base = fakeNet(), net = {...base, dial: id => { dials++; return base.dial(id); }};
  const ctx = await start(await pair({net, seed: 5}));
  await keepBoth(ctx);
  const first = ctx.guest;
  const second = await GuestSession.join({net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle({...ctx, guest: second});
  await settle({...ctx, guest: first});
  assert.equal(first.status, 'error');
  assert.equal(first.error, 'replaced');
  assert.equal(second.status, 'playing');
  const before = dials;
  await flush(20);
  assert.equal(dials, before, 'the displaced tab does not reconnect');
  assert.equal(first.status, 'error');
  ctx.guest = second;
  await finish(ctx);
  assert.equal(first.status, 'error');
  assert.deepEqual(second.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});

test('an unexpected failure handling a host message stops the guest with an error instead of hanging', async () => {
  const ctx = await start(await pair({seed: 6}));
  const errors = [], log = console.error;
  console.error = (...a) => errors.push(a);
  try {
    ctx.guest.seat.update = () => { throw Error('boom'); };
    await ctx.host.seat.game.keep([]);
    await settle(ctx);
  } finally { console.error = log; }
  assert.equal(ctx.guest.status, 'error');
  assert.equal(ctx.guest.error, 'internal');
  assert.equal(errors.length, 1);
  assert.ok(ctx.guestStore.get(`guest:${ctx.host.matchId}`), 'the record is kept so a reload resumes');
});

// A redacted bottom carries a commitment, so a host cannot reveal a different set of the right size.
test('a host that reveals a different bottom card than it committed to is caught', async () => {
  const ctx = await start(await pair({seed: 3}));
  await ctx.host.seat.game.mulligan(0);
  await settle(ctx);
  const hand = ctx.host.seat.game.players[0].hand.map(c => c.uid);
  await ctx.host.seat.game.keep([hand[2]]);
  await settle(ctx);
  await finish(ctx);
  const rec = ctx.guestStore.get(`guest:${ctx.host.matchId}`);
  assert.deepEqual(await audit(rec), {result: 'verified'});
  const i = rec.log.findIndex(e => e.by === 0 && e.type === 'keep'), n = rec.log[i].n;
  assert.match(rec.log[i].bottomCommit, /^[0-9a-f]{64}$/);
  const played = new Set(ctx.host.match.log.filter(e => e.by === 0 && e.type === 'play').map(e => e.uid));
  const swaps = hand.filter(u => u !== hand[2] && !played.has(u)); // cards a replay alone could never tell apart
  assert.ok(swaps.length > 0);
  for (const u of swaps) {
    const r = await audit({...rec, bottoms: {...rec.bottoms, [n]: [u]}});
    assert.equal(r.result, 'tampered', `claimed ${u}`);
    assert.match(r.reason, /changed which cards they put on the bottom/);
  }
  const log = structuredClone(rec.log);
  delete log[i].bottomCommit;
  assert.equal((await audit({...rec, log})).result, 'tampered', 'a redacted bottom with no commitment');
});

test('bottom commitments survive a host reload, and the match still audits verified', async () => {
  const ctx = await start(await pair({seed: 8}));
  await ctx.host.seat.game.mulligan(0);
  await settle(ctx);
  await ctx.host.seat.game.keep([ctx.host.seat.game.players[0].hand[0].uid]);
  await settle(ctx);
  const commit = ctx.guestStore.get(`guest:${ctx.host.matchId}`).log.find(e => e.by === 0 && e.type === 'keep').bottomCommit;
  ctx.host.dispose(false);
  await flush();
  ctx.host = await HostSession.resume({net: ctx.net, store: ctx.hostStore, matchId: ctx.host.matchId, clock: fakeTime()});
  await settle(ctx);
  // The guest asks for the whole log again: the resent keep must match, commitment included.
  await rejoin(ctx, tap(ctx.net, {rewrite: m => (m.type === 'hello' ? {...m, have: 0} : m)}));
  assert.equal(ctx.guest.status, 'playing');
  assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log.find(e => e.by === 0 && e.type === 'keep').bottomCommit, commit);
  await finish(ctx);
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
});

// An older tab whose connection dropped must not come back and take the match from a newer tab.
test('a stale guest tab that reconnects after a newer tab took over steps aside', {timeout: 20_000}, async () => {
  let release, gated = false, dials = 0;
  const gate = new Promise(r => { release = r; });
  const base = fakeNet(), net = {...base, dial: id => { dials++; return base.dial(id); }};
  const ctx = await start(await pair({net, seed: 5}));
  const a = ctx.guest;
  a.retry = async () => { if (gated) await gate; await retry(); };
  await keepBoth(ctx);
  gated = true;
  net.dropAll(); // a network blip: tab A waits to reconnect
  await flush();
  const b = ctx.guest = await GuestSession.join({net, store: ctx.guestStore, matchId: ctx.host.matchId, retry});
  await settle(ctx);
  await drive(ctx, () => [ctx.host.seat, b.seat], 40);
  const dialsBefore = dials;
  release(); // A's backoff ends while B is playing
  await settle(ctx); await settle({...ctx, guest: a});
  assert.equal(a.status, 'error');
  assert.equal(a.error, 'replaced');
  assert.equal(dials, dialsBefore, 'tab A did not dial');
  assert.equal(b.status, 'playing');
  await finish(ctx);
  assert.equal(a.status, 'error');
  assert.deepEqual(b.audit, {result: 'verified'});
  assert.deepEqual(ctx.host.audit, {result: 'verified'});
  assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`).owner, b.owner);
});

test('a guest tab whose saved record is ahead of it steps aside instead of overwriting it', async () => {
  const ctx = await start(await pair({seed: 9}));
  await keepBoth(ctx);
  const key = `guest:${ctx.host.matchId}`, r = ctx.guestStore.get(key);
  ctx.guestStore.set(key, {...r, seq: r.seq + 5}); // another tab (same owner id copied) moved on
  ctx.guest.pledge();
  assert.equal(ctx.guest.status, 'error');
  assert.equal(ctx.guest.error, 'replaced');
  assert.equal(ctx.guestStore.get(key).seq, r.seq + 5);
});

// crypto.subtle work finishes on the thread pool, so on a busy machine (a CI runner) it can land after any fixed
// number of event-loop ticks. Delaying every digest by a real timer makes that the normal case here.
test('sessions stay in step when hashing finishes late, as on a busy machine', async () => {
  const digest = crypto.subtle.digest;
  crypto.subtle.digest = async function (...a) {
    const out = await digest.apply(this, a);
    await new Promise(r => setTimeout(r, 2));
    return out;
  };
  try {
    const ctx = await pair({seed: 3});
    assert.equal(ctx.host.status, 'pledge');
    assert.equal(ctx.guest.status, 'pledge');
    await start(ctx);
    assert.equal(ctx.host.status, 'playing');
    assert.equal(ctx.guest.status, 'playing');
    await ctx.host.seat.game.mulligan(0);
    await settle(ctx);
    await ctx.host.seat.game.keep([ctx.host.seat.game.players[0].hand[0].uid]); // redacting it hashes a commitment
    await settle(ctx);
    assert.equal(ctx.guestStore.get(`guest:${ctx.host.matchId}`).log.length, ctx.host.match.log.length);
    await finish(ctx);
    assert.equal(ctx.guest.status, 'ended');
    assert.deepEqual(ctx.guest.audit, {result: 'verified'});
    assert.deepEqual(ctx.host.audit, {result: 'verified'});
  } finally {
    crypto.subtle.digest = digest;
  }
});

test('a host that leaves the moment the match ends still gets the final view and reveal to the guest', async () => {
  const ctx = await start(await pair());
  await keepBoth(ctx);
  const conceded = ctx.host.seat.game.concede(0);
  ctx.host.leave(); // before the outbox has sent the last view and the reveal
  await conceded;
  await settle(ctx);
  assert.equal(ctx.guest.status, 'ended');
  assert.deepEqual(ctx.guest.audit, {result: 'verified'});
});

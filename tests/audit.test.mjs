// tests/audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {audit} from '../public/audit.mjs';
import {Match} from '../public/match.mjs';
import {
  choiceCommit,
  digest,
  hostChoices,
  randomHex,
  redactEntry,
  sha256Hex,
  timeoutAction,
  unflipAction,
  viewFor,
} from '../public/protocol.mjs';
import {OPENING_MS, TURN_MS} from '../public/match.mjs';
import {aiIntent, choose} from './helpers/policy.mjs';
import {fakeTime} from './helpers/versus.mjs';
import {EXPANSION_POOL, POOLS} from '../public/cards.mjs';

// Plays a full match the way the guest would record it, including when each entry arrived by the match's fake
// clock. `tamper` simulates a cheating host, or lets time pass.
// Fixed secrets per seed, so every run plays the same games.
const secret = (seed, who) => (seed * 2 + who).toString(16).padStart(32, '0');
async function record(tamper = () => {}, seed = 1, pool = undefined, pick = choose) {
  const hostSecret = secret(seed, 0),
    guestSecret = secret(seed, 1);
  const time = fakeTime();
  const m = await Match.create(
    {hostFaction: 'blue', hostSecret, guestSecret, seedCommit: await sha256Hex(hostSecret), pool},
    time,
  );
  const views = [],
    sent = {},
    timing = {startedAt: null, times: {}, gaps: []};
  let seq = 0;
  m.onChange = ({entry}) => {
    views[entry ? entry.n : 0] = m.view(1);
    if (entry) timing.times[entry.n] = time.now();
  };
  m.connect(true);
  m.pledge(0);
  m.pledge(1);
  timing.startedAt = time.now();
  for (let i = 0; i < 1500 && !m.ended; i++) {
    tamper(m, i, time);
    if (m.ended) break; // a tamper step may itself end the match
    const p = m.game.actor(),
      a = pick(m.game, p);
    if (p === 1) {
      sent[++seq] = unflipAction(a);
      assert.equal(m.submit(1, sent[seq], seq).ok, true);
    } else assert.equal(m.submit(0, a).ok, true);
  }
  if (!m.ended) m.submit(0, {type: 'concede'});
  return {
    seedCommit: m.seedCommit,
    hostSecret,
    guestSecret,
    hostFaction: 'blue',
    log: structuredClone(m.log),
    sent,
    digests: await Promise.all(views.map(digest)),
    timing,
    ...(pool ? {pool} : {}),
  };
}

test('an honest match verifies, even with gaps in the middle of the record', async () => {
  const rec = await record();
  assert.deepEqual(await audit(rec), {result: 'verified'});
  rec.digests[5] = null;
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

test('a seed that does not match the commitment is tampering', async () => {
  const rec = await record();
  const r = await audit({...rec, hostSecret: randomHex()});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /committed/);
});

test('no reveal or an incomplete record is unverified', async () => {
  const rec = await record();
  assert.equal((await audit({...rec, hostSecret: null})).result, 'unverified');
  const r = await audit({...rec, digests: rec.digests.slice(0, 5)});
  assert.equal(r.result, 'unverified');
  assert.match(r.reason, /incomplete/);
});

test('a stacked guest deck is caught when the guest draws', async () => {
  const rec = await record((m, i) => {
    if (i !== 20) return;
    const deck = m.game.players[1].deck,
      top = deck.length - 1;
    const j = deck.findIndex(c => c.id !== deck[top].id);
    [deck[top], deck[j]] = [deck[j], deck[top]];
  });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /Your cards/);
});

test('an edited host capacity is caught', async () => {
  const rec = await record((m, i) => {
    if (i === 30) m.game.players[0].life += 5;
  });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /opponent’s cards or capacity/);
});

test('an opening hand that is not the fair shuffle is caught', async () => {
  const rec = await record();
  const other = await record(() => {}, 2);
  const r = await audit({...rec, digests: [other.digests[0], ...rec.digests.slice(1)]});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /opening hand/);
});

test('an illegal host move and a forged guest move are caught', async () => {
  const rec = await record();
  const illegal = structuredClone(rec.log);
  const k = illegal.findIndex(e => e.by === 0 && e.type === 'pass');
  illegal[k] = {...illegal[k], type: 'play', uid: 99999};
  assert.match((await audit({...rec, log: illegal})).reason, /rules do not allow/);
  const forged = structuredClone(rec.log);
  const f = forged.findIndex(e => e.by === 1 && !e.timeout && e.type === 'pass');
  forged[f] = {...forged[f], type: 'concede'};
  assert.match((await audit({...rec, log: forged})).reason, /never made/);
});

test('a guest move logged as a forged timeout is caught', async () => {
  const rec = await record((m, i) => {
    if (i === 25 && !m.ended) m.apply(1, {type: 'concede'}, null, true);
  });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /timeout/);
});

// Runs `fn` once, on the first step from `from` on where the guest must act outside the opening.
const onGuestTurn = (from, fn) => {
  let done = false;
  return (m, i, time) => {
    if (done || i < from || m.game.phase === 'opening' || m.game.actor() !== 1) return;
    done = true;
    fn(m, time);
  };
};
// The guest drops for `ms` while the referee pauses the clock, then comes back. Returns the gap as the guest saw it.
const disconnect = (m, time, ms) => {
  const from = time.now();
  m.connect(false);
  time.advance(ms);
  m.connect(true);
  return [from, time.now()];
};
const guestTimeouts = rec => rec.log.filter(e => e.by === 1 && e.timeout).length;

test('a timeout recorded for the guest before its clock ran out is caught', async () => {
  const rec = await record(onGuestTurn(25, m => m.apply(1, timeoutAction(m.game, 1), null, true)));
  assert.equal(guestTimeouts(rec), 1);
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /before your clock ran out/);
  // Without timing (a record saved before it was kept), only the move itself can be checked.
  assert.deepEqual(await audit({...rec, timing: null}), {result: 'verified'});
});

test('honest guest timeouts verify, in the opening and after a disconnection', async () => {
  const gaps = [];
  const later = onGuestTurn(30, (m, time) => {
    gaps.push(disconnect(m, time, 60_000));
    time.advance(TURN_MS); // enough for either clock to run out
  });
  const rec = await record((m, i, time) => {
    if (i === 0) time.advance(OPENING_MS); // both opening hands are kept by timeout
    later(m, i, time);
  });
  rec.timing.gaps = gaps;
  assert.ok(guestTimeouts(rec) >= 2);
  assert.deepEqual(await audit(rec), {result: 'verified'});
  // Counting the disconnection as clock time only makes the guest's copy expire sooner: still no false alarm.
  assert.deepEqual(await audit({...rec, timing: {...rec.timing, gaps: []}}), {result: 'verified'});
});

test('a timeout recorded right after the guest reconnects is caught, since the clock was paused', async () => {
  const gaps = [];
  const rec = await record(
    onGuestTurn(30, (m, time) => {
      gaps.push(disconnect(m, time, 120_000));
      m.apply(1, timeoutAction(m.game, 1), null, true);
    }),
  );
  rec.timing.gaps = gaps;
  assert.equal(guestTimeouts(rec), 1);
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /before your clock ran out/);
});

test('a reused guest sequence number is caught', async () => {
  const rec = await record();
  const idx = rec.log.map((e, k) => (e.by === 1 && !e.timeout ? k : -1)).filter(k => k >= 0);
  assert.ok(idx.length >= 2);
  const log = structuredClone(rec.log);
  log[idx[1]].seq = log[idx[0]].seq;
  const r = await audit({...rec, log});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /never made/);
});

test('a truncated log is unverified', async () => {
  const rec = await record();
  const r = await audit({...rec, log: rec.log.slice(0, 10)});
  assert.equal(r.result, 'unverified');
  assert.match(r.reason, /incomplete/);
});

test('the commitment is checked before completeness', async () => {
  const rec = await record();
  const r = await audit({...rec, hostSecret: randomHex(), digests: rec.digests.slice(0, 5)});
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /committed/);
});

test('an expansion match verifies with its pool and is caught if audited with another', async t => {
  POOLS.mirror = {name: 'Mirror', sets: ['first-breach'], deck: f => [...POOLS['first-breach'].deck(f)].reverse()};
  t.after(() => delete POOLS.mirror);
  const rec = await record(undefined, 1, 'mirror');
  assert.equal(rec.pool, 'mirror');
  assert.deepEqual(await audit(rec), {result: 'verified'});
  const {pool, ...withoutPool} = rec;
  assert.equal((await audit(withoutPool)).result, 'tampered');
});

test('a record from before card pools audits as First Breach; an unknown pool is unverified', async () => {
  const rec = await record();
  assert.equal(Object.hasOwn(rec, 'pool'), false);
  assert.deepEqual(await audit(rec), {result: 'verified'});
  assert.equal((await audit({...rec, pool: 'nope'})).result, 'unverified');
});

// What a guest really holds for an expansion match: the host's Probe answers redacted and committed.
async function expansionRecord(seed = 1) {
  const rec = await record(undefined, seed, EXPANSION_POOL, aiIntent);
  const full = rec.log;
  rec.log = await Promise.all(
    full.map(async e =>
      e.by === 0 && e.secret
        ? {...redactEntry(e), selectionCommit: await choiceCommit(rec.hostSecret, e.n, e.selection)}
        : e,
    ),
  );
  rec.choices = hostChoices(full);
  return rec;
}

test('an expansion match with secret host Probe answers verifies after the reveal', async () => {
  const rec = await expansionRecord(2);
  assert.ok(
    rec.log.some(e => e.by === 0 && e.secret),
    'the host probed at least once',
  );
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

test('a host that changes a Probe answer after the match, never reveals it or drops its commitment is caught', async () => {
  const rec = await expansionRecord(2);
  const n = Number(Object.keys(rec.choices)[0]);
  const changed = structuredClone(rec);
  const sel = changed.choices[n];
  changed.choices[n] =
    sel.order.length > 1 ? {...sel, order: [...sel.order].reverse()} : {discard: sel.order, order: sel.discard};
  const caught = async (r, reason) => {
    const result = await audit(r);
    assert.equal(result.result, 'tampered');
    assert.match(result.reason, reason);
  };
  await caught(changed, /changed a private choice/);
  await caught({...rec, choices: {}}, /didn’t reveal/);
  const uncommitted = structuredClone(rec);
  delete uncommitted.log[n - 1].selectionCommit;
  await caught(uncommitted, /changed a private choice/);
});

// An honest guest may send option fields the engine ignores; the host logs only the ones it reads.
test('a guest move sent with extra or empty options verifies against the host’s trimmed log entry', async () => {
  const loose = (g, p) => {
    const a = aiIntent(g, p);
    if (p !== 1 || (a.type !== 'play' && a.type !== 'activate')) return a;
    return {...a, options: a.options ? {overclock: false, reuse: 0, ...a.options, junk: 1} : null};
  };
  const rec = await record(undefined, 2, EXPANSION_POOL, loose);
  const guestMoves = Object.values(rec.sent).filter(a => a.type === 'play' || a.type === 'activate');
  assert.ok(
    guestMoves.some(a => a.options === null),
    'the guest played without options',
  );
  assert.ok(
    guestMoves.some(a => a.options?.junk === 1),
    'the guest sent extra option fields',
  );
  assert.ok(rec.log.every(e => !e.options || !Object.hasOwn(e.options, 'junk')));
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

// Only a Probe answer may be hidden: a host that hides another move behind a commitment is caught even though the
// move it reveals replays cleanly.
test('a host entry hidden as a private choice that is not a Probe answer is caught', async () => {
  const rec = await expansionRecord(2);
  const hide = async (r, e, selection) => {
    r.log[e.n - 1] = {
      ...redactEntry({...e, secret: true, selection}),
      selectionCommit: await choiceCommit(r.hostSecret, e.n, selection),
    };
    r.choices = {...r.choices, [e.n]: selection};
    return r;
  };
  const pass = rec.log.find(e => e.by === 0 && e.type === 'pass');
  const choice = rec.log.find(e => e.by === 0 && e.type === 'choose' && !e.secret);
  assert.ok(choice, 'the host made a public choice');
  for (const r of [
    await hide(structuredClone(rec), pass, {}),
    await hide(structuredClone(rec), choice, choice.selection),
  ]) {
    const result = await audit(r);
    assert.equal(result.result, 'tampered');
    assert.equal(result.reason, 'Your opponent hid a move that wasn’t a private choice.');
  }
});

test('a record from before secret answers audits exactly as before', async () => {
  const rec = await record();
  assert.equal(
    rec.log.some(e => e.secret),
    false,
  );
  assert.deepEqual(await audit(rec), {result: 'verified'});
});

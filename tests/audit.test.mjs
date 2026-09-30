// tests/audit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {audit} from '../public/audit.mjs';
import {Match} from '../public/match.mjs';
import {digest, randomHex, sha256Hex, unflipAction, viewFor} from '../public/protocol.mjs';
import {choose} from './helpers/policy.mjs';
import {fakeTime} from './helpers/versus.mjs';

// Plays a full match the way the guest would record it. `tamper` simulates a cheating host.
// Fixed secrets per seed, so every run plays the same games.
const secret = (seed, who) => (seed * 2 + who).toString(16).padStart(32, '0');
async function record(tamper = () => {}, seed = 1) {
  const hostSecret = secret(seed, 0), guestSecret = secret(seed, 1);
  const m = await Match.create({hostFaction: 'blue', hostSecret, guestSecret, seedCommit: await sha256Hex(hostSecret)}, fakeTime());
  const views = [], sent = {};
  let seq = 0;
  m.onChange = ({entry}) => { views[entry ? entry.n : 0] = m.view(1); };
  m.connect(true); m.pledge(0); m.pledge(1);
  for (let i = 0; i < 1500 && !m.ended; i++) {
    tamper(m, i);
    if (m.ended) break; // a tamper step may itself end the match
    const p = m.game.actor(), a = choose(m.game, p);
    if (p === 1) { sent[++seq] = unflipAction(a); assert.equal(m.submit(1, sent[seq], seq).ok, true); }
    else assert.equal(m.submit(0, a).ok, true);
  }
  if (!m.ended) m.submit(0, {type: 'concede'});
  return {seedCommit: m.seedCommit, hostSecret, guestSecret, hostFaction: 'blue', log: structuredClone(m.log), sent, digests: await Promise.all(views.map(digest))};
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
    const deck = m.game.players[1].deck, top = deck.length - 1;
    const j = deck.findIndex(c => c.id !== deck[top].id);
    [deck[top], deck[j]] = [deck[j], deck[top]];
  });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /Your cards/);
});

test('an edited host capacity is caught', async () => {
  const rec = await record((m, i) => { if (i === 30) m.game.players[0].life += 5; });
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
  const rec = await record((m, i) => { if (i === 25 && !m.ended) m.apply(1, {type: 'concede'}, null, true); });
  const r = await audit(rec);
  assert.equal(r.result, 'tampered');
  assert.match(r.reason, /timeout/);
});

test('a reused guest sequence number is caught', async () => {
  const rec = await record();
  const idx = rec.log.map((e, k) => (e.by === 1 && !e.timeout) ? k : -1).filter(k => k >= 0);
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

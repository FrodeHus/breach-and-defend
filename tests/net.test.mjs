import test from 'node:test';
import assert from 'node:assert/strict';
import {peerId, netError, loadPeer, toFrames, fromFrames, wrap, FRAME_CHARS, MAX_FRAMES} from '../dist/net.mjs';
import {fakeNet, MESSAGE_LIMIT} from './helpers/fake-net.mjs';

const flush = () => new Promise(r => setImmediate(r));

test('net.mjs names peers per match and reuses an already loaded PeerJS', async () => {
  assert.equal(peerId('abcdefghijklmnop'), 'bnd-abcdefghijklmnop');
  assert.equal(netError('server').code, 'server');
  class Peer {}
  globalThis.Peer = Peer;
  try { assert.equal(await loadPeer(), Peer); } finally { delete globalThis.Peer; }
});

test('the fake transport honours the contract', async () => {
  const net = fakeNet(), got = {host: [], guest: []};
  let hostConn, closes = 0;
  await net.listen('m', {onconnection: c => { hostConn = c; c.onmessage = m => got.host.push(m); c.onclose = () => closes++; }});
  await assert.rejects(net.listen('m', {onconnection() {}}), e => e.code === 'id-taken');
  await assert.rejects(net.dial('nope'), e => e.code === 'host-offline');
  const guest = await net.dial('m');
  guest.onmessage = m => got.guest.push(m);
  guest.onclose = () => closes++;
  guest.send({type: 'hello', n: 1});
  await flush();
  hostConn.send({type: 'welcome'});
  await flush();
  assert.deepEqual(got, {host: [{type: 'hello', n: 1}], guest: [{type: 'welcome'}]});
  net.dropAll();
  await flush();
  assert.equal(closes, 2);
  guest.send({type: 'late'});
  await flush();
  assert.equal(got.host.length, 1);
});

const bytes = m => Buffer.byteLength(JSON.stringify(m));
const big = n => ({type: 'resume', from: 3, log: Array.from({length: n}, (_, i) => ({n: i + 1, by: i % 2, seq: i % 3 ? i : null, note: 'quote " back\\slash ✓ emoji 🛡️ \u2028 é'})), nested: [[1, [2, [null, true]]], {x: -0.5, y: 1e21}], empty: [], s: ''});

test('small messages go out unframed and are delivered as is', () => {
  const msg = {type: 'hello', guestToken: null, have: 0};
  assert.deepEqual(toFrames(msg, 1), [msg]);
  assert.equal(fromFrames()(msg), msg);
});

test('large messages are framed under the PeerJS limit and reassemble exactly', () => {
  for (const n of [80, 400, 3000]) {
    const msg = big(n), frames = toFrames(msg, 7);
    assert.ok(frames.length > 1);
    for (const f of frames) assert.ok(bytes(f) < 12_500, `frame is ${bytes(f)} bytes`);
    const receive = fromFrames();
    const out = frames.map(f => receive(JSON.parse(JSON.stringify(f))));
    assert.ok(out.slice(0, -1).every(o => o === undefined));
    assert.deepEqual(out.at(-1), msg);
  }
});

test('frames never split a surrogate pair and survive worst-case escaping', () => {
  for (const unit of ['🛡', '"', '\\', 'é', '\u0001']) {
    for (const shift of [0, 1, 2]) {
      const msg = {s: 'a'.repeat(shift) + unit.repeat(FRAME_CHARS * 3)};
      const frames = toFrames(msg, 1);
      for (const f of frames) {
        assert.ok(bytes(f) < MESSAGE_LIMIT, `${JSON.stringify(unit)}: ${bytes(f)} bytes`);
        assert.ok(!/[\uD800-\uDBFF]$/.test(f.part) && !/^[\uDC00-\uDFFF]/.test(f.part));
      }
      const receive = fromFrames();
      let got;
      for (const f of frames) got = receive(JSON.parse(JSON.stringify(f)));
      assert.deepEqual(got, msg);
    }
  }
});

test('an out-of-sequence frame drops the partial message and the next one still arrives', () => {
  const a = toFrames(big(400), 1), b = toFrames(big(300), 2), receive = fromFrames();
  assert.equal(receive(a[0]), undefined);
  assert.equal(receive(a[2]), undefined); // a[1] went missing
  assert.equal(receive(a.at(-1)), undefined);
  let got;
  for (const f of b) got = receive(f);
  assert.deepEqual(got, big(300));
  assert.deepEqual(receive({type: 'view', n: 1}), {type: 'view', n: 1});
});

test('wrap() frames sends and reassembles receives over a PeerJS-like connection', () => {
  const handlers = {}, sent = [];
  const conn = {open: true, on: (e, f) => { handlers[e] = f; }, send: m => { assert.ok(bytes(m) < MESSAGE_LIMIT); sent.push(m); }, close() {}};
  let closed = 0;
  const c = wrap(conn, () => closed++);
  const got = [];
  c.onmessage = m => got.push(m);
  c.send(big(500));
  c.send({type: 'pledge'});
  assert.ok(sent.length > 2);
  for (const m of sent) handlers.data(JSON.parse(JSON.stringify(m)));
  assert.deepEqual(got, [big(500), {type: 'pledge'}]);
  handlers.error(); handlers.close();
  assert.equal(closed, 1);
});

test('wrap() closes the connection on an error so the peer hears it too', () => {
  const handlers = {};
  let closes = 0, notified = 0;
  const conn = {open: true, on: (e, f) => { handlers[e] = f; }, send() {}, close() { closes++; }};
  const c = wrap(conn);
  c.onclose = () => notified++;
  handlers.error(Error('negotiation failed'));
  assert.equal(closes, 1);
  assert.equal(notified, 1);
});

test('toFrames refuses a frame size that could never make progress', () => {
  for (const size of [1, 0, -1, NaN]) assert.throws(() => toFrames({s: 'x'.repeat(50)}, 1, size), RangeError);
  assert.equal(toFrames({s: '🛡'.repeat(20)}, 1, 2).length > 1, true);
});

test('the fake transport enforces the PeerJS message limit when framing is off', async () => {
  const net = fakeNet({framing: false}), got = [];
  let hostConn, hostClosed = 0;
  await net.listen('m', {onconnection: c => { hostConn = c; c.onclose = () => hostClosed++; }});
  const guest = await net.dial('m');
  guest.onmessage = m => got.push(m);
  await flush();
  hostConn.send(big(400));
  await flush();
  assert.deepEqual(got, []);
  assert.equal(hostClosed, 1);
  assert.equal(net.tooBig.length, 1);

  const framed = fakeNet();
  await framed.listen('m', {onconnection: c => { hostConn = c; }});
  const g2 = await framed.dial('m');
  g2.onmessage = m => got.push(m);
  await flush();
  hostConn.send(big(400));
  await flush();
  assert.deepEqual(got, [big(400)]);
  assert.deepEqual(framed.tooBig, []);
});

test('a frame claiming too many parts, or an oversized part, is refused instead of buffered', () => {
  for (const bad of [{n: MAX_FRAMES + 1, part: 'x'}, {n: 0, part: 'x'}, {n: 1.5, part: 'x'}, {n: 2, part: 'x'.repeat(FRAME_CHARS + 1)}, {n: 2, part: 7}]) {
    assert.throws(() => fromFrames()({type: '__frame', id: 1, i: 0, ...bad}), RangeError);
  }
});

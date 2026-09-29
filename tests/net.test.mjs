import test from 'node:test';
import assert from 'node:assert/strict';
import {peerId, netError, loadPeer} from '../dist/net.mjs';
import {fakeNet} from './helpers/fake-net.mjs';

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

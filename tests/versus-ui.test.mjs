// tests/versus-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../public/versus-ui.mjs';
import {POOLS} from '../public/cards.mjs';

test('the invite lobby escapes the link, offers share only when supported, and warns without storage', () => {
  const html = ui.lobby({status: 'waiting'}, {url: 'https://x.test/#join=a"b', canShare: false, storageOk: false});
  assert.match(html, /value="https:\/\/x\.test\/#join=a&quot;b"/);
  assert.match(html, /id="copyInvite"/);
  assert.doesNotMatch(html, /shareInvite/);
  assert.match(html, /can’t survive a reload/);
  assert.match(ui.lobby({status: 'waiting'}, {url: 'u', canShare: true, storageOk: true}), /id="shareInvite"/);
});

test('each lobby state has a way forward', () => {
  assert.match(ui.lobby({status: 'pledge'}), /BREACH &amp; DEFEND \/ PLAY A FRIEND/);
  assert.match(ui.lobby({status: 'pledge'}), /id="showPledge"/);
  assert.match(ui.lobby({status: 'pledged'}), /Waiting for your opponent to take the pledge/);
  assert.match(ui.lobby({status: 'reconnecting'}), /id="cancelVersus"/);
  assert.match(ui.lobby({status: 'cancelled'}), /id="versusHome"/);
  assert.match(ui.lobby({status: 'connecting'}), /Connecting/);
  const full = ui.lobby({status: 'error', error: 'full'});
  assert.match(full, /already has two players/);
  assert.doesNotMatch(full, /versusRetry/);
  assert.match(ui.lobby({status: 'error', error: 'server'}), /id="versusRetry"/);
});

test('every error code has a message, with a fallback', () => {
  for (const code of [
    'server',
    'no-connection',
    'host-offline',
    'unknown-match',
    'full',
    'id-taken',
    'impostor',
    'replaced',
    'internal',
  ])
    assert.ok(ui.errorMessage(code).length > 20, code);
  const replaced = ui.lobby({status: 'error', error: 'replaced'});
  assert.match(replaced, /open in another tab or window/);
  assert.doesNotMatch(replaced, /versusRetry/, 'another tab owns the match: retrying here would displace it');
  assert.match(ui.lobby({status: 'error', error: 'internal'}), /id="versusRetry"/);
  assert.equal(ui.errorMessage('weird'), ui.ERRORS['no-connection']);
});

test('the honor dialog explains the audit and asks for the pledge', () => {
  const html = ui.honorDialog({team: 'Red team'});
  assert.match(html, /An honor game/);
  assert.match(html, /RED TEAM/);
  assert.match(html, /id="pledge"/);
  assert.match(html, /id="pledgeLeave"/);
  assert.match(html, /Peeking doesn’t/);
});

test('clock text counts down from when the clock arrived', () => {
  assert.equal(ui.clockText({kind: 'turn', owner: 0, left: 90000, at: 0, paused: false}, 5500), 'Your turn · 1:25');
  assert.equal(
    ui.clockText({kind: 'response', owner: 1, left: 20000, at: 0, paused: false}, 0),
    'Opponent’s response · 0:20',
  );
  assert.equal(
    ui.clockText({kind: 'opening', owner: null, left: 1000, at: 0, paused: false}, 5000),
    'Opening hands · 0:00',
  );
  assert.equal(ui.clockText({kind: null, paused: true}, 0), 'Clock paused');
  assert.equal(ui.clockText(null, 0), '');
  assert.match(ui.matchStatus({status: 'paused', seat: {clock: null}}, 0), /Opponent disconnected/);
  assert.match(ui.matchStatus({status: 'reconnecting', seat: {clock: null}}, 0), /reconnecting/);
});

test('audit lines cover every result and escape reasons', () => {
  assert.match(ui.auditLine(null), /Verifying/);
  assert.match(ui.auditLine({result: 'verified'}), /Verified/);
  assert.match(ui.auditLine({result: 'tampered', turn: 4, reason: '<b>x</b>'}), /turn 4\. &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(ui.auditLine({result: 'unverified', reason: 'gone'}), /Unverified\. gone/);
});

test('the lobby names a non-default card pool before the pledge, and explains an unknown one', t => {
  POOLS.mirror = {name: 'First Breach + Mirror', sets: ['first-breach'], deck: POOLS['first-breach'].deck};
  t.after(() => delete POOLS.mirror);
  assert.doesNotMatch(ui.lobby({status: 'pledge', pool: 'first-breach'}), /class="lobby-pool"/);
  assert.match(ui.lobby({status: 'pledge', pool: 'mirror'}), /class="lobby-pool">Cards: First Breach \+ Mirror</);
  assert.match(ui.lobby({status: 'waiting', pool: 'mirror'}, {url: 'u'}), /Cards: First Breach \+ Mirror/);
  assert.match(ui.lobby({status: 'error', error: 'unknown-pool'}), /cards this version of the game doesn’t have/);
});

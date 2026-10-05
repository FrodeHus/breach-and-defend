import test from 'node:test';
import assert from 'node:assert/strict';
import {trackGame} from '../public/analytics.mjs';

const fakeBrowser = (pathname = '/', search = '', hash = '') => {
  const calls = [];
  return {
    calls,
    location: {pathname, search, hash},
    navigation: undefined,
    history: {
      state: {kept: true},
      pushState: (...a) => calls.push(['push', ...a]),
      replaceState: (...a) => calls.push(['replace', ...a]),
    },
  };
};

test('a game played is reported as a virtual page view and the address is put straight back', () => {
  const b = fakeBrowser();
  trackGame('solo', b);
  assert.deepEqual(b.calls, [
    ['push', {kept: true}, '', '/played/solo'],
    ['replace', {kept: true}, '', '/'],
  ]);
});

test('with the Navigation API the virtual page view leaves no extra Back entry', () => {
  const b = {...fakeBrowser(), navigation: {}};
  trackGame('solo', b);
  assert.deepEqual(
    b.calls.map(c => [c[0], c[3]]),
    [
      ['replace', '/played/solo'],
      ['replace', '/'],
    ],
  );
});

test('the versus invite hash and any query survive the round trip', () => {
  const b = fakeBrowser('/', '?x=1', '#host=abcdefghijklmnop');
  trackGame('versus', b);
  assert.equal(b.calls.at(-1)[3], '/?x=1#host=abcdefghijklmnop');
});

test('a browser that refuses history changes never breaks the game', () => {
  const b = fakeBrowser();
  b.history.pushState = () => {
    throw new Error('SecurityError');
  };
  assert.doesNotThrow(() => trackGame('solo', b));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../public/storage.mjs';
import {memoryBackend} from './helpers/versus.mjs';

const DAY = 24 * 60 * 60 * 1000;

test('values round-trip under a bnd: prefix; host and guest keys are independent', () => {
  const backend = memoryBackend(), s = createStore(backend);
  assert.equal(s.available, true);
  s.set('host:abc', {a: 1}); s.set('guest:abc', {b: 2});
  assert.deepEqual(s.get('host:abc'), {a: 1});
  assert.deepEqual(s.get('guest:abc'), {b: 2});
  assert.ok(backend.map.has('bnd:host:abc'));
  s.remove('host:abc');
  assert.equal(s.get('host:abc'), null);
  assert.deepEqual(s.get('guest:abc'), {b: 2});
});

test('a throwing or missing backend falls back to memory and reports unavailable', () => {
  const denied = () => { throw Error('denied'); };
  for (const backend of [{getItem: denied, setItem: denied, removeItem: denied, key: () => null, length: 0}, null]) {
    const s = createStore(backend);
    assert.equal(s.available, false);
    s.set('host:x', {a: 1});
    assert.deepEqual(s.get('host:x'), {a: 1});
    s.prune();
  }
});

test('a full backend keeps the latest value in memory', () => {
  const backend = memoryBackend(), setItem = backend.setItem;
  backend.setItem = (k, v) => { if (k !== 'bnd:probe') throw Error('QuotaExceededError'); setItem(k, v); };
  const s = createStore(backend);
  s.set('host:x', {big: true});
  assert.deepEqual(s.get('host:x'), {big: true});
});

test('a failed write removes the stored copy so a reload never resumes a stale record', () => {
  const backend = memoryBackend(), setItem = backend.setItem, s = createStore(backend);
  s.set('guest:x', {log: [1]});
  assert.ok(backend.map.has('bnd:guest:x'));
  backend.setItem = () => { throw Error('QuotaExceededError'); };
  s.set('guest:x', {log: [1, 2]});
  assert.equal(backend.map.has('bnd:guest:x'), false);
  assert.deepEqual(s.get('guest:x'), {log: [1, 2]});
  backend.setItem = setItem;
  assert.equal(createStore(backend).get('guest:x'), null, 'a reload finds nothing rather than the old record');
});

test('prune removes records older than seven days and unreadable ones only', () => {
  let now = 0;
  const backend = memoryBackend(), s = createStore(backend, () => now);
  s.set('host:old', 1);
  now = 8 * DAY;
  s.set('guest:new', 2);
  backend.setItem('bnd:junk', '{');
  backend.setItem('other', 'x');
  s.prune();
  assert.equal(s.get('host:old'), null);
  assert.equal(s.get('guest:new'), 2);
  assert.equal(backend.getItem('bnd:junk'), null);
  assert.equal(backend.getItem('other'), 'x');
});

test('blocked site data (SecurityError on reading globalThis.localStorage) does not throw; falls back to memory', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => { throw new Error('SecurityError'); },
      configurable: true,
    });
    const s = createStore();
    assert.equal(s.available, false);
    s.set('host:x', {a: 1});
    assert.deepEqual(s.get('host:x'), {a: 1});
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

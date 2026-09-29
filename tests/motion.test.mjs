import test from 'node:test';
import assert from 'node:assert/strict';
import {within, settle} from '../dist/motion.mjs';

const never = () => new Promise(() => {});
function manualClock() {
  const timers = new Set();
  return {schedule: (fn, ms) => { const h = {fn, ms}; timers.add(h); return h; }, cancel: h => timers.delete(h), fire() { for (const h of [...timers]) { timers.delete(h); h.fn(); } }, get size() { return timers.size; }};
}

test('within returns the value when the promise settles before the deadline, and clears its timer', async () => {
  const clock = manualClock();
  assert.deepEqual(await within(Promise.resolve(7), 1000, clock), {done: true, value: 7});
  assert.equal(clock.size, 0);
});

test('within gives up on a promise that never settles', async () => {
  const clock = manualClock();
  const waiting = within(never(), 1000, clock);
  clock.fire();
  assert.deepEqual(await waiting, {done: false});
});

test('within passes on a rejection that comes before the deadline', async () => {
  await assert.rejects(within(Promise.reject(Error('Wait for your turn to act.')), 1000, manualClock()), /Wait for your turn/);
});

// Reproduced in a hidden browser tab: an entry animation reported playState "finished" but its
// `finished` promise stayed pending for 114 s, until the tab painted again.
test('an animation whose finished promise never settles still ends shortly after its duration', async () => {
  const started = Date.now();
  assert.deepEqual(await settle({finished: never()}, 20, 10), {done: false});
  assert.ok(Date.now() - started < 1000);
});

test('a cancelled animation counts as done', async () => {
  const cancelled = {finished: Promise.reject(new DOMException('cancelled', 'AbortError'))};
  assert.deepEqual(await settle(cancelled, 20), {done: true, value: undefined});
});

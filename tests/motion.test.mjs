import test from 'node:test';
import assert from 'node:assert/strict';
import {within, settle, blockTrace, busLines} from '../public/motion.mjs';

const never = () => new Promise(() => {});
function manualClock() {
  const timers = new Set();
  return {
    schedule: (fn, ms) => {
      const h = {fn, ms};
      timers.add(h);
      return h;
    },
    cancel: h => timers.delete(h),
    fire() {
      for (const h of [...timers]) {
        timers.delete(h);
        h.fn();
      }
    },
    get size() {
      return timers.size;
    },
  };
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
  await assert.rejects(
    within(Promise.reject(Error('Wait for your turn to act.')), 1000, manualClock()),
    /Wait for your turn/,
  );
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

test('block traces run straight up, bend 45° onto the bus and back into the attacker', () => {
  assert.equal(blockTrace({x: 300, y: 500}, {x: 100, y: 212}, 360), 'M 300 500 V 370 L 290 360 H 110 L 100 350 V 212');
  assert.equal(blockTrace({x: 100, y: 500}, {x: 100, y: 212}, 360), 'M 100 500 V 212');
  // Close columns shrink the bend so the route never doubles back.
  assert.equal(blockTrace({x: 106, y: 500}, {x: 100, y: 212}, 360), 'M 106 500 V 363 L 103 360 H 103 L 100 357 V 212');
});

test('each attacker gets its own bus line inside the gap between the rows', () => {
  assert.deepEqual(busLines(1, 500, 200), [350]);
  assert.deepEqual(busLines(3, 500, 200), [340, 350, 360]);
  const tight = busLines(4, 250, 200);
  assert.ok(
    tight.every(y => y >= 212 && y <= 238),
    tight.join(),
  );
  assert.equal(new Set(tight).size, 4);
});

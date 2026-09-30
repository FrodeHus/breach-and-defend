import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arc,
  flip,
  lungeKeys,
  IMPACT,
  knock,
  budget,
  MAX_PARTICLES,
  cameraDistance,
  toWorld,
  toScreen,
} from '../public/stage3d-curves.mjs';
import {fail, frame, init, ready, resetStage, standIn} from '../public/stage3d.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('arc starts and lands exactly on its endpoints and peaks mid-flight', () => {
  const from = {x: 10, y: 400, rz: -0.06},
    to = {x: 300, y: 120, rz: 0};
  const a = arc(from, to, 0),
    b = arc(from, to, 1),
    mid = arc(from, to, 0.5, {height: 150});
  assert.deepEqual([a.x, a.y, a.z], [10, 400, 0]);
  near(b.x, 300);
  near(b.y, 120);
  near(b.z, 0);
  near(b.rz, 0);
  near(b.rx, 0);
  near(mid.z, 150);
});

test('flip turns half a revolution and lands flat', () => {
  near(flip(0).ry, 0);
  near(flip(1).ry, Math.PI);
  near(flip(1, Math.PI).ry, 2 * Math.PI);
  near(flip(0).z, 0);
  near(flip(1).z, 0);
});

test('lunge reaches the strike point at the impact key and returns home', () => {
  assert.deepEqual(lungeKeys(0), {k: 0, z: 0, rx: 0});
  near(lungeKeys(IMPACT).k, 1);
  near(lungeKeys(1).k, 0);
  near(lungeKeys(1).z, 0);
});

test('knock snaps to full strength and settles', () => {
  near(knock(0), 0);
  near(knock(0.06), 1);
  assert.ok(Math.abs(knock(0.9)) < 0.02);
});

test('screen and world coordinates round-trip at any height', () => {
  const view = {width: 1200, height: 800, distance: cameraDistance(800)};
  for (const z of [0, 40, 250]) {
    const s = toScreen(toWorld(137, 612, z, view), view);
    near(s.x, 137, 1e-6);
    near(s.y, 612, 1e-6);
  }
  const c = toWorld(600, 400, 0, view);
  near(c.x, 0);
  near(c.y, 0);
});

test('particle budget never exceeds the cap', () => {
  assert.equal(budget(0, 50), 50);
  assert.equal(budget(MAX_PARTICLES - 10, 50), 10);
  assert.equal(budget(MAX_PARTICLES + 5, 50), 0);
});

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
  };
}
const el = () => ({style: {visibility: ''}});

test('init never loads three.js when reduced motion is requested', async () => {
  resetStage();
  let loaded = false;
  assert.equal(await init({reduced: true, load: async () => (loaded = true)}), false);
  assert.equal(loaded, false);
  assert.equal(ready(), false);
});

test('init stays off when the import or WebGL fails', async () => {
  resetStage();
  assert.equal(await init({reduced: false, load: () => Promise.reject(new Error('offline'))}), false);
  assert.equal(ready(), false);
  resetStage();
  const doc = {createElement: () => ({className: '', setAttribute() {}, addEventListener() {}}), body: {append() {}}};
  const load = async () => ({
    WebGLRenderer: class {
      constructor() {
        throw new Error('no webgl');
      }
    },
  });
  assert.equal(await init({reduced: false, load, doc}), false);
  assert.equal(ready(), false);
});

test('standIn hides cards while running and restores them after it resolves', async () => {
  const a = el();
  let seen;
  const v = await standIn(
    [a, null],
    () => {
      seen = a.style.visibility;
      return 7;
    },
    1000,
  );
  assert.equal(seen, 'hidden');
  assert.equal(v, 7);
  assert.equal(a.style.visibility, '');
});

test('standIn restores cards when the animation throws', async () => {
  const a = el();
  await assert.rejects(
    standIn([a], () => Promise.reject(new Error('boom')), 1000),
    /boom/,
  );
  assert.equal(a.style.visibility, '');
});

test('standIn gives up after its time limit, restores cards and aborts the animation', async () => {
  const a = el(),
    clock = manualClock();
  let ctl;
  const run = standIn(
    [a],
    c => {
      ctl = c;
      return new Promise(() => {});
    },
    500,
    clock,
  );
  await Promise.resolve();
  assert.equal(a.style.visibility, 'hidden');
  clock.fire();
  assert.equal(await run, undefined);
  assert.equal(a.style.visibility, '');
  assert.equal(ctl.aborted, true);
});

test('frame throws after a failure so pending 3D jobs reject and fall back to CSS', () => {
  resetStage();
  const warn = console.warn;
  console.warn = () => {};
  try {
    fail(new Error('boom'));
  } finally {
    console.warn = warn;
  }
  assert.throws(() => frame(() => false), /off/);
  resetStage();
});

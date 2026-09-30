import test from 'node:test';
import assert from 'node:assert/strict';
import {faceKey, wrap, art} from '../public/card-faces.mjs';

test('faceKey separates kinds, sizes and states', () => {
  assert.equal(faceKey('b3', 'tile', 96.4, 128, '2/3/1'), 'b3|tile|96x128|2/3/1');
  assert.notEqual(faceKey('b3', 'tile', 96, 128), faceKey('b3', 'hand', 96, 128));
});

test('wrap breaks text into lines that fit', () => {
  const measure = s => s.length * 10;
  assert.deepEqual(wrap('Network Sentinel of the deep', 100, measure), ['Network', 'Sentinel', 'of the', 'deep']);
  assert.deepEqual(wrap('', 100, measure), []);
  assert.deepEqual(wrap('Supercalifragilistic', 50, measure), ['Supercalifragilistic']);
});

test('art resolves the image when it loads in time', async () => {
  const img = {};
  assert.equal(await art('t1.webp', 400, {load: async () => img, schedule: () => 0}), img);
});

test('art gives up with null when the image is slow or broken', async () => {
  let fire;
  const slow = art('t2.webp', 400, {load: () => new Promise(() => {}), schedule: fn => (fire = fn)});
  fire();
  assert.equal(await slow, null);
  assert.equal(await art('t3.webp', 400, {load: () => Promise.reject(new Error('404')), schedule: () => 0}), null);
});

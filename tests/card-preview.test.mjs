import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPosition} from '../public/card-preview.mjs';

test('hand previews lift above the source without covering its hit area', () => {
  const p = previewPosition({left:400,top:560,width:130,height:150}, {width:300,height:420}, {width:1280,height:720});
  assert.equal(p.top + 420 <= 550, true);
  assert.equal(p.left + 150, 465);
});

test('previews stay inside both screen edges and use space below top-row cards', () => {
  for (const left of [0, 1220]) {
    const p = previewPosition({left,top:600,width:130,height:120}, {width:300,height:420}, {width:1280,height:720});
    assert.ok(p.left >= 12);
    assert.ok(p.left + 300 <= 1268);
    assert.ok(p.top >= 12 && p.top + 420 <= 708);
  }
  const p = previewPosition({left:10,top:10,width:200,height:250}, {width:300,height:360}, {width:800,height:700});
  assert.equal(p.top, 270);
});

test('short viewports clamp the preview to visible space', () => {
  const p = previewPosition({left:250,top:200,width:140,height:140}, {width:300,height:420}, {width:640,height:450});
  assert.ok(p.top >= 12);
  assert.ok(p.top + 420 <= 438);
});

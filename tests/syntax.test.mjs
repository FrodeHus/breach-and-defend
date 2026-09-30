import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// app.mjs and a few UI modules need a DOM, so no other test imports them. This at least catches syntax errors.
test('every module parses', () => {
  const dir = new URL('../public/', import.meta.url);
  const modules = fs.readdirSync(dir).filter(f => f.endsWith('.mjs'));
  assert.ok(modules.includes('app.mjs'));
  for (const f of modules) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(f, dir))]);
});

test('vendored three.js is the pinned r170 build with its licence', () => {
  const dir = new URL('../public/vendor/', import.meta.url);
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(new URL('three.module.min.js', dir)))
    .digest('hex');
  assert.equal(hash, '08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7');
  assert.match(fs.readFileSync(new URL('three.LICENSE', dir), 'utf8'), /MIT License/);
});

test('the dev server serves .js files as JavaScript', () => {
  assert.match(
    fs.readFileSync(new URL('../serve.cjs', import.meta.url), 'utf8'),
    /'\.js': 'text\/javascript; charset=utf-8'/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// app.mjs and a few UI modules need a DOM, so no other test imports them. This at least catches syntax errors.
test('every module parses', () => {
  const dir = new URL('../public/', import.meta.url);
  const modules = fs.readdirSync(dir).filter(f => f.endsWith('.mjs'));
  assert.ok(modules.includes('app.mjs'));
  for (const f of modules) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(f, dir))]);
});

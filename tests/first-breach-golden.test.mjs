import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {playOut} from './helpers/simulate.mjs';

// The final saved state of 20 complete First Breach matches, hashed before the expansion rules existed.
// Any change here means First Breach plays or saves differently: find out why before touching the hash.
test('First Breach plays and saves exactly as before the expansion rules', () => {
  const h = createHash('sha256');
  for (let seed = 1; seed <= 20; seed++) h.update(JSON.stringify(playOut(seed).toJSON()));
  assert.equal(h.digest('hex'), '12396511784b14bcbfac506d2bf300c894c20f89b0a9877cfb1d359769cef8ba');
});

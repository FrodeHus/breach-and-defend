import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CARDS, TOKENS} from '../public/cards.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(`../art-source/cards/${path}`, import.meta.url), 'utf8'));
const prompts = read('persistent-threats/generation-prompts.json');
const foundation = read('foundation/generation-prompts.json');
// Everything but the name, subject and accent colour is the First Breach template, word for word.
const template = p =>
  p
    .replace(/named [^;]+;/, 'named X;')
    .replace(/Subject: .*? Style:/, 'Subject: S Style:')
    .replace(/Faction accents: [a-z ]+\./, 'Faction accents: A.');
const subject = p => p.match(/Subject: (.*?) Style:/)[1];

test('there is one prompt per expansion card and token, in catalog order', () => {
  const expected = [...CARDS.filter(c => c.set === 'persistent-threats'), TOKENS.backdoor, TOKENS.indicator];
  assert.deepEqual(
    prompts.map(p => [p.name, p.faction]),
    expected.map(c => [c.name, c.faction]),
  );
  for (const p of prompts) assert.deepEqual(Object.keys(p), ['name', 'faction', 'prompt']);
});

test('every prompt uses the First Breach template with its faction accent', () => {
  for (const p of prompts) {
    assert.equal(template(p.prompt), template(foundation[0].prompt), p.name);
    assert.match(p.prompt, new RegExp(`named ${p.name}; do not render the name`));
    assert.match(p.prompt, p.faction === 'red' ? /Faction accents: crimson red\./ : /Faction accents: cyan blue\./);
  }
});

test('subjects are distinct, and tokens never look like a compute resource', () => {
  const subjects = prompts.map(p => subject(p.prompt));
  assert.equal(new Set(subjects).size, subjects.length);
  for (const s of subjects) assert.ok(s.length > 60, s);
  for (const name of ['Backdoor', 'Indicator'])
    assert.match(subject(prompts.find(p => p.name === name).prompt), /rather than a battery, coin or power source/);
});

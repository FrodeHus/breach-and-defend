import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const meta = (attr, key) => index.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`))?.[1];

test('link previews use the 1200x630 splash with an absolute URL and alt text', () => {
  assert.equal(meta('property', 'og:image'), 'https://breach.cards/art/social-preview.jpg');
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.ok(meta('property', 'og:image:alt'));
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.ok(fs.existsSync(new URL('../dist/art/social-preview.jpg', import.meta.url)));
});

test('link previews have a title, description, type and canonical URL', () => {
  assert.equal(meta('property', 'og:type'), 'website');
  assert.equal(meta('property', 'og:url'), 'https://breach.cards/');
  assert.equal(meta('property', 'og:title'), 'Breach & Defend — Cybersecurity Card Game');
  assert.equal(meta('property', 'og:description'), meta('name', 'description'));
});

test('a Content-Security-Policy is declared before any resource loads', () => {
  const csp = index.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1];
  assert.ok(csp);
  assert.ok(index.indexOf('Content-Security-Policy') < index.indexOf('<link'));
  const directives = Object.fromEntries(csp.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  assert.deepEqual(directives['default-src'], ["'none'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.ok(!directives['script-src'].some(s => s.includes('unsafe')), 'no inline or eval scripts');
  // Every script the game loads must be allowed by script-src.
  const peer = fs.readFileSync(new URL('../dist/net.mjs', import.meta.url), 'utf8').match(/PEERJS_URL = '([^']+)'/)[1];
  assert.ok(directives['script-src'].some(s => s.endsWith('/') && peer.startsWith(s)));
});

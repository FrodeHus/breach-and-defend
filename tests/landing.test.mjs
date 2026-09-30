// tests/landing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {landing, MODES} from '../public/landing.mjs';

test('computer mode: mode pressed, tutorial opt-in, and Play buttons wired to data-start', () => {
  const html = landing({mode: 'solo'});
  assert.match(html, /data-mode="solo" aria-pressed="true"/);
  assert.match(html, /data-mode="friend" aria-pressed="false"/);
  assert.match(html, /id="guideFirstGame" type="checkbox"  aria-describedby="tutorialOffer"/);
  assert.match(html, /data-start="blue">Play Blue team →/);
  assert.match(html, /data-start="red">Play Red team →/);
  assert.doesNotMatch(html, /data-invite/);
  assert.match(landing({mode: 'solo', guide: true}), /id="guideFirstGame" type="checkbox" checked/);
});

test('friend mode: Invite buttons wired to data-invite and no tutorial opt-in', () => {
  const html = landing({mode: 'friend'});
  assert.match(html, /data-mode="friend" aria-pressed="true"/);
  assert.match(html, /data-invite="blue">Invite as Blue team →/);
  assert.match(html, /data-invite="red">Invite as Red team →/);
  assert.doesNotMatch(html, /guideFirstGame|data-start/);
  assert.match(html, /Your friend gets the other side/);
});

test('the hero serves responsive splash images that exist, with text alternatives', () => {
  const html = landing();
  assert.match(html, /srcset="art\/splash-960\.webp 960w, art\/splash-1732\.webp 1732w"/);
  assert.match(html, /<img src="art\/splash-1280\.jpg" alt="Breach &amp; Defend: [^"]+" width="1732" height="908"/);
  for (const file of ['splash-960.webp', 'splash-1732.webp', 'splash-1280.jpg']) {
    assert.ok(fs.existsSync(new URL(`../public/art/${file}`, import.meta.url)), file);
  }
  assert.equal(
    fs.existsSync(new URL('../public/art/breach-and-defend-splash.png', import.meta.url)),
    false,
    'the 2.4 MB original must not ship',
  );
});

test('both modes are real buttons with headings for each step, in focusable slots', () => {
  const html = landing();
  assert.equal((html.match(/<div class="mode-slot"><button type="button" class="mode-card"/g) || []).length, 2);
  assert.equal((html.match(/<div class="side-frame"><article class="side /g) || []).length, 2);
  assert.match(html, /<button class="primary slant" data-start="blue">/);
  assert.deepEqual(
    MODES.map(m => m.id),
    ['solo', 'friend'],
  );
  assert.equal((html.match(/<button type="button" class="mode-card"/g) || []).length, 2);
  assert.match(html, /<h2 id="modeTitle">Choose a mode<\/h2>/);
  assert.match(html, /<h2 id="sideTitle">Choose your side<\/h2>/);
});

test('each side button sits in an unclipped cta-slot so its focus glow is visible', () => {
  for (const mode of ['solo', 'friend']) {
    const html = landing({mode});
    assert.equal(
      (
        html.match(
          /<span class="cta-slot"><button class="primary slant" data-(start|invite)="(blue|red)">[^<]*<\/button><\/span>/g,
        ) || []
      ).length,
      2,
      mode,
    );
  }
});

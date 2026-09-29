// tests/about.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {about, LEARN} from '../dist/about.mjs';
import {landing} from '../dist/landing.mjs';

const html = about();

test('one h1 titles the page, with the ABOUT eyebrow and tagline', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /<h1 id="aboutTitle">About Breach &amp; Defend<\/h1>/);
  assert.match(html, /<p class="about-eyebrow">ABOUT<\/p>/);
  assert.match(html, /A red-versus-blue card game for learning cybersecurity — the fun way\./);
  for (const h of ['How it works', 'Play fair, by design', 'Privacy', 'Open source', 'Keep learning']) assert.match(html, new RegExp(`<h2[^>]*>${h}</h2>`), h);
});

test('credits the author and links the blog in a new tab with rel noopener', () => {
  assert.match(html, /Made by <strong>Frode Hus<\/strong> · <a href="https:\/\/www\.frodehus\.dev" target="_blank" rel="noopener">frodehus\.dev ↗<\/a>/);
});

test('every external link opens safely', () => {
  const links = html.match(/<a\b[^>]*>/g);
  assert.ok(links.length >= 6);
  for (const a of links) assert.match(a, /target="_blank" rel="noopener"/, a);
});

test('links the GitHub repository and its issues', () => {
  assert.match(html, /href="https:\/\/github\.com\/FrodeHus\/breach-and-defend" target="_blank" rel="noopener">View on GitHub ↗</);
  assert.match(html, /href="https:\/\/github\.com\/FrodeHus\/breach-and-defend\/issues" target="_blank" rel="noopener">Report a bug or suggest a card ↗</);
});

test('keep learning links point to CISA', () => {
  assert.equal(LEARN.length, 3);
  for (const [text, href] of LEARN) {
    assert.match(href, /^https:\/\/www\.cisa\.gov\//);
    assert.ok(html.includes(`href="${href}" target="_blank" rel="noopener">${text} ↗</a>`), text);
  }
});

test('in-app buttons switch views and sit in focusable slots', () => {
  assert.match(html, /<span class="about-cta"><button type="button" class="about-btn teal" data-view="library">Card library →<\/button><\/span>/);
  assert.match(html, /<span class="about-cta"><button type="button" class="about-btn" data-view="guide">Field guide →<\/button><\/span>/);
  assert.match(html, /<button type="button" class="about-back" data-view="arena">← Back to the arena<\/button>/);
  assert.equal((html.match(/<span class="about-cta">/g) || []).length, 4);
});

test('credits original designs without naming other games or publishers, and shows no version', () => {
  assert.match(html, /Original card designs and AI-generated illustrations\. Inspired by classic trading-card game mechanics\./);
  assert.doesNotMatch(html, /Magic|Wizards|WotC/i);
  assert.doesNotMatch(html, /version|v\d+\.\d+/i);
});

test('the made-by-AI art is a sized, responsive WebP with a text alternative', () => {
  assert.match(html, /<div class="about-art"><img src="art\/made-by-ai-440\.webp" srcset="art\/made-by-ai-440\.webp 440w, art\/made-by-ai-880\.webp 880w" sizes="\(min-width: 480px\) 440px, 100vw" alt="Made by AI: millions of tokens were burned in the token furnace to make this" width="440" height="293" loading="lazy" decoding="async"><\/div>/);
  for (const file of ['made-by-ai-440.webp', 'made-by-ai-880.webp']) {
    assert.ok(fs.existsSync(new URL(`../dist/art/${file}`, import.meta.url)), file);
  }
  assert.equal(fs.existsSync(new URL('../dist/art/made-by-ai.png', import.meta.url)), false, 'the 2.5 MB original must not ship');
  assert.doesNotMatch(html, /<svg/, 'the old inline SVG plate is gone');
});

test('the hero uses splash images that exist', () => {
  assert.match(html, /srcset="art\/splash-960\.webp 960w, art\/splash-1732\.webp 1732w"/);
  for (const file of [...html.matchAll(/art\/(splash-[\w.-]+)/g)].map(m => m[1])) {
    assert.ok(fs.existsSync(new URL(`../dist/art/${file}`, import.meta.url)), file);
  }
});

test('the landing page and the header link to About', () => {
  for (const mode of ['solo', 'friend']) assert.match(landing({mode}), /<footer class="landing-foot">.*<button type="button" class="about-link" data-view="about">About<\/button>/);
  const index = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(index, /<button id="aboutNav" class="nav">About<\/button>/);
  assert.match(index, /href="landing\.css"><link rel="stylesheet" href="about\.css">/);
});

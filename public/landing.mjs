// public/landing.mjs
// Arena start screen: splash hero, then mode and side. Pure strings, so it can be tested without a browser.
import {releasedCards} from './cards.mjs';
export const MODES = [
  {
    id: 'solo',
    eyebrow: 'TRAINING',
    title: 'Vs. computer',
    body: 'Learn the rules against a local opponent that only sees the public board. Turn on the guided first game if you are new.',
    tags: ['1 player', '15–25 min', 'Works offline'],
  },
  {
    id: 'friend',
    eyebrow: 'NEW · INVITE LINK',
    title: 'Play a friend',
    body: 'Send a link and play in two browsers, no account needed. Both players take an honor pledge, and every match is audited for tampering when it ends.',
    tags: ['2 players', '90 s turns', 'Reconnects if you reload'],
  },
];
const SIDES = [
  {
    id: 'blue',
    eyebrow: 'DEFEND &amp; DISRUPT',
    name: 'Blue team',
    text: 'Build resilient defenses. Investigate threats. Take back control.',
  },
  {
    id: 'red',
    eyebrow: 'INFILTRATE &amp; PRESSURE',
    name: 'Red team',
    text: 'Find the opening. Build your foothold. Push the advantage.',
  },
];
const ICONS = {
  solo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M8 20h8M12 16v4M9 9h.01M15 9h.01M9 12h6"/></svg>',
  friend:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 19c.8-3 2.8-5 5-5s4.2 2 5 5M14 18.5c.5-2 1.7-3.5 3-3.5s2.6 1.5 3 3.5"/></svg>',
};

export function landing({mode = 'solo', guide = false} = {}) {
  const friend = mode === 'friend';
  // Clipped shapes can't show an outline, so each card sits in a slot that glows on keyboard focus.
  const modeCard = m =>
    `<div class="mode-slot"><button type="button" class="mode-card" data-mode="${m.id}" aria-pressed="${m.id === mode}"><span class="mode-inner"><span class="mode-head"><span class="mode-icon">${ICONS[m.id]}</span><span class="mode-name"><span class="eyebrow">${m.eyebrow}</span><strong>${m.title}</strong></span><span class="mode-radio" aria-hidden="true"></span></span><span class="mode-body">${m.body}</span><span class="tags">${m.tags.map(t => `<span class="tag">${t}</span>`).join('')}</span></span></button></div>`;
  const side = s =>
    `<div class="side-frame"><article class="side ${s.id}"><img src="art/${s.id}-emblem.png" alt="" width="96" height="96"><div class="side-copy"><div class="eyebrow">${s.eyebrow}</div><h3>${s.name}</h3><p>${s.text}</p></div><span class="cta-slot"><button class="primary slant" ${friend ? 'data-invite' : 'data-start'}="${s.id}">${friend ? 'Invite as' : 'Play'} ${s.name} →</button></span></article></div>`;
  const extra = friend
    ? '<p class="side-note">Your friend gets the other side. You’ll get a link to send them.</p>'
    : `<label class="tutorial-opt-in"><input id="guideFirstGame" type="checkbox" ${guide ? 'checked' : ''} aria-describedby="tutorialOffer"><span><strong>Guide my first game</strong><small id="tutorialOffer">Six hands-on lessons as you play either faction. Exit anytime.</small></span></label>`;
  return `<div class="landing"><section class="hero" aria-label="Breach &amp; Defend"><picture><source type="image/webp" srcset="art/splash-960.webp 960w, art/splash-1732.webp 1732w" sizes="100vw"><img src="art/splash-1280.jpg" alt="Breach &amp; Defend: the red team and the blue team face off across a card table" width="1732" height="908" fetchpriority="high"></picture><div class="hero-copy"><p class="hero-lead">A red-versus-blue card game for learning how attacks unfold — and how good defenses change the outcome.</p><p class="hero-sub">${releasedCards().length} cards · every card teaches a real security concept</p></div></section><section class="landing-step" aria-labelledby="modeTitle"><div class="step-head"><span class="step-num">01</span><h2 id="modeTitle">Choose a mode</h2></div><div class="mode-grid">${MODES.map(modeCard).join('')}</div></section><section class="landing-step" aria-labelledby="sideTitle"><div class="step-head"><span class="step-num">02</span><h2 id="sideTitle">Choose your side</h2>${extra}</div><div class="side-grid">${SIDES.map(side).join('')}</div></section><footer class="landing-foot"><span>01 Play infrastructure / 02 Deploy units / 03 Attack &amp; respond</span><span>Original learning game · each card includes a security lesson · <button type="button" class="about-link" data-view="about">About</button></span></footer></div>`;
}

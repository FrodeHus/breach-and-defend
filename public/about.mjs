// public/about.mjs
// About page: who made the game, how it works, fair play, privacy and where to learn more. Pure strings, testable without a browser.
export const AUTHOR = {name: 'Frode Hus', url: 'https://www.frodehus.dev', label: 'frodehus.dev'};
export const REPO = 'https://github.com/FrodeHus/breach-and-defend';
export const LEARN = [
  ['CISA ransomware guide', 'https://www.cisa.gov/stopransomware/ransomware-guide'],
  ['Phishing-resistant MFA', 'https://www.cisa.gov/sites/default/files/2023-01/fact-sheet-implementing-phishing-resistant-mfa-508c.pdf'],
  ['Common security misconfigurations', 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-278a'],
];
// "Made by AI" token-furnace plate. Source: art-source/made-by-ai.png, shipped as 1x/2x WebP.
const MADE_BY_AI_ART = '<img src="art/made-by-ai-440.webp" srcset="art/made-by-ai-440.webp 440w, art/made-by-ai-880.webp 880w" sizes="(min-width: 480px) 440px, 100vw" alt="Made by AI: millions of tokens were burned in the token furnace to make this" width="440" height="293" loading="lazy" decoding="async">';
const ext = (href, text, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${href}" target="_blank" rel="noopener">${text}</a>`;
// Clipped buttons can't show an outline, so each sits in an unclipped slot that glows on keyboard focus.
const cta = inner => `<span class="about-cta">${inner}</span>`;
const panel = (accent, title, body) => `<div class="about-frame"><article class="about-panel ${accent}"><h2>${title}</h2>${body}</article></div>`;

export function about() {
  const panels = [
    panel('teal', 'How it works', `<ul><li><strong>Two factions.</strong> Red team infiltrates and pressures; blue team defends and disrupts.</li><li><strong>Two modes.</strong> Train against the computer, with an optional guided first game — or send a friend an invite link.</li><li><strong>Real lessons.</strong> Every card explains the security concept behind it.</li></ul><div class="about-actions">${cta('<button type="button" class="about-btn teal" data-view="library">Card library →</button>')}${cta('<button type="button" class="about-btn" data-view="guide">Field guide →</button>')}</div>`),
    panel('gold', 'Play fair, by design', '<p>A security game running in a browser can of course be hacked — so every friend match starts with an honor pledge.</p><p>And when it ends, your browser replays every move from a jointly generated seed and tells you whether anything was tampered with. That is a security lesson in itself.</p>'),
    panel('teal', 'Privacy', '<ul><li>No accounts and no tracking.</li><li>Computer matches stay in your browser.</li><li>Friend matches connect your two browsers directly; a public PeerJS server only helps them find each other.</li><li>Fonts are loaded from Google Fonts.</li></ul>'),
    panel('red', 'Open source', `<p>The whole game is on GitHub. Found a bug, or have an idea for a card? Open an issue.</p><div class="about-actions">${cta(ext(REPO, 'View on GitHub ↗', 'about-btn red'))}${cta(ext(`${REPO}/issues`, 'Report a bug or suggest a card ↗', 'about-btn'))}</div>`),
  ];
  return `<div class="about"><section class="about-hero" aria-labelledby="aboutTitle"><picture><source type="image/webp" srcset="art/splash-960.webp 960w, art/splash-1732.webp 1732w" sizes="100vw"><img src="art/splash-1280.jpg" alt="" width="1732" height="908"></picture><div class="about-hero-copy"><p class="about-eyebrow">ABOUT</p><h1 id="aboutTitle">About Breach &amp; Defend</h1><p class="about-tagline">A red-versus-blue card game for learning cybersecurity — the fun way.</p></div></section><div class="about-body"><section class="about-intro" aria-label="Introduction"><div class="about-intro-copy"><p class="about-lead">Pick a side. Build your infrastructure. Send in operators or analysts, and fight over every system on the board. Red team hunts for the opening; blue team closes it — and every one of the 50 cards teaches a real security concept, from phishing and lateral movement to backups and MFA.</p><p class="about-credit">Made by <strong>${AUTHOR.name}</strong> · ${ext(AUTHOR.url, `${AUTHOR.label} ↗`)}</p></div><div class="about-art">${MADE_BY_AI_ART}</div></section><section class="about-panels" aria-label="More about the game">${panels.join('')}</section><section class="about-learn" aria-labelledby="learnTitle"><h2 id="learnTitle">Keep learning</h2><div class="about-links">${LEARN.map(([text, href]) => ext(href, `${text} ↗`)).join('')}</div></section><footer class="about-foot"><span>Original card designs and AI-generated illustrations. Inspired by classic trading-card game mechanics.</span><button type="button" class="about-back" data-view="arena">← Back to the arena</button></footer></div></div>`;
}

// dist/versus-ui.mjs
// Markup for play-a-friend screens. Pure strings, so it can be tested without a browser.
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const ERRORS = {
  server: 'Couldn’t reach the matchmaking server. Try again, or play the computer.',
  'no-connection': 'Couldn’t connect to your opponent directly. Some networks block peer-to-peer games.',
  'host-offline': 'This match isn’t available. Ask your friend for a new link.',
  'unknown-match': 'This match isn’t available. Ask your friend for a new link.',
  full: 'This match already has two players.',
  'id-taken': 'This match is still open in another tab, or is closing. Wait a few seconds and try again.',
  impostor: 'Couldn’t confirm this is the same opponent as before, so the match was stopped.',
};
export const errorMessage = code => ERRORS[code] ?? ERRORS['no-connection'];
const RETRY = ['server', 'no-connection', 'id-taken', 'host-offline'];

export function lobby(session, {url = '', canShare = false, storageOk = true} = {}) {
  const page = (title, body, actions) => `<section class="versus-lobby" aria-live="polite"><div class="eyebrow">FOUNDATIONS / PLAY A FRIEND</div><h1>${title}</h1>${body}<div class="toolbar">${actions}</div></section>`;
  const home = '<button id="versusHome">Back to arena</button>';
  switch (session.status) {
    case 'waiting':
      return page('Send this link to your opponent.',
        `<p class="muted">They’ll play the other faction. Keep this tab open until they join.</p><div class="invite-link"><label class="sr-only" for="inviteLink">Invite link</label><input id="inviteLink" readonly value="${esc(url)}"><button class="primary" id="copyInvite">Copy link</button>${canShare ? '<button id="shareInvite">Share…</button>' : ''}</div>${storageOk ? '' : '<p class="notice">This browser is blocking site storage, so this match can’t survive a reload. Keep this tab open.</p>'}<p class="muted" role="status">Waiting for your opponent…</p>`,
        '<button id="cancelVersus">Cancel match</button>');
    case 'pledge':
      return page('Your opponent is here.', '<p class="muted">Both players take the honor pledge before the match starts.</p>', '<button class="primary" id="showPledge">Take the pledge</button><button id="cancelVersus">Leave match</button>');
    case 'pledged':
      return page('Pledge taken.', '<p class="muted" role="status">Waiting for your opponent to take the pledge…</p>', '<button id="cancelVersus">Leave match</button>');
    case 'reconnecting':
      return page('Reconnecting…', '<p class="muted" role="status">Trying to reach your opponent. This page continues automatically.</p>', '<button id="cancelVersus">Leave match</button>');
    case 'cancelled':
      return page('Match cancelled.', '<p class="muted">The match ended before it started.</p>', home);
    case 'error':
      return page('Couldn’t continue the match.', `<p>${esc(errorMessage(session.error))}</p>`, `${RETRY.includes(session.error) ? '<button class="primary" id="versusRetry">Try again</button>' : ''}${home}`);
    default:
      return page('Connecting…', '<p class="muted" role="status">Setting up a direct connection.</p>', '<button id="cancelVersus">Cancel</button>');
  }
}

export function honorDialog({team}) {
  return `<div class="honor"><div class="eyebrow">BEFORE YOU PLAY · YOU ARE ${esc(team).toUpperCase()}</div><h2>An honor game</h2><p>This is a hacking game running in a web browser. Of course it can be hacked — devtools are one keypress away, and you both know it.</p><p>So here’s the deal: no peeking at hidden cards, no editing the page, no stacking the deck. Red team, keep your exploits on the cards. Blue team, prove the controls work.</p><p>When the match ends, it is audited: tampering with the deck or the game state shows up in the recap. Peeking doesn’t — that part runs on honor.</p><div class="toolbar"><button class="primary" id="pledge">I solemnly swear to play fair</button><button id="pledgeLeave">Leave match</button></div></div>`;
}

export function clockText(clock, now) {
  if (!clock) return '';
  if (clock.paused) return 'Clock paused';
  if (clock.left == null) return '';
  const s = Math.ceil(Math.max(0, clock.left - (now - clock.at)) / 1000);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const who = clock.kind === 'opening' ? 'Opening hands'
    : clock.owner === 0 ? (clock.kind === 'turn' ? 'Your turn' : 'Your response')
    : clock.kind === 'turn' ? 'Opponent’s turn' : 'Opponent’s response';
  return `${who} · ${time}`;
}

export function matchStatus(session, now) {
  const banner = session.status === 'paused' ? 'Opponent disconnected — waiting for them to return. Clocks are paused.'
    : session.status === 'reconnecting' ? 'Connection lost — reconnecting to your opponent…' : '';
  return `<div class="versus-status"><span id="versusClock" class="versus-clock">${esc(clockText(session.seat?.clock, now))}</span>${banner ? `<span class="versus-banner" role="status">${banner}</span>` : ''}</div>`;
}

export function auditLine(audit) {
  if (!audit) return '<p class="audit" role="status">Verifying the match…</p>';
  if (audit.result === 'verified') return '<p class="audit verified" role="status">✓ Verified: fair match. A replay from the revealed seed matched every move.</p>';
  if (audit.result === 'tampered') return `<p class="audit tampered" role="status">Tampering detected at turn ${Number(audit.turn) || '?'}. ${esc(audit.reason ?? '')}</p>`;
  return `<p class="audit unverified" role="status">Unverified. ${esc(audit.reason ?? '')}</p>`;
}
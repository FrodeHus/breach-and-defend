// public/app.mjs
// Controller: owns the UI state, renders the views (card-view, arena-view, library, guide, landing, about,
// versus-ui) into #app, and turns clicks into engine moves. All markup lives in those view modules.
import {BY_ID} from './cards.mjs';
import {Game} from './engine.mjs';
import {Tutorial} from './tutorial.mjs';
import {installCardPreview} from './card-preview.mjs';
import {installLoreFlip} from './lore-panel.mjs';
import {installCardDrag, dropHandCard, assignBlock} from './card-drag.mjs';
import {snapshot, combat, transitions, arrows, within} from './motion.mjs';
import {HostSession, GuestSession} from './session.mjs';
import * as net from './net.mjs';
import {createStore} from './storage.mjs';
import * as versusUi from './versus-ui.mjs';
import {landing} from './landing.mjs';
import {about} from './about.mjs';
import {guide} from './guide.mjs';
import {library, libraryGrid} from './library.mjs';
import {card, hoverCard, label} from './card-view.mjs';
import * as arena from './arena-view.mjs';

// Watchdogs: a stalled animation or an unanswered versus intent must never leave the board locked.
const ANIMATION_MS = 6000,
  INTENT_MS = 10000;
const $ = s => document.querySelector(s),
  app = $('#app'),
  modal = $('#modal');
const store = createStore();
store.prune();

let game = null,
  view = 'arena',
  animating = false,
  timer = null,
  stepKey = '',
  resultShown = false;
let selected = new Set(),
  blocks = {},
  blocker = null;
let inspect = 'b3',
  inspectorOpen = false,
  loreSide = 'flavor',
  pauseAll = false,
  tutorial = false;
let guidance = new Tutorial(),
  guideChoice = false,
  startMode = 'solo';
let filter = {q: '', faction: 'all', type: 'all'};
let versus = null,
  remoteQueue = [],
  versusShown = '';
// The state the views read. They never change it.
const ui = () => ({
  game,
  versus,
  selected,
  blocks,
  blocker,
  inspect,
  inspectorOpen,
  loreSide,
  pauseAll,
  tutorial,
  guidance,
  filter,
});

document.addEventListener(
  'click',
  e => {
    if (animating) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },
  true,
);
installLoreFlip({
  onFlip: side => {
    loreSide = side;
  },
});
const cardPreview = installCardPreview({
  root: app,
  renderCard: el => hoverCard(ui(), el),
  // While a blocker awaits its target, the preview would cover the attackers it must click.
  canShow: () => !animating && !modal.open && !cardDrag.busy && !blocker,
});
const cardDrag = installCardDrag({
  root: app,
  previewSource: node => cardPreview.sourceFor(node),
  canStart: () => !animating && !modal.open && view === 'arena' && !!game && game.winner === null,
  describe: uid => {
    const c = game.players[0].hand.find(c => c.uid === uid);
    return c ? game.playIssues(0, c).map(i => i.message) : ['This card is no longer in your hand.'];
  },
  onBusy: busy => {
    if (busy) clearTimeout(timer);
    else schedule();
  },
  onDragStart: () => cardPreview.dismiss(true),
  onDrop: uid => {
    const issues = dropHandCard(game, uid, chooseTarget);
    if (issues.length) toast(issues.join(' '));
  },
  block: {
    canDrag: uid => game.phase === 'block' && game.actor() === 0 && game.find(uid)?.p === 0,
    attackers: () => game.attacks,
    // Check against a scratch copy so hovering never changes the real assignments.
    check: (b, a) => assignBlock(game, structuredClone(blocks), b, a),
    onDrop: (b, a) => {
      const issues = assignBlock(game, blocks, b, a);
      if (issues.length) return toast(issues.join(' '));
      blocker = null;
      render();
    },
  },
});

let toastTimer = null;
function toast(s) {
  const t = $('#toast');
  t.textContent = s;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.style.display = 'none'), 4000);
}

function close() {
  modal.close();
  schedule();
}
$('.close').onclick = close;
modal.addEventListener('cancel', () => setTimeout(schedule, 0));
modal.addEventListener('click', e => {
  if (e.target === modal) close();
});
function dialog(html) {
  cardDrag.cancel();
  cardPreview.dismiss(true);
  clearTimeout(timer);
  $('#modalBody').innerHTML = html;
  if (!modal.open) modal.showModal();
  decorateTutorialDialog();
}

// Animation lock: clicks are swallowed while the board animates (see the capture listener above).
function lock() {
  animating = true;
  document.body.classList.add('animating');
}
function unlock() {
  animating = false;
  document.body.classList.remove('animating');
}
// After any move animates: catch up on versus status, show the recap once, and move on.
function afterMove() {
  unlock();
  if (versusKey() !== versusShown) render();
  if (game?.winner !== null && game && !resultShown) {
    resultShown = true;
    recap();
  }
  cardPreview.refresh();
  schedule();
  drainRemote();
}

async function action(fn) {
  if (animating) return;
  if (versus?.seat?.pending?.size > 0) {
    toast('Waiting for your last move to be confirmed…');
    return;
  }
  cardPreview.dismiss(true);
  clearTimeout(timer);
  const before = game ? snapshot(game) : null,
    lessonBefore = game ? guidance.capture(game) : null;
  lock();
  try {
    const pending = fn();
    if (pending?.then) {
      const reply = versus ? await within(pending, INTENT_MS) : {done: true, value: await pending};
      if (!reply.done) {
        if (versus?.seat?.game) {
          game = versus.seat.game;
          remoteQueue = [];
        }
        toast('No reply to your move yet. Showing the latest board.');
      }
    }
    if (game) guidance.observe(game, lessonBefore);
    if (before) await within(combat(before, game), ANIMATION_MS);
    render();
    if (before) await within(transitions(before, game), ANIMATION_MS);
  } catch (e) {
    toast(e.message);
  } finally {
    afterMove();
  }
}

function remoteUpdate(g, {mine}) {
  if (mine && animating) {
    game = g;
    remoteQueue = [];
    return;
  }
  remoteQueue.push(g);
  drainRemote();
}
async function drainRemote() {
  if (animating || !remoteQueue.length) return;
  const next = remoteQueue.shift();
  const before = game && view === 'arena' && $('.table') ? snapshot(game) : null;
  game = next;
  lock();
  try {
    if (before) await within(combat(before, game), ANIMATION_MS);
    if (view === 'arena') render();
    if (before) await within(transitions(before, game), ANIMATION_MS);
  } finally {
    afterMove();
  }
}

function showCard(id, uid = null, zone = '') {
  const c = uid ? game?.find(uid)?.card : null;
  dialog(arena.cardDialog(ui(), id, c, zone));
  if ($('#cast')) $('#cast').onclick = () => chooseTarget(uid);
}
function chooseTarget(uid) {
  const c = game.players[0].hand.find(c => c.uid === uid);
  if (!c) return;
  const d = BY_ID[c.id],
    ts = game.targets(0, c);
  if (!d.target || d.target === 'opponent') {
    modal.close();
    action(() => game.play(0, uid, d.target ? ts[0] : undefined));
    return;
  }
  dialog(arena.targetDialog(ui(), d, ts));
  document.querySelectorAll('[data-target]').forEach(
    b =>
      (b.onclick = () => {
        modal.close();
        action(() => game.play(0, uid, ts[Number(b.dataset.target)]));
      }),
  );
}
function recap() {
  dialog(arena.recapView(ui()));
  if ($('#rematch')) $('#rematch').onclick = () => start(game.players[0].faction);
  if ($('#chooseSide'))
    $('#chooseSide').onclick = () => {
      modal.close();
      game = null;
      render();
    };
  if ($('#versusDone')) $('#versusDone').onclick = leaveVersus;
}
function confirmLeave() {
  if (versus && !(game && game.winner === null && versus.status !== 'ended')) {
    leaveVersus();
    return;
  }
  if (game.phase === 'opening' && !versus) {
    game = null;
    render();
    return;
  }
  dialog(arena.leaveDialog(ui()));
  $('#leave').onclick = () => {
    modal.close();
    if (versus) {
      if (versus.status === 'playing') action(() => game.concede(0));
      else leaveVersus();
      return;
    }
    game = null;
    render();
  };
  $('#stay').onclick = close;
}

function start(f, optIn = false) {
  if (versus) leaveVersus();
  cardPreview.dismiss(true);
  clearTimeout(timer);
  guidance = new Tutorial(optIn);
  guideChoice = false;
  tutorial = false;
  stepKey = '';
  game = new Game(f);
  view = 'arena';
  selected.clear();
  blocks = {};
  blocker = null;
  resultShown = false;
  inspect = f === 'blue' ? 'b3' : 'r3';
  modal.close();
  render();
  const initial = snapshot(game);
  initial.cards = new Map();
  initial.visual = new Map();
  lock();
  transitions(initial, game).finally(() => {
    unlock();
    cardPreview.refresh();
    schedule();
  });
}

function highlightGuidance() {
  if (view !== 'arena' || !game) return;
  const lesson = guidance.step(game, {selected, blocks, blocker});
  for (const selector of lesson?.targets || [])
    for (const element of app.querySelectorAll(selector)) {
      if (element.disabled) continue;
      element.classList.add('tutorial-target');
      element.setAttribute('aria-describedby', 'tutorialInstruction');
    }
}
function exitGuidance() {
  guidance.exit();
  guideChoice = false;
  if (modal.open) modal.close();
  render();
  schedule();
  ($('#advance') || $('#keep') || $('#tutorialToggle'))?.focus({preventScroll: true});
}
function decorateTutorialDialog() {
  if (!guidance.enabled || view !== 'arena' || !game) return;
  const cast = $('#cast'),
    targets = [...modal.querySelectorAll('[data-target]')];
  const message = targets.length
    ? 'Select a legal target to cast this card.'
    : cast && !cast.disabled
      ? 'Use the highlighted button to play this card. Its cost is paid automatically.'
      : 'Close these details to return to the guided match.';
  const note = document.createElement('div');
  note.className = 'tutorial-dialog-note';
  note.innerHTML = `<p id="tutorialDialogInstruction">${message}</p><button id="exitDialogTutorial" class="small">Exit tutorial</button>`;
  $('#modalBody').prepend(note);
  for (const element of targets.length ? targets : cast && !cast.disabled ? [cast] : []) {
    element.classList.add('tutorial-target');
    element.setAttribute('aria-describedby', 'tutorialDialogInstruction');
  }
  $('#exitDialogTutorial').onclick = exitGuidance;
}

function libraryCards() {
  cardPreview.dismiss(true);
  $('#libraryGrid').innerHTML = libraryGrid(ui());
}

function page() {
  if (view === 'library') return library(ui());
  if (view === 'guide') return guide();
  if (view === 'about') return about();
  if (versus && !versusReady())
    return versusUi.lobby(versus, {url: inviteUrl(), canShare: !!navigator.share, storageOk: store.available});
  if (!game) return landing({mode: startMode, guide: guideChoice});
  return game.phase === 'opening' ? arena.opening(ui()) : arena.battlefield(ui());
}

// Rebuilds the current view. Its controls are handled by the delegated listeners below, so nothing is rebound here.
function render() {
  versusShown = versusKey();
  cardDrag.cancel();
  cardPreview.dismiss(true);
  const focused = app.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id,
    focusUid = focused?.dataset?.uid;
  document.body.classList.toggle('match-playing', view === 'arena' && !!game && game.phase !== 'opening');
  document.body.classList.toggle('blocking-step', view === 'arena' && game?.phase === 'block' && game.actor() === 0);
  document.body.classList.toggle('landing-view', view === 'about' || (view === 'arena' && !game && !versus));
  arrows({});
  const key = game ? `${game.turn}:${game.phase}` : '';
  if (key !== stepKey) {
    selected.clear();
    blocker = null;
    blocks = game?.phase === 'block' ? {} : structuredClone(game?.blocks || {});
    stepKey = key;
  }
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.id === `${view}Nav`));
  app.innerHTML = page();
  if (view === 'arena' && game) arrows(blocks);
  if (view === 'library') libraryCards();
  highlightGuidance();
  if (focusId) document.getElementById(focusId)?.focus({preventScroll: true});
  else if (focusUid) app.querySelector(`[data-uid="${focusUid}"]`)?.focus({preventScroll: true});
  if (game && game.winner !== null && !resultShown) {
    resultShown = true;
    setTimeout(() => {
      if (animating) resultShown = false;
      else if (game?.winner !== null && game) recap();
    }, 900);
  }
}

function advance() {
  action(() => {
    if (game.phase === 'attack') return game.attackers(0, [...selected]);
    if (game.phase === 'block') return game.blockers(0, blocks);
    if (game.phase === 'cleanup') return game.discard([...selected]);
    return game.pass(0);
  });
}
function toggleTips() {
  tutorial = !tutorial;
  render();
}

// Buttons in #app, by id or by data attribute.
const BUTTONS = {
  keep: () => action(() => game.keep([...selected])),
  mulligan: () =>
    action(() => {
      selected.clear();
      return game.mulligan();
    }),
  advance,
  inspectorToggle: () => {
    inspectorOpen = !inspectorOpen;
    render();
    $('#inspectorToggle')?.focus();
  },
  quit: confirmLeave,
  recap,
  hideTutorial: toggleTips,
  tutorialToggle: toggleTips,
  exitTutorial: exitGuidance,
  copyInvite: async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl());
      toast('Invite link copied.');
    } catch {
      $('#inviteLink').select();
      toast('Press Ctrl+C or ⌘C to copy the link.');
    }
  },
  shareInvite: () =>
    navigator.share({title: 'Breach & Defend', text: 'Play me in Breach & Defend', url: inviteUrl()}).catch(() => {}),
  showPledge: () => honor(),
  cancelVersus: () => leaveVersus(),
  versusHome: () => leaveVersus(),
  versusRetry: () => location.reload(),
};
const DATA_BUTTONS = {
  view: name => go(name, true),
  start: f => start(f, guideChoice),
  mode: mode => {
    startMode = mode;
    render();
    $(`[data-mode="${startMode}"]`)?.focus({preventScroll: true});
  },
  invite: f => hostMatch(f),
  grave: p => dialog(arena.graveDialog(ui(), Number(p))),
};
app.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button || !app.contains(button)) return;
  if (Object.hasOwn(BUTTONS, button.id)) return BUTTONS[button.id]();
  const key = Object.keys(DATA_BUTTONS).find(k => button.dataset[k] !== undefined);
  if (key) DATA_BUTTONS[key](button.dataset[key]);
});
const FIELDS = {
  search: e => {
    filter.q = e.target.value;
    libraryCards();
  },
  factionFilter: e => {
    filter.faction = e.target.value;
    libraryCards();
  },
  typeFilter: e => {
    filter.type = e.target.value;
    libraryCards();
  },
  guideFirstGame: e => {
    guideChoice = e.target.checked;
  },
  pauseAll: e => {
    pauseAll = e.target.checked;
    schedule();
  },
};
app.addEventListener('input', e => {
  if (e.target.id === 'search') FIELDS.search(e);
});
app.addEventListener('change', e => {
  if (e.target.id !== 'search' && Object.hasOwn(FIELDS, e.target.id)) FIELDS[e.target.id](e);
});

// Clicking a card: select it for the current step (mulligan, discard, attack, block) or open its details.
document.addEventListener('click', e => {
  if (animating) return;
  const el = e.target.closest('[data-card]');
  if (!el) return;
  const id = el.dataset.card,
    uid = Number(el.dataset.uid),
    zone = el.dataset.zone;
  inspect = id;
  if (view === 'library' || !uid || modal.open) {
    showCard(id);
    return;
  }
  const toggle = () => {
    selected.has(uid) ? selected.delete(uid) : selected.add(uid);
    render();
  };
  if (zone === 'opening' && game.mulligans) {
    if (selected.has(uid) || selected.size < game.mulligans) toggle();
    else render();
    return;
  }
  if (zone === 'hand' && game.phase === 'cleanup' && game.active === 0) {
    toggle();
    return;
  }
  const f = game.find(uid);
  if (zone === 'field' && game.actor() === 0) {
    if (game.phase === 'attack' && f.p === 0) {
      if (game.canAttack(0, f.card)) toggle();
      else toast('Only ready units that are not new arrivals can attack. Firewall units cannot attack.');
      return;
    }
    if (game.phase === 'block') {
      if (f.p === 0) {
        if (BY_ID[id].type !== 'Unit' || f.card.tapped) {
          toast('Choose an untapped unit to block.');
          return;
        }
        for (const a in blocks) blocks[a] = blocks[a].filter(x => x !== uid);
        blocker = blocker === uid ? null : uid;
        render();
        return;
      }
      if (blocker && game.attacks.includes(uid)) {
        const issues = assignBlock(game, blocks, blocker, uid);
        if (issues.length) return toast(issues.join(' '));
        blocker = null;
        render();
        return;
      }
    }
  }
  showCard(id, uid, zone);
});
const inspectCard = (el, always) => {
  if (!el || !$('#inspection') || (!always && inspect === el.dataset.card)) return;
  inspect = el.dataset.card;
  $('#inspection').innerHTML = arena.inspection(ui());
};
app.addEventListener('focusin', e => inspectCard(e.target.closest('[data-card]'), true));
app.addEventListener('pointerover', e => inspectCard(e.target.closest('[data-card]'), false));
window.addEventListener('resize', () => arrows(view === 'arena' ? blocks : {}));
document.addEventListener('scroll', () => arrows(view === 'arena' ? blocks : {}), true);

// In-page view links move focus to the new view's heading (or its nav button) because the link itself is gone.
function go(name, inPage = false) {
  if (animating) return;
  view = name;
  clearTimeout(timer);
  render();
  schedule();
  scrollTo(0, 0);
  if (!inPage) return;
  const h = app.querySelector('h1');
  if (h) {
    h.tabIndex = -1;
    h.focus({preventScroll: true});
  } else $('#' + name + 'Nav').focus({preventScroll: true});
}
for (const name of ['arena', 'library', 'guide', 'about']) $('#' + name + 'Nav').onclick = () => go(name);

function versusReady() {
  return !!(versus?.seat && game && ['playing', 'paused', 'reconnecting', 'ended'].includes(versus.status));
}
function inviteUrl() {
  return versus?.role === 'host' && versus.matchId
    ? `${location.origin}${location.pathname}#join=${versus.matchId}`
    : '';
}
async function openVersus(role, open) {
  if (versus) return;
  const pending = {role, status: 'connecting'};
  versus = pending;
  game = null;
  view = 'arena';
  render();
  try {
    const s = await open();
    if (versus !== pending) {
      Promise.resolve(s.leave()).catch(() => {});
      if (!versus && location.hash.endsWith('=' + s.matchId))
        history.replaceState(null, '', location.pathname + location.search);
      return;
    }
    bindVersus(s);
  } catch (e) {
    if (versus !== pending) return;
    versus = {role, status: 'error', error: e.code || 'no-connection'};
    render();
  }
}
function hostMatch(f) {
  openVersus('host', async () => {
    const s = await HostSession.create({net, store, hostFaction: f});
    history.replaceState(null, '', `#host=${s.matchId}`);
    return s;
  });
}
function routeVersus() {
  const m = /^#(host|join)=([a-z2-7]{16})$/.exec(location.hash);
  if (!m || versus) return false;
  openVersus(m[1], () =>
    m[1] === 'host' ? HostSession.resume({net, store, matchId: m[2]}) : GuestSession.join({net, store, matchId: m[2]}),
  );
  return true;
}
function bindVersus(s) {
  versus = s;
  guidance = new Tutorial(false);
  resultShown = false;
  selected.clear();
  blocks = {};
  blocker = null;
  remoteQueue = [];
  if (s.seat.game) game = s.seat.game;
  s.seat.onUpdate = remoteUpdate;
  s.onStatus = versusStatus;
  versusStatus();
  if (game && game.winner !== null && !resultShown && versusReady()) {
    resultShown = true;
    recap();
  }
}
function versusStatus() {
  if (!versus) return;
  if (['cancelled', 'error'].includes(versus.status)) game = null;
  if (versus.status !== 'pledge' && $('#pledge')) modal.close();
  if (versus.status === 'pledge' && !modal.open) honor();
  if ($('#auditResult')) $('#auditResult').innerHTML = versusUi.auditLine(versus.audit);
  if (animating) return;
  if (versusKey() !== versusShown) render();
  schedule();
}
function versusKey() {
  return versus ? `${versus.status}|${versus.error}|${!!game}` : '';
}
function honor() {
  dialog(versusUi.honorDialog({team: label(versus.faction)}));
  $('#pledge').onclick = () => {
    modal.close();
    versus.pledge();
  };
  $('#pledgeLeave').onclick = leaveVersus;
}
function leaveVersus() {
  const s = versus;
  versus = null;
  game = null;
  remoteQueue = [];
  startMode = s ? 'friend' : startMode;
  if (s?.seat) {
    s.seat.onUpdate = () => {};
    s.onStatus = () => {};
  }
  Promise.resolve(s?.leave?.()).catch(() => {});
  history.replaceState(null, '', location.pathname + location.search);
  if (modal.open) modal.close();
  render();
}

// Plays the computer's moves, and passes for you when you have nothing to respond with (unless paused).
function schedule() {
  clearTimeout(timer);
  if (versus && versus.status !== 'playing') return;
  if (
    animating ||
    cardDrag.busy ||
    !game ||
    game.winner !== null ||
    view !== 'arena' ||
    modal.open ||
    game.phase === 'opening'
  )
    return;
  if (guidance.shouldPause(game)) return;
  if (game.actor() === 1) {
    if (!versus) timer = setTimeout(() => action(() => game.aiAction()), 450);
    return;
  }
  // Your own main phases and the attack, block and discard steps always wait for you.
  const yourDecision =
    ['attack', 'block', 'cleanup'].includes(game.phase) ||
    (game.active === 0 && ['main1', 'main2'].includes(game.phase));
  if (!pauseAll && !yourDecision && !game.players[0].hand.some(c => game.legal(0, c)))
    timer = setTimeout(() => action(() => game.pass(0)), 220);
}

if (document.modelContext?.registerTool) {
  const tools = [
    {
      name: 'start_training_match',
      description:
        'Start a new local training match as red or blue. Replaces any current training match. Refuses while a match against a friend is open, because leaving it concedes.',
      inputSchema: {
        type: 'object',
        properties: {faction: {type: 'string', enum: ['red', 'blue']}},
        required: ['faction'],
        additionalProperties: false,
      },
      annotations: {readOnlyHint: false, untrustedContentHint: false},
      execute(input) {
        if (!input || !['red', 'blue'].includes(input.faction) || Object.keys(input).some(k => k !== 'faction'))
          throw Error('Choose red or blue.');
        if (versus)
          throw Error('A match against a friend is open. Leave it on the page before starting a training match.');
        start(input.faction);
        return {faction: input.faction, phase: game.phase, handSize: game.players[0].hand.length};
      },
    },
    {
      name: 'read_training_match',
      description: 'Read current public match state and your own hand. Does not reveal the computer hand.',
      inputSchema: {type: 'object', properties: {}, additionalProperties: false},
      annotations: {readOnlyHint: true, untrustedContentHint: false},
      execute(input) {
        if (!input || Object.keys(input).length) throw Error('No arguments expected.');
        if (!game) return {phase: 'choose-faction'};
        return {
          phase: game.phase,
          turn: game.turn,
          activePlayer: game.active,
          capacity: game.players.map(p => p.life),
          hand: game.players[0].hand.map(c => BY_ID[c.id].name),
          battlefield: game.players.map(p => p.field.map(c => BY_ID[c.id].name)),
        };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
    } catch {}
  }
}

window.addEventListener('hashchange', routeVersus);
setInterval(() => {
  const el = $('#versusClock');
  if (el && versus?.seat?.clock) el.textContent = versusUi.clockText(versus.seat.clock, Date.now());
}, 250);
if (!routeVersus()) render();

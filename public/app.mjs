// public/app.mjs
// Controller: owns the UI state, renders the views (card-view, arena-view, library, guide, landing, about,
// versus-ui) into #app, and turns clicks into engine moves. All markup lives in those view modules.
import {BY_ID, DEFAULT_POOL, POOLS, edition, playablePool, releasedCards} from './cards.mjs';
import {Game} from './engine.mjs';
import {Tutorial} from './tutorial.mjs';
import {installCardPreview} from './card-preview.mjs';
import {installLoreFlip} from './lore-panel.mjs';
import {installCardDrag, dropHandCard, assignBlock, clearBlock} from './card-drag.mjs';
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
import * as expansion from './expansion-view.mjs';
import {abilityWays, castWays, ready, toOptions, togglePick} from './prepare.mjs';
import {isRule} from './rules.mjs';
import {choiceSelection, moveChoice, pickChoiceTarget, startChoice, toggleChoice} from './choices.mjs';

// Watchdogs: a stalled animation or an unanswered versus intent must never leave the board locked.
const ANIMATION_MS = 6000,
  INTENT_MS = 10000;
const $ = s => document.querySelector(s),
  app = $('#app'),
  modal = $('#modal');
const store = createStore();
store.prune();
// The chosen card pool, remembered per browser; an unknown or unreleased one falls back to First Breach.
let poolChoice = playablePool(store.get('pref:pool'));

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
let filter = {q: '', faction: 'all', type: 'all', set: 'all'};
let versus = null,
  remoteQueue = [],
  versusShown = '';
// A cast or activation being prepared in the dialog: nothing is spent until it is confirmed.
let prep = null;
// The pending choice being answered in the dialog (kept while it is closed, so reopening keeps the selection),
// whether its dialog is the one showing, and the id of the last choice whose dialog the player closed.
let choice = null,
  choiceShown = false,
  choiceClosed = null;
// Closing the choice dialog, however it closes, keeps it closed until the player asks for it again.
function closeChoice() {
  if (choiceShown && choice) choiceClosed = choice.id;
  choiceShown = false;
}
// A new match starts with no choice in progress (choice ids restart with the card uids).
function forgetChoice() {
  choice = null;
  choiceShown = false;
  choiceClosed = null;
}
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
    isBlocking: uid => Object.values(blocks).flat().includes(uid),
    onClear: uid => {
      clearBlock(blocks, uid);
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

// Tells screen-reader users why Confirm is disabled. The region lives in the dialog but outside #modalBody, so re-rendering can't drop it.
let announced = '';
function announce(text = '') {
  if (text === announced) return;
  announced = text;
  $('#srStatus').textContent = text;
}
function close() {
  announce();
  prep = null;
  closeChoice();
  modal.close();
  schedule();
}
$('.close').onclick = close;
modal.addEventListener('cancel', () => {
  announce();
  prep = null;
  closeChoice();
  setTimeout(schedule, 0);
});
// Any other way the modal closes (a new game, a versus prompt) also abandons a preparation. Closing a choice
// dialog (×, Escape, the backdrop) lets the player look at the board: it stays closed until "Make your choice".
modal.addEventListener('close', () => {
  prep = null;
  // The close event is queued: if a dialog has already opened again, it belongs to that one.
  if (!modal.open) {
    announce();
    closeChoice();
  }
});
modal.addEventListener('click', e => {
  if (e.target === modal) close();
});
function dialog(html) {
  cardDrag.cancel();
  cardPreview.dismiss(true);
  clearTimeout(timer);
  choiceShown = false;
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
  document.querySelectorAll('#modalBody [data-ability]').forEach(
    b =>
      (b.onclick = () => {
        const c = game.players[0].field.find(x => x.uid === uid);
        const way = c && abilityWays(game, 0, c).find(w => w.abilityId === b.dataset.ability);
        if (way) prepare({kind: 'activate', uid, zone: 'field', ways: [way]});
      }),
  );
  if ($('#reuse')) $('#reuse').onclick = () => chooseTarget(uid, 'grave');
}
function chooseTarget(uid, zone = 'hand') {
  const c = game.players[0][zone === 'grave' ? 'grave' : 'hand'].find(c => c.uid === uid);
  if (!c) return;
  if (isRule(BY_ID[c.id])) {
    prepare({kind: 'cast', uid, zone, ways: castWays(game, 0, c, zone)});
    return;
  }
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
// Preparing a cast or activation: pick a way, then targets and cost cards. Cancelling spends nothing.
function prepare(p) {
  // An activation has exactly one way: show it even when it cannot be used, so its reason is visible.
  const usable = p.ways.map((w, i) => (w.issues.length ? -1 : i)).filter(i => i >= 0);
  prep = {...p, way: p.kind === 'activate' ? 0 : usable.length === 1 ? usable[0] : null, picks: {}};
  showPrep();
}
// Re-rendering replaces the controls, so focus returns to the one just pressed, else Confirm, else the first choice.
function showPrep(keep = '') {
  dialog(expansion.prepDialog(ui(), prep));
  (
    (keep ? $(`#modalBody ${keep}:not([disabled])`) : null) ??
    $('#prepConfirm:not([disabled])') ??
    $('#modalBody button:not([disabled])')
  )?.focus();
  announce($('#prep-issue')?.textContent ?? '');
}
function confirmPrep() {
  const way = prep?.ways[prep.way];
  if (!way || !ready(way, prep.picks, game)) return;
  announce();
  const {kind, uid} = prep,
    options = toOptions(way, prep.picks);
  prep = null;
  modal.close();
  action(() => (kind === 'cast' ? game.play(0, uid, null, options) : game.activate(0, uid, way.abilityId, options)));
}
// A pending choice opens by itself once; closing it to look at the board is fine, and "Make your choice" reopens it.
// Re-rendering replaces the controls, so focus returns to the first of `keep` that is still enabled, else Confirm,
// else the first control.
function openChoice(...keep) {
  if (!game?.pending || game.pending.actor !== 0) return;
  if (choice?.id !== game.pending.id) choice = startChoice(game.pending);
  dialog(expansion.choiceDialog(ui(), choice));
  choiceShown = true;
  (
    keep.map(k => $(`#modalBody ${k}:not([disabled])`)).find(Boolean) ??
    $('#choiceConfirm:not([disabled])') ??
    $('#modalBody button:not([disabled])')
  )?.focus();
  announce($('#choice-issue')?.textContent ?? '');
}
// A choice dialog left open after its choice was answered elsewhere (the versus clock) closes itself.
function dropStaleChoice() {
  if (!choiceShown || (choice && game?.pending?.id === choice.id)) return;
  announce();
  choice = null;
  choiceShown = false;
  modal.close();
}
function submitChoice(selection) {
  announce();
  choice = null;
  choiceShown = false;
  modal.close();
  action(() => game.choose(0, selection));
}
// One delegated listener for the choice and preparation controls: the modal body is replaced on every render.
$('#modalBody').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (choiceShown && choice && game?.pending?.id === choice.id) {
    const ds = b.dataset,
      at = (attr, v) => `[${attr}="${CSS.escape(v)}"]`;
    if (ds.pay) return submitChoice({pay: ds.pay === 'yes'});
    if (ds.optional !== undefined) return submitChoice({uid: ds.optional === '' ? null : Number(ds.optional)});
    if (ds.choiceToggle) {
      choice = toggleChoice(game, choice, Number(ds.choiceToggle));
      return openChoice(at('data-choice-toggle', ds.choiceToggle));
    }
    // At an end the pressed arrow disables itself: focus the other arrow of the same card.
    if (ds.choiceUp) {
      choice = moveChoice(choice, Number(ds.choiceUp), -1);
      return openChoice(at('data-choice-up', ds.choiceUp), at('data-choice-down', ds.choiceUp));
    }
    if (ds.choiceDown) {
      choice = moveChoice(choice, Number(ds.choiceDown), 1);
      return openChoice(at('data-choice-down', ds.choiceDown), at('data-choice-up', ds.choiceDown));
    }
    if (ds.choicePick) {
      const cut = ds.choicePick.lastIndexOf(':');
      choice = pickChoiceTarget(game, choice, ds.choicePick.slice(0, cut), Number(ds.choicePick.slice(cut + 1)));
      return openChoice(at('data-choice-pick', ds.choicePick));
    }
    if (b.id === 'choiceConfirm') return submitChoice(choiceSelection(game, choice));
    return;
  }
  if (!prep) return;
  if (b.dataset.way !== undefined) {
    prep = {...prep, way: Number(b.dataset.way), picks: {}};
    return showPrep(`[data-way="${b.dataset.way}"]`);
  }
  if (b.dataset.pick !== undefined) {
    const [key, i] = b.dataset.pick.split(':');
    prep = {...prep, picks: togglePick(prep.ways[prep.way], prep.picks, key, Number(i))};
    return showPrep(`[data-pick="${b.dataset.pick}"]`);
  }
  if (b.id === 'prepConfirm') return confirmPrep();
  if (b.id === 'prepCancel') return close();
});
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
  const pool = playablePool(poolChoice, {guided: optIn});
  store.set('pref:pool', poolChoice); // Rewritten on each start, so the weekly storage prune keeps it.
  game = new Game(f, undefined, {pool});
  forgetChoice();
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
  if (!game) return landing({mode: startMode, guide: guideChoice, pool: poolChoice});
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
  if (game?.pending?.actor === 0) return openChoice();
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
  archive: p => dialog(expansion.archiveDialog(ui(), Number(p))),
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
  setFilter: e => {
    filter.set = e.target.value;
    libraryCards();
  },
  includeExpansion: e => {
    poolChoice = e.target.checked ? e.target.value : DEFAULT_POOL;
    store.set('pref:pool', poolChoice);
  },
  // Updates the expansion opt-in in place: re-rendering would move focus off this checkbox.
  guideFirstGame: e => {
    guideChoice = e.target.checked;
    const box = $('#includeExpansion');
    if (!box) return;
    box.disabled = guideChoice;
    $('#expansionOffer').textContent = guideChoice
      ? 'Guided games use First Breach cards only.'
      : `Both players use decks that mix First Breach with ${POOLS[box.value].optIn}.`;
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
  if (modal.open && uid && zone === 'grave') return showCard(id, uid, 'grave');
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
        // Clicking a unit that is already blocking removes its block; otherwise it toggles as the pending blocker.
        if (clearBlock(blocks, uid)) blocker = null;
        else blocker = blocker === uid ? null : uid;
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
    const s = await HostSession.create({net, store, hostFaction: f, pool: playablePool(poolChoice)});
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
  forgetChoice();
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
  dropStaleChoice();
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
  // Auto-pass never runs while a choice is yours.
  if (game.pending?.actor === 0) {
    if (choiceClosed !== game.pending.id) openChoice();
    return;
  }
  if (game.actor() === 1) {
    if (!versus) timer = setTimeout(() => action(() => game.aiAction()), 450);
    return;
  }
  // Your own main phases and the attack, block and discard steps always wait for you.
  const yourDecision =
    ['attack', 'block', 'cleanup'].includes(game.phase) ||
    (game.active === 0 && ['main1', 'main2'].includes(game.phase));
  if (!pauseAll && !yourDecision && !game.canAct(0)) timer = setTimeout(() => action(() => game.pass(0)), 220);
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
// The static header defaults to First Breach; show the released sets instead.
$('.edition').textContent = edition();
$('#libraryNav span').textContent = String(releasedCards().length);
if (!routeVersus()) render();

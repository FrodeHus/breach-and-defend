// @ts-check
// Shared by the host referee and the guest's audit, so both apply identical rules and redaction.
import {Game, PHASE_NAMES} from './engine.mjs';
import {BY_ID, CARDS, DEFAULT_POOL, KEYWORDS, POOLS} from './cards.mjs';
import {seededRandom} from './rng.mjs';

export const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
export const hexBytes = h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16));
export const randomHex = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256Hex(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}

// Key-sorted JSON, so a view hashes the same on both machines regardless of property order.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(x => canonical(x ?? null)).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter(k => v[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

export const seedHex = (hostSecret, guestSecret) => sha256Hex(`${hostSecret}:${guestSecret}`);
export function versusGame(seed, hostFaction, pool = DEFAULT_POOL) {
  const bytes = hexBytes(seed);
  return new Game(hostFaction, seededRandom(bytes.slice(0, 16)), {mode: 'versus', first: bytes[16] & 1, pool});
}

const other = p => (p === 0 || p === 1 ? 1 - p : p);
export const flipTarget = t => (t?.kind === 'player' ? {...t, p: 1 - t.p} : t);
const flipEntry = s => ({...s, p: 1 - s.p, target: flipTarget(s.target)});
export function flip(state) {
  const f = structuredClone(state);
  f.players.reverse();
  f.mulls.reverse();
  f.kept.reverse();
  f.casts?.reverse();
  for (const k of ['active', 'priority', 'first', 'winner']) f[k] = other(f[k]);
  f.stack = f.stack.map(flipEntry);
  if (f.pending) {
    f.pending.actor = 1 - f.pending.actor;
    if (f.pending.resolving) f.pending.resolving = flipEntry(f.pending.resolving);
  }
  if (f.waiting) f.waiting = f.waiting.map(w => ({...w, p: 1 - w.p}));
  return f;
}

// Deck lists are public and uids follow deck-list order, so hidden cards must never carry a uid.
const hidden = () => ({hidden: true});

// What a player may see of the open choice. Never the other player's private options (they are hidden card
// uids), and never the resolving frame's internals: the host resumes it, and a view only needs the card.
function pendingView(state, p) {
  const {frame, data, ...c} = state.pending;
  if (frame?.entry) c.resolving = frame.entry;
  if (data && c.kind === 'pay') c.data = {uid: data.uid, amount: data.amount};
  if (data && c.kind === 'targets') c.data = {trigger: data.trigger};
  if (c.private && c.actor !== p) {
    c.count = c.options.length;
    c.options = [];
  } else if (c.kind === 'probe') {
    const deck = state.players[c.actor].deck;
    c.cards = c.options.map(u => ({id: deck.find(d => d.uid === u).id, uid: u}));
  }
  return c;
}

export function viewFor(game, p) {
  const {rng, uid, queue, ...state} = game.toJSON();
  state.uid = 0; // Sentinel: cards start at 1, never a card uid; allows Game.fromJSON to mint new cards.
  if (state.pending) state.pending = pendingView(state, p);
  state.players = state.players.map((q, i) => ({
    ...q,
    deck: q.deck.map(hidden),
    hand: i === p ? q.hand : q.hand.map(hidden),
  }));
  return p === 0 ? state : flip(state);
}

export const unflipAction = a => (a.type === 'play' ? {...a, target: flipTarget(a.target ?? null)} : a);
export const actionFields = ({type, uid, target, uids, assignments, bottom, options, abilityId, selection}) =>
  Object.fromEntries(
    Object.entries({type, uid, target, uids, assignments, bottom, options, abilityId, selection}).filter(
      ([, v]) => v !== undefined,
    ),
  );

// From an untrusted peer: only the option fields the engine reads. The engine checks their values.
export function playOptions(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  if (o.overclock === true) out.overclock = true;
  if (o.reuse === true) out.reuse = true;
  for (const k of ['mode', 'targets', 'costUids']) if (Object.hasOwn(o, k)) out[k] = o[k];
  return out;
}

const list = x => (Array.isArray(x) ? x : []);
const ANY_ORDER = ['mulligan', 'keep', 'concede'];
export function applyAction(game, by, a) {
  if (by !== 0 && by !== 1) throw Error('Unknown player.');
  if (!ANY_ORDER.includes(a.type) && game.actor() !== by) throw Error('Wait for your turn to act.');
  switch (a.type) {
    case 'mulligan':
      return game.mulligan(by);
    case 'keep':
      return game.keep(list(a.bottom), by);
    case 'play':
      return game.play(by, a.uid, a.target ?? null, playOptions(a.options));
    case 'activate':
      return game.activate(by, a.uid, a.abilityId, playOptions(a.options));
    case 'choose':
      return game.choose(by, a.selection);
    case 'pass':
      return game.pass(by);
    case 'attackers':
      return game.attackers(by, list(a.uids));
    case 'blockers':
      return game.blockers(by, a.assignments && typeof a.assignments === 'object' ? a.assignments : {});
    case 'discard':
      return game.discard(list(a.uids));
    case 'concede':
      return game.concede(by);
    default:
      throw Error('Unknown action.');
  }
}

const byCost = (a, b) => BY_ID[b.id].cost - BY_ID[a.id].cost;
export function timeoutAction(game, p) {
  // A pending choice belongs to its chooser; the clock answers with the fixed automatic move.
  if (game.pending) return {type: 'choose', selection: game.defaultChoice()};
  const hand = game.players[p].hand;
  if (game.phase === 'opening')
    return {
      type: 'keep',
      bottom: [...hand]
        .sort(byCost)
        .slice(0, game.mulls[p])
        .map(c => c.uid),
    };
  if (game.phase === 'attack') return {type: 'attackers', uids: []};
  if (game.phase === 'block') return {type: 'blockers', assignments: {}};
  if (game.phase === 'cleanup')
    return {
      type: 'discard',
      uids: [...hand]
        .sort(byCost)
        .slice(0, hand.length - 7)
        .map(c => c.uid),
    };
  return {type: 'pass'};
}

// Short per-section hashes let the audit say what diverged without storing every view.
export async function digest(view) {
  const [all, you, foe, table] = await Promise.all(
    [view, view.players[0], view.players[1], {...view, players: null}].map(x => sha256Hex(canonical(x))),
  );
  return {all, you: you.slice(0, 12), foe: foe.slice(0, 12), table: table.slice(0, 12)};
}

// Mulligan bottoms are secret until the match ends: uids follow the public deck lists, so a host keep entry's
// `bottom` would tell the guest which cards the host put back. The guest gets only the count; `reveal`
// carries the uids (see hostBottoms), and the audit puts them back before replaying.
// A host's Probe answer (an entry marked `secret`) is withheld the same way until the reveal (see hostChoices).
export const redactEntry = e => {
  if (!e || e.by !== 0) return e;
  if (e.type === 'keep') {
    const {bottom, ...rest} = e;
    return {...rest, bottomCount: Array.isArray(bottom) ? bottom.length : 0};
  }
  // A host's Probe answer says which hidden cards it kept and in what order: the guest learns it at the reveal.
  if (e.secret) {
    const {selection, ...rest} = e;
    return rest;
  }
  return e;
};
// Commits the host to a bottom set before the guest learns it, salted with the still-secret host seed.
export const bottomCommit = (hostSecret, n, bottom) => sha256Hex(`${hostSecret}:${n}:${canonical(bottom ?? [])}`);
export const hostBottoms = log =>
  Object.fromEntries(log.filter(e => e.by === 0 && e.type === 'keep').map(e => [e.n, e.bottom ?? []]));
// Returns the full log, or null when a revealed bottom does not fit the count the guest saw live.
export function restoreBottoms(log, bottoms) {
  const out = [];
  for (const e of log) {
    if (!e || typeof e !== 'object' || !Object.hasOwn(e, 'bottomCount')) {
      out.push(e);
      continue;
    }
    const {bottomCount, bottomCommit: _, ...rest} = e;
    const bottom = bottoms && Object.hasOwn(bottoms, e.n) ? bottoms[e.n] : bottomCount === 0 ? [] : null;
    if (!Array.isArray(bottom) || bottom.length !== bottomCount || !bottom.every(Number.isInteger)) return null;
    out.push({...rest, bottom});
  }
  return out;
}
// Commits the host to a Probe answer before the guest learns it, salted with the still-secret host seed.
export const choiceCommit = (hostSecret, n, selection) =>
  sha256Hex(`${hostSecret}:choice:${n}:${canonical(selection ?? null)}`);
export const hostChoices = log =>
  Object.fromEntries(log.filter(e => e.by === 0 && e.secret).map(e => [e.n, e.selection]));
// Returns the full log, or null when a redacted answer was not revealed.
export function restoreChoices(log, choices) {
  const out = [];
  for (const e of log) {
    if (!e || e.by !== 0 || !e.secret || Object.hasOwn(e, 'selection')) {
      out.push(e);
      continue;
    }
    const selection = choices && Object.hasOwn(choices, e.n) ? choices[e.n] : null;
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    const {selectionCommit: _, ...rest} = e;
    out.push({...rest, selection});
  }
  return out;
}

// The guest renders what the host sends, so a view is checked against the exact shape viewFor produces
// before it is used. Anything else (markup in a string, an unknown card, a prototype key) throws.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export function safeKeys(value, depth = 0) {
  if (depth > 32) throw Error('Invalid message: too deep.');
  if (Array.isArray(value)) {
    for (const x of value) safeKeys(x, depth + 1);
    return value;
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw Error('Invalid message: not plain data.');
    for (const k of Object.keys(value)) {
      if (FORBIDDEN.has(k)) throw Error(`Invalid message: key ${k}.`);
      safeKeys(value[k], depth + 1);
    }
  }
  return value;
}
const LESSONS = new Set(CARDS.map(c => JSON.stringify([c.name, c.lesson ?? '', c.faction])));
const VIEW_KEYS = [
  'active',
  'attacks',
  'blocks',
  'events',
  'first',
  'kept',
  'log',
  'mode',
  'mulls',
  'passes',
  'phase',
  'players',
  'priority',
  'reason',
  'stack',
  'turn',
  'uid',
  'winner',
];
const PLAYER_KEYS = ['deck', 'faction', 'field', 'grave', 'hand', 'landPlayed', 'life'];
const CARD_KEYS = ['bp', 'bt', 'damage', 'id', 'sick', 'tapped', 'uid'];
const MAX_TEXT = 500,
  MAX_LOG = 200,
  MAX_ZONE = 200,
  MAX_EVENTS = 1000;
export function sanitizeView(view) {
  const fail = what => {
    throw Error(`Invalid view: ${what}.`);
  };
  const obj = (v, keys, what) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(what);
    const own = Object.keys(v).sort();
    if (own.length !== keys.length || own.some((k, i) => k !== keys[i])) fail(`${what} fields`);
    return v;
  };
  const arr = (v, what, max = MAX_ZONE) => {
    if (!Array.isArray(v) || v.length > max) fail(what);
    return v;
  };
  const int = (v, what, min = 0) => {
    if (!Number.isInteger(v) || v < min) fail(what);
    return v;
  };
  const num = (v, what) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) fail(what);
    return v;
  };
  const bool = (v, what) => {
    if (typeof v !== 'boolean') fail(what);
    return v;
  };
  // The engine's own notes never contain angle brackets; a host that sends some is trying to inject markup.
  const text = (v, what) => {
    if (typeof v !== 'string' || v.length > MAX_TEXT || /[<>]/.test(v)) fail(what);
    return v;
  };
  const seat = (v, what) => {
    if (v !== 0 && v !== 1) fail(what);
    return v;
  };
  const isHidden = c =>
    !!c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 1 && c.hidden === true;
  const KEY = /^[a-z]{1,16}$/;
  const OPTIONAL_CARD_KEYS = ['kw', 'locked', 'used'];
  const card = (c, what) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) fail(what);
    obj(c, [...CARD_KEYS, ...OPTIONAL_CARD_KEYS.filter(k => Object.hasOwn(c, k))].sort(), what);
    if (typeof c.id !== 'string' || !Object.hasOwn(BY_ID, c.id)) fail(`${what} id`);
    int(c.uid, `${what} uid`, 1);
    bool(c.tapped, what);
    bool(c.sick, what);
    num(c.damage, what);
    num(c.bp, what);
    num(c.bt, what);
    if (Object.hasOwn(c, 'kw'))
      for (const k of arr(c.kw, what, 8)) if (!Object.hasOwn(KEYWORDS, k)) fail(`${what} keyword`);
    if (Object.hasOwn(c, 'locked') && c.locked !== true) fail(what);
    if (Object.hasOwn(c, 'used'))
      for (const k of arr(c.used, what, 8)) if (typeof k !== 'string' || !KEY.test(k)) fail(what);
  };
  const ref = (t, what) => {
    if (t?.kind === 'player') {
      obj(t, ['kind', 'p'], what);
      seat(t.p, what);
    } else if (t?.kind === 'card' || t?.kind === 'spell') {
      obj(t, ['kind', 'uid'], what);
      int(t.uid, what, 1);
    } else fail(what);
  };
  const targetMap = (m, what) => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) fail(what);
    for (const [k, v] of Object.entries(m)) {
      if (!KEY.test(k)) fail(what);
      if (Array.isArray(v)) for (const t of arr(v, what, 4)) ref(t, what);
      else ref(v, what);
    }
  };
  const opts = (o, what) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) fail(what);
    if (Object.keys(o).some(k => !['targets', 'overclock', 'mode', 'reuse'].includes(k))) fail(`${what} options`);
    targetMap(o.targets, `${what} targets`);
    if (Object.hasOwn(o, 'overclock') && o.overclock !== true) fail(what);
    if (Object.hasOwn(o, 'reuse') && o.reuse !== true) fail(what);
    if (Object.hasOwn(o, 'mode') && (!Number.isInteger(o.mode) || o.mode < 0 || o.mode > 9)) fail(what);
  };
  const abilityRef = (a, what) => {
    obj(a, ['card', 'id', 'uid'], what);
    if (typeof a.card !== 'string' || !Object.hasOwn(BY_ID, a.card)) fail(what);
    if (!BY_ID[a.card].abilities?.some(x => x.id === a.id)) fail(what);
    int(a.uid, what, 1);
  };
  const entry = (s, what) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) fail(what);
    if (Object.hasOwn(s, 'ability')) {
      obj(s, ['ability', 'opts', 'p', 'target'], what);
      abilityRef(s.ability, what);
      opts(s.opts, what);
      if (s.target !== null) fail(what);
    } else if (Object.hasOwn(s, 'opts')) {
      obj(s, ['card', 'opts', 'p', 'target'], what);
      card(s.card, what);
      opts(s.opts, what);
      if (s.target !== null) fail(what);
    } else {
      obj(s, ['card', 'p', 'target'], what);
      card(s.card, what);
      if (s.target !== null) ref(s.target, `${what} target`);
    }
    seat(s.p, `${what} player`);
  };
  const KINDS = ['probe', 'discard', 'pay', 'optional', 'order', 'targets'];
  const pending = c => {
    const extra = ['data', 'resolving', 'count', 'cards'].filter(
      k => c && typeof c === 'object' && Object.hasOwn(c, k),
    );
    obj(c, ['actor', 'id', 'kind', 'max', 'min', 'options', 'private', 'prompt', ...extra].sort(), 'pending');
    int(c.id, 'pending', 1);
    seat(c.actor, 'pending actor');
    if (!KINDS.includes(c.kind)) fail('pending kind');
    bool(c.private, 'pending');
    text(c.prompt, 'pending prompt');
    int(c.min, 'pending');
    int(c.max, 'pending');
    const options = arr(c.options, 'pending options', 60);
    if (c.kind === 'pay') {
      if (!options.every(o => typeof o === 'boolean')) fail('pending options');
    } else if (c.kind === 'optional') {
      for (const o of options) if (o !== null) int(o, 'pending option', 1);
    } else if (c.kind === 'targets') {
      for (const o of options) {
        obj(o, ['candidates', 'key', 'optional', 'upTo'], 'pending option');
        if (!KEY.test(o.key)) fail('pending option');
        bool(o.optional, 'pending option');
        int(o.upTo, 'pending option');
        for (const t of arr(o.candidates, 'pending option', 60)) ref(t, 'pending option');
      }
    } else for (const o of options) int(o, 'pending option', 1);
    if (Object.hasOwn(c, 'count')) {
      int(c.count, 'pending count');
      if (!c.private || options.length) fail('pending count');
    }
    if (Object.hasOwn(c, 'cards')) {
      if (c.kind !== 'probe') fail('pending cards');
      for (const x of arr(c.cards, 'pending cards', 10)) {
        obj(x, ['id', 'uid'], 'pending card');
        if (typeof x.id !== 'string' || !Object.hasOwn(BY_ID, x.id)) fail('pending card');
        int(x.uid, 'pending card', 1);
      }
    }
    if (Object.hasOwn(c, 'data')) {
      if (c.kind === 'pay') {
        obj(c.data, ['amount', 'uid'], 'pending data');
        int(c.data.amount, 'pending data');
        int(c.data.uid, 'pending data', 1);
      } else if (c.kind === 'targets') {
        obj(c.data, ['trigger'], 'pending data');
        int(c.data.trigger, 'pending data', 1);
      } else fail('pending data');
    }
    if (Object.hasOwn(c, 'resolving')) entry(c.resolving, 'resolving entry');
  };
  const hiddenCard = (c, what) => {
    if (!isHidden(c)) fail(what);
  };

  safeKeys(view);
  // The default pool is never spelled out (Game.toJSON omits it), so there is one encoding and old digests hold.
  // Cast counts appear only mid-turn in expansion matches; pending and waiting only while a choice or trigger is open.
  const optionalKeys = ['pool', 'casts', 'pending', 'waiting'].filter(
    k => !!view && typeof view === 'object' && Object.hasOwn(view, k),
  );
  obj(view, [...VIEW_KEYS, ...optionalKeys].sort(), 'view');
  if (optionalKeys.includes('casts')) {
    if (!Array.isArray(view.casts) || view.casts.length !== 2) fail('casts');
    for (const n of view.casts) int(n, 'casts');
  }
  if (
    optionalKeys.includes('pool') &&
    (typeof view.pool !== 'string' || !Object.hasOwn(POOLS, view.pool) || view.pool === DEFAULT_POOL)
  )
    fail('pool');
  if (optionalKeys.includes('pending')) pending(view.pending);
  if (optionalKeys.includes('waiting'))
    for (const w of arr(view.waiting, 'waiting', 20)) {
      const extra = ['ordered', 'targets'].filter(k => w && typeof w === 'object' && Object.hasOwn(w, k));
      obj(w, ['ability', 'id', 'p', ...extra].sort(), 'waiting');
      int(w.id, 'waiting', 1);
      seat(w.p, 'waiting');
      abilityRef(w.ability, 'waiting');
      if (Object.hasOwn(w, 'ordered') && w.ordered !== true) fail('waiting');
      if (Object.hasOwn(w, 'targets')) targetMap(w.targets, 'waiting targets');
    }
  if (view.mode !== 'versus') fail('mode');
  seat(view.first, 'first');
  seat(view.active, 'active');
  seat(view.priority, 'priority');
  if (view.winner !== null && view.winner !== 'draw') seat(view.winner, 'winner');
  if (typeof view.phase !== 'string' || !Object.hasOwn(PHASE_NAMES, view.phase)) fail('phase');
  int(view.turn, 'turn', 1);
  int(view.passes, 'passes');
  int(view.uid, 'uid');
  text(view.reason, 'reason');
  for (const s of arr(view.log, 'log', MAX_LOG)) text(s, 'log entry');
  for (const m of arr(view.mulls, 'mulls', 2)) int(m, 'mulls');
  for (const k of arr(view.kept, 'kept', 2)) bool(k, 'kept');
  if (view.mulls.length !== 2 || view.kept.length !== 2) fail('mulls or kept');
  for (const e of arr(view.events, 'events', MAX_EVENTS)) {
    obj(e, ['faction', 'lesson', 'name'], 'event');
    if (!LESSONS.has(JSON.stringify([e.name, e.lesson, e.faction]))) fail('event');
  }
  for (const uid of arr(view.attacks, 'attacks')) int(uid, 'attacker', 1);
  const blocks = view.blocks;
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) fail('blocks');
  for (const [a, bs] of Object.entries(blocks)) {
    if (!/^[1-9][0-9]{0,8}$/.test(a)) fail('blocked attacker');
    for (const uid of arr(bs, 'blockers')) int(uid, 'blocker', 1);
  }
  for (const s of arr(view.stack, 'stack')) entry(s, 'stack entry');
  const players = arr(view.players, 'players', 2);
  if (players.length !== 2) fail('players');
  players.forEach((q, i) => {
    obj(
      q,
      [...PLAYER_KEYS, ...(q && typeof q === 'object' && Object.hasOwn(q, 'archive') ? ['archive'] : [])].sort(),
      'player',
    );
    if (q.faction !== 'red' && q.faction !== 'blue') fail('faction');
    num(q.life, 'life');
    bool(q.landPlayed, 'landPlayed');
    for (const c of arr(q.deck, 'deck')) hiddenCard(c, 'deck card');
    for (const c of arr(q.hand, 'hand')) (i === 1 ? hiddenCard : card)(c, 'hand card');
    for (const c of arr(q.field, 'field')) card(c, 'field card');
    for (const c of arr(q.grave, 'grave')) card(c, 'grave card');
    if (Object.hasOwn(q, 'archive')) for (const c of arr(q.archive, 'archive')) card(c, 'archive card');
  });
  if (players[0].faction === players[1].faction) fail('faction');
  return view;
}

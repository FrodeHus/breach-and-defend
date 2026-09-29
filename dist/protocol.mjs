// Shared by the host referee and the guest's audit, so both apply identical rules and redaction.
import {Game, PHASE_NAMES} from './engine.mjs';
import {BY_ID, CARDS} from './cards.mjs';
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
  if (v && typeof v === 'object') return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export const seedHex = (hostSecret, guestSecret) => sha256Hex(`${hostSecret}:${guestSecret}`);
export function versusGame(seed, hostFaction) {
  const bytes = hexBytes(seed);
  return new Game(hostFaction, seededRandom(bytes.slice(0, 16)), {mode: 'versus', first: bytes[16] & 1});
}

const other = p => (p === 0 || p === 1 ? 1 - p : p);
export const flipTarget = t => (t?.kind === 'player' ? {...t, p: 1 - t.p} : t);
export function flip(state) {
  const f = structuredClone(state);
  f.players.reverse(); f.mulls.reverse(); f.kept.reverse();
  for (const k of ['active', 'priority', 'first', 'winner']) f[k] = other(f[k]);
  f.stack = f.stack.map(s => ({...s, p: 1 - s.p, target: flipTarget(s.target)}));
  return f;
}

// Deck lists are public and uids follow deck-list order, so hidden cards must never carry a uid.
const hidden = () => ({hidden: true});
export function viewFor(game, p) {
  const {rng, uid, ...state} = game.toJSON();
  state.uid = 0; // Sentinel: cards start at 1, never a card uid; allows Game.fromJSON to mint new cards.
  state.players = state.players.map((q, i) => ({...q, deck: q.deck.map(hidden), hand: i === p ? q.hand : q.hand.map(hidden)}));
  return p === 0 ? state : flip(state);
}

export const unflipAction = a => (a.type === 'play' ? {...a, target: flipTarget(a.target ?? null)} : a);
export const actionFields = ({type, uid, target, uids, assignments, bottom}) =>
  Object.fromEntries(Object.entries({type, uid, target, uids, assignments, bottom}).filter(([, v]) => v !== undefined));

const list = x => (Array.isArray(x) ? x : []);
const ANY_ORDER = ['mulligan', 'keep', 'concede'];
export function applyAction(game, by, a) {
  if (by !== 0 && by !== 1) throw Error('Unknown player.');
  if (!ANY_ORDER.includes(a.type) && game.actor() !== by) throw Error('Wait for your turn to act.');
  switch (a.type) {
    case 'mulligan': return game.mulligan(by);
    case 'keep': return game.keep(list(a.bottom), by);
    case 'play': return game.play(by, a.uid, a.target ?? null);
    case 'pass': return game.pass(by);
    case 'attackers': return game.attackers(by, list(a.uids));
    case 'blockers': return game.blockers(by, a.assignments && typeof a.assignments === 'object' ? a.assignments : {});
    case 'discard': return game.discard(list(a.uids));
    case 'concede': return game.concede(by);
    default: throw Error('Unknown action.');
  }
}

const byCost = (a, b) => BY_ID[b.id].cost - BY_ID[a.id].cost;
export function timeoutAction(game, p) {
  const hand = game.players[p].hand;
  if (game.phase === 'opening') return {type: 'keep', bottom: [...hand].sort(byCost).slice(0, game.mulls[p]).map(c => c.uid)};
  if (game.phase === 'attack') return {type: 'attackers', uids: []};
  if (game.phase === 'block') return {type: 'blockers', assignments: {}};
  if (game.phase === 'cleanup') return {type: 'discard', uids: [...hand].sort(byCost).slice(0, hand.length - 7).map(c => c.uid)};
  return {type: 'pass'};
}

// Short per-section hashes let the audit say what diverged without storing every view.
export async function digest(view) {
  const [all, you, foe, table] = await Promise.all(
    [view, view.players[0], view.players[1], {...view, players: null}].map(x => sha256Hex(canonical(x))));
  return {all, you: you.slice(0, 12), foe: foe.slice(0, 12), table: table.slice(0, 12)};
}

// Mulligan bottoms are secret until the match ends: uids follow the public deck lists, so a host keep entry's
// `bottom` would tell the guest which cards the host put back. The guest gets only the count; `reveal`
// carries the uids (see hostBottoms), and the audit puts them back before replaying.
export const redactEntry = e => {
  if (!e || e.by !== 0 || e.type !== 'keep') return e;
  const {bottom, ...rest} = e;
  return {...rest, bottomCount: Array.isArray(bottom) ? bottom.length : 0};
};
// Commits the host to a bottom set before the guest learns it, salted with the still-secret host seed.
export const bottomCommit = (hostSecret, n, bottom) => sha256Hex(`${hostSecret}:${n}:${canonical(bottom ?? [])}`);
export const hostBottoms = log => Object.fromEntries(log.filter(e => e.by === 0 && e.type === 'keep').map(e => [e.n, e.bottom ?? []]));
// Returns the full log, or null when a revealed bottom does not fit the count the guest saw live.
export function restoreBottoms(log, bottoms) {
  const out = [];
  for (const e of log) {
    if (!e || typeof e !== 'object' || !Object.hasOwn(e, 'bottomCount')) { out.push(e); continue; }
    const {bottomCount, bottomCommit: _, ...rest} = e;
    const bottom = bottoms && Object.hasOwn(bottoms, e.n) ? bottoms[e.n] : bottomCount === 0 ? [] : null;
    if (!Array.isArray(bottom) || bottom.length !== bottomCount || !bottom.every(Number.isInteger)) return null;
    out.push({...rest, bottom});
  }
  return out;
}

// The guest renders what the host sends, so a view is checked against the exact shape viewFor produces
// before it is used. Anything else (markup in a string, an unknown card, a prototype key) throws.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);
export function safeKeys(value, depth = 0) {
  if (depth > 32) throw Error('Invalid message: too deep.');
  if (Array.isArray(value)) { for (const x of value) safeKeys(x, depth + 1); return value; }
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
const LESSONS = new Set(CARDS.map(c => JSON.stringify([c.name, c.lesson, c.faction])));
const VIEW_KEYS = ['active', 'attacks', 'blocks', 'events', 'first', 'kept', 'log', 'mode', 'mulls', 'passes', 'phase', 'players', 'priority', 'reason', 'stack', 'turn', 'uid', 'winner'];
const PLAYER_KEYS = ['deck', 'faction', 'field', 'grave', 'hand', 'landPlayed', 'life'];
const CARD_KEYS = ['bp', 'bt', 'damage', 'id', 'sick', 'tapped', 'uid'];
const MAX_TEXT = 500, MAX_LOG = 200, MAX_ZONE = 200, MAX_EVENTS = 1000;
export function sanitizeView(view) {
  const fail = what => { throw Error(`Invalid view: ${what}.`); };
  const obj = (v, keys, what) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(what);
    const own = Object.keys(v).sort();
    if (own.length !== keys.length || own.some((k, i) => k !== keys[i])) fail(`${what} fields`);
    return v;
  };
  const arr = (v, what, max = MAX_ZONE) => { if (!Array.isArray(v) || v.length > max) fail(what); return v; };
  const int = (v, what, min = 0) => { if (!Number.isInteger(v) || v < min) fail(what); return v; };
  const num = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(what); return v; };
  const bool = (v, what) => { if (typeof v !== 'boolean') fail(what); return v; };
  // The engine's own notes never contain angle brackets; a host that sends some is trying to inject markup.
  const text = (v, what) => { if (typeof v !== 'string' || v.length > MAX_TEXT || /[<>]/.test(v)) fail(what); return v; };
  const seat = (v, what) => { if (v !== 0 && v !== 1) fail(what); return v; };
  const isHidden = c => !!c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 1 && c.hidden === true;
  const card = (c, what) => {
    obj(c, CARD_KEYS, what);
    if (typeof c.id !== 'string' || !Object.hasOwn(BY_ID, c.id)) fail(`${what} id`);
    int(c.uid, `${what} uid`, 1); bool(c.tapped, what); bool(c.sick, what);
    num(c.damage, what); num(c.bp, what); num(c.bt, what);
  };
  const hiddenCard = (c, what) => { if (!isHidden(c)) fail(what); };

  safeKeys(view);
  obj(view, VIEW_KEYS, 'view');
  if (view.mode !== 'versus') fail('mode');
  seat(view.first, 'first'); seat(view.active, 'active'); seat(view.priority, 'priority');
  if (view.winner !== null && view.winner !== 'draw') seat(view.winner, 'winner');
  if (typeof view.phase !== 'string' || !Object.hasOwn(PHASE_NAMES, view.phase)) fail('phase');
  int(view.turn, 'turn', 1); int(view.passes, 'passes'); int(view.uid, 'uid');
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
  for (const s of arr(view.stack, 'stack')) {
    obj(s, ['card', 'p', 'target'], 'stack entry');
    card(s.card, 'stack card'); seat(s.p, 'stack player');
    const t = s.target;
    if (t === null) continue;
    if (t?.kind === 'player') { obj(t, ['kind', 'p'], 'target'); seat(t.p, 'target'); }
    else if (t?.kind === 'card' || t?.kind === 'spell') { obj(t, ['kind', 'uid'], 'target'); int(t.uid, 'target', 1); }
    else fail('target');
  }
  const players = arr(view.players, 'players', 2);
  if (players.length !== 2) fail('players');
  players.forEach((q, i) => {
    obj(q, PLAYER_KEYS, 'player');
    if (q.faction !== 'red' && q.faction !== 'blue') fail('faction');
    num(q.life, 'life'); bool(q.landPlayed, 'landPlayed');
    for (const c of arr(q.deck, 'deck')) hiddenCard(c, 'deck card');
    for (const c of arr(q.hand, 'hand')) (i === 1 ? hiddenCard : card)(c, 'hand card');
    for (const c of arr(q.field, 'field')) card(c, 'field card');
    for (const c of arr(q.grave, 'grave')) card(c, 'grave card');
  });
  if (players[0].faction === players[1].faction) fail('faction');
  return view;
}

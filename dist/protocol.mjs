// Shared by the host referee and the guest's audit, so both apply identical rules and redaction.
import {Game} from './engine.mjs';
import {BY_ID} from './cards.mjs';
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

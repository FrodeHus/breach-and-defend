// public/choices.mjs
// The state of a pending choice the player is answering (which cards go where, in what order, which targets),
// and the selection it becomes. Pure: the dialog renders it, and app.mjs sends the selection with game.choose.
import {BY_ID} from './cards.mjs';
import {abilityOf, checkTargets} from './rules.mjs';

// The probed cards, top first. A versus view sends them as pending.cards; a local game finds them in the deck.
export function choiceCards(game) {
  const c = game.pending;
  if (!c || c.kind !== 'probe') return [];
  if (c.cards) return c.cards;
  const deck = game.players[c.actor].deck;
  return c.options.map(uid => ({uid, id: deck.find(x => x.uid === uid)?.id}));
}
export const startChoice = pending => ({
  id: pending.id,
  kind: pending.kind,
  discard: [],
  order: ['probe', 'order'].includes(pending.kind) ? [...pending.options] : [],
  picks: {},
});
export function toggleChoice(game, st, uid) {
  const c = game.pending;
  if (c.kind === 'probe') {
    if (!c.options.includes(uid)) return st;
    return st.discard.includes(uid)
      ? {...st, discard: st.discard.filter(u => u !== uid)}
      : {...st, discard: [...st.discard, uid]};
  }
  if (c.kind === 'discard') {
    if (!c.options.includes(uid)) return st;
    const now = st.picks.discard ?? [];
    const next = now.includes(uid) ? now.filter(u => u !== uid) : now.length < c.min ? [...now, uid] : now;
    return {...st, picks: {...st.picks, discard: next}};
  }
  return st;
}
// Moves past cards set aside for discard, so ↑/↓ always changes the order of the kept cards.
export function moveChoice(st, value, delta) {
  const i = st.order.indexOf(value);
  let j = i + delta;
  while (j >= 0 && j < st.order.length && st.discard.includes(st.order[j])) j += delta;
  if (i < 0 || j < 0 || j >= st.order.length) return st;
  const order = [...st.order];
  [order[i], order[j]] = [order[j], order[i]];
  return {...st, order};
}
export function pickChoiceTarget(game, st, key, index) {
  const spec = game.pending.options.find(o => o.key === key);
  if (!spec?.candidates[index]) return st;
  const now = st.picks[key] ?? [],
    max = spec.upTo || 1;
  const next = now.includes(index)
    ? now.filter(i => i !== index)
    : max === 1
      ? [index]
      : now.length < max
        ? [...now, index]
        : now;
  return {...st, picks: {...st.picks, [key]: next}};
}
export function choiceSelection(game, st) {
  const c = game.pending;
  switch (c.kind) {
    case 'probe':
      return {discard: [...st.discard], order: st.order.filter(u => !st.discard.includes(u))};
    case 'discard':
      return {uids: [...(st.picks.discard ?? [])]};
    case 'order':
      return {order: [...st.order]};
    case 'targets': {
      const targets = {};
      for (const o of c.options) {
        const chosen = (st.picks[o.key] ?? []).map(i => o.candidates[i]);
        if (o.upTo) targets[o.key] = chosen;
        else if (chosen.length) targets[o.key] = chosen[0];
      }
      return {targets};
    }
    default:
      return null;
  }
}
export function choiceReady(game, st) {
  const c = game.pending;
  if (c.kind === 'discard') return (st.picks.discard ?? []).length === c.min;
  if (c.kind === 'targets') {
    if (!c.options.every(o => o.optional || o.upTo || (st.picks[o.key] ?? []).length === 1)) return false;
    // The pending options carry only keys and candidates, so the engine's check runs against the trigger's own specs.
    const t = game.waiting?.find(x => x.id === c.data?.trigger);
    const specs = t && abilityOf(t.ability)?.targets;
    return !specs || !checkTargets(game, t.p, specs, choiceSelection(game, st).targets);
  }
  return ['probe', 'order'].includes(c.kind);
}
export const cardName = id => BY_ID[id]?.name ?? 'Hidden card';

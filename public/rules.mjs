// Expansion rules as data. Cards describe targets, costs and effect steps as plain objects, and these functions
// read them. A resolving effect is a frame of plain JSON, so it can pause for a choice, be saved, and resume.
import {BY_ID} from './cards.mjs';

const data = c => BY_ID[c.id];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Operations and Responses written as rules; First Breach ones use `effect`/`target` instead.
export const isRule = d => !!(d.steps || d.modes);

export function abilityOf({card, id}) {
  return BY_ID[card].abilities.find(a => a.id === id);
}

// The targets and steps a spell uses for its chosen mode and Overclock.
export function spellRule(d, {mode = null, overclock = false} = {}) {
  const base = d.modes ? d.modes[mode] : d;
  let targets = base.targets ?? [],
    steps = base.steps ?? [];
  if (overclock) {
    const o = d.overclock;
    targets = o.instead ? (o.targets ?? targets) : [...targets, ...(o.targets ?? [])];
    steps = o.instead ? o.steps : [...steps, ...o.steps];
  }
  return {targets, steps};
}
// The rules an entry on the stack follows.
export function ruleOf(entry) {
  if (entry.ability) {
    const a = abilityOf(entry.ability);
    return {targets: a.targets ?? [], steps: a.steps};
  }
  return spellRule(data(entry.card), entry.opts);
}

export function candidates(g, p, spec) {
  if (spec.zone === 'stack')
    return g.stack
      .filter(s => s.card && spec.types.includes(data(s.card).type))
      .map(s => ({kind: 'spell', uid: s.card.uid}));
  const sides = spec.side === 'you' ? [p] : spec.side === 'opponent' ? [1 - p] : [0, 1];
  const zone = spec.zone === 'grave' ? 'grave' : 'field';
  return sides.flatMap(q =>
    g.players[q][zone]
      .filter(
        c =>
          (!spec.types || spec.types.includes(data(c).type)) && (spec.maxCost == null || data(c).cost <= spec.maxCost),
      )
      .map(c => ({kind: 'card', uid: c.uid})),
  );
}
const legalTarget = (g, p, spec, t) => candidates(g, p, spec).some(c => same(c, t));

// Checks targets chosen when casting or activating. Returns what is wrong, or null.
export function checkTargets(g, p, specs, chosen) {
  if (!chosen || typeof chosen !== 'object' || Array.isArray(chosen)) return 'Choose a legal target.';
  for (const k of Object.keys(chosen)) if (!specs.some(s => s.key === k)) return 'Choose a legal target.';
  for (const spec of specs) {
    const v = chosen[spec.key];
    if (spec.upTo) {
      const list = v ?? [];
      if (
        !Array.isArray(list) ||
        list.length > spec.upTo ||
        new Set(list.map(t => JSON.stringify(t))).size !== list.length
      )
        return `Choose up to ${spec.upTo} targets.`;
      if (!list.every(t => legalTarget(g, p, spec, t))) return 'Choose legal targets.';
      if (spec.onePlayer && new Set(list.map(t => g.find(t.uid)?.p)).size > 1)
        return 'Choose cards from a single player’s discard.';
    } else if (v == null) {
      if (!spec.optional) return 'Choose a legal target.';
    } else if (!legalTarget(g, p, spec, v)) return 'Choose a legal target.';
  }
  return null;
}

// On resolution: keeps the targets that are still legal. `fizzled` when targets were chosen and none remain.
export function recheck(g, p, specs, chosen = {}) {
  const targets = {};
  let chose = false,
    left = false;
  for (const spec of specs) {
    const v = chosen[spec.key];
    if (v == null) continue;
    const list = spec.upTo ? v : [v];
    if (list.length) chose = true;
    const ok = list.filter(t => legalTarget(g, p, spec, t));
    if (ok.length) left = true;
    if (spec.upTo) targets[spec.key] = ok;
    else if (ok.length) targets[spec.key] = ok[0];
  }
  return {targets, fizzled: chose && !left};
}

// The cards a step acts on: a target key, or 'self' for the entry's own source (wherever it is now).
export function refs(g, frame, to) {
  if (to === 'self') {
    const f = g.find(frame.self);
    return f ? [f] : [];
  }
  const v = frame.targets[to];
  const list = v == null ? [] : Array.isArray(v) ? v : [v];
  return list.map(t => g.find(t.uid)).filter(Boolean);
}
const onField = (g, frame, to) => refs(g, frame, to).filter(x => x.zone === 'field');

// Effect steps. Each returns true when it paused for a choice (see CHOICES); the frame resumes after it.
export const OPS = {
  createToken: (g, f, s) => {
    for (let i = 0; i < (s.n ?? 1); i++) g.createToken(f.p, s.token);
  },
  draw: (g, f, s) => void g.draw(f.p, s.n),
  heal: (g, f, s) => {
    g.players[f.p].life += s.n;
  },
  damage: (g, f, s) => {
    for (const x of onField(g, f, s.to)) x.card.damage += s.amount;
  },
  damageAll: (g, f, s) => {
    for (const q of g.players) for (const c of q.field) if (data(c).type === 'Unit') c.damage += s.amount;
  },
  damageOpponent: (g, f, s) => void g.hurt(1 - f.p, s.n, f.source, f.p),
  buff: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) {
      card.bp += s.power ?? 0;
      card.bt += s.toughness ?? 0;
      if (s.keywords) card.kw = [...new Set([...(card.kw ?? []), ...s.keywords])];
    }
  },
  tap: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) {
      card.tapped = true;
      if (s.lock) card.locked = true;
    }
  },
  untap: (g, f, s) => {
    for (const {card} of onField(g, f, s.to)) card.tapped = false;
  },
  destroy: (g, f, s) => {
    for (const x of onField(g, f, s.to)) g.remove(x.p, x.card);
  },
  bounce: (g, f, s) => {
    for (const x of onField(g, f, s.to)) g.bounce(x.p, x.card);
  },
  archive: (g, f, s) => {
    for (const x of refs(g, f, s.to)) if (x.zone === 'grave') g.archiveCard(x.p, x.card);
  },
};

// Permanents you could retire for a cost: {types?, id?, other?}; `other` excludes the card paying it.
export const retireOptions = (g, p, spec, sourceUid = null) =>
  g.players[p].field.filter(
    c =>
      (!spec.types || spec.types.includes(data(c).type)) &&
      (!spec.id || c.id === spec.id) &&
      !(spec.other && c.uid === sourceUid),
  );
export const archiveOptions = (g, p, spec) =>
  g.players[p].grave.filter(c => !spec.types || spec.types.includes(data(c).type));
// Every card uid named in a chosen-targets object.
export const pickedTargets = chosen =>
  Object.values(chosen ?? {})
    .flatMap(v => (Array.isArray(v) ? v : [v]))
    .map(t => t?.uid)
    .filter(u => u != null);

// When a triggered ability triggers: (event, source card, its controller, ability) → boolean.
export const ON = {
  enter: (e, c) => e.type === 'enter' && e.uid === c.uid,
  defeated: (e, c) => e.type === 'defeated' && e.uid === c.uid,
  block: (e, c) => e.type === 'block' && e.uid === c.uid,
  hitsOpponent: (e, c) => e.type === 'combatDamage' && e.uid === c.uid,
  yourUnitsHit: (e, c, p) => e.type === 'combatDamage' && e.p === p,
  youRetire: (e, c, p, a) =>
    e.type === 'retire' &&
    e.p === p &&
    (!a.what?.types || a.what.types.includes(e.cardType)) &&
    (!a.what?.id || e.id === a.what.id),
  youCastFromGrave: (e, c, p) => e.type === 'cast' && e.p === p && e.fromGrave,
  opponentSecondCast: (e, c, p) => e.type === 'cast' && e.p !== p && e.count === 2,
  yourEndStep: (e, c, p) => e.type === 'endStep' && e.p === p,
};

// Targets a trigger can take without asking: none needed, or exactly one choice for each required target.
export function autoTargets(g, p, specs) {
  const targets = {};
  for (const spec of specs) {
    const options = candidates(g, p, spec);
    if (spec.optional || spec.upTo) {
      if (options.length) return 'choose';
      if (spec.upTo) targets[spec.key] = [];
    } else if (!options.length) return 'none';
    else if (options.length > 1) return 'choose';
    else targets[spec.key] = options[0];
  }
  return targets;
}

// Applies a selection to the pending choice `c`. Each throws before changing anything if the selection is wrong.
export const CHOICES = {
  order(g, c, sel) {
    const order = sel.order;
    if (
      !Array.isArray(order) ||
      order.length !== c.options.length ||
      new Set(order).size !== order.length ||
      !order.every(id => c.options.includes(id))
    )
      throw Error('Put every ability in order.');
    const chosen = order.map(id => ({...g.waiting.find(t => t.id === id), ordered: true}));
    g.waiting = [...chosen, ...g.waiting.filter(t => !order.includes(t.id))];
  },
  targets(g, c, sel) {
    const t = g.waiting.find(x => x.id === c.data.trigger);
    const problem = checkTargets(g, t.p, abilityOf(t.ability).targets ?? [], sel.targets ?? {});
    if (problem) throw Error(problem);
    t.targets = structuredClone(sel.targets ?? {});
  },
};

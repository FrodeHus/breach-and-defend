// public/prepare.mjs
// How a player can cast a card or activate an ability right now, as data the interface renders: each way with its
// total cost, what blocks it, and the choices (targets and cost cards) it needs. Nothing here changes the game.
import {BY_ID} from './cards.mjs';
import {archiveOptions, candidates, isRule, retireOptions, spellRule} from './rules.mjs';

const targetSelector = (game, p, spec) => ({
  key: spec.key,
  kind: 'target',
  label: spec.upTo ? `Choose up to ${spec.upTo}` : spec.optional ? 'Choose a target (optional)' : 'Choose a target',
  min: spec.upTo || spec.optional ? 0 : 1,
  max: spec.upTo || 1,
  many: !!spec.upTo,
  candidates: candidates(game, p, spec).map(t => ({...t, label: game.targetName(t)})),
});
const cardSelector = (game, kind, cards) => ({
  key: kind,
  kind,
  label: kind === 'retire' ? 'Retire as a cost' : 'Archive as a cost',
  min: 1,
  max: 1,
  many: false,
  candidates: cards.map(c => ({kind: 'card', uid: c.uid, label: BY_ID[c.id].name})),
});
// A way the player can't complete says why, even when the engine would only object once targets are chosen.
function explain(way) {
  if (!way.issues.some(i => i.code === 'target') && way.selectors.some(s => s.min > 0 && !s.candidates.length))
    way.issues.push({code: 'target', message: 'There is no legal choice for this way.'});
  return way;
}

export function castWays(game, p, c, zone = 'hand') {
  const d = BY_ID[c.id];
  if (!isRule(d)) return [];
  const reuse = zone === 'grave';
  const modes = d.modes ? d.modes.map((m, i) => [i, m.label]) : [[null, null]];
  const ways = [];
  for (const [mode, modeLabel] of modes)
    for (const overclock of d.overclock ? [false, true] : [false]) {
      const options = {
        ...(mode != null ? {mode} : {}),
        ...(overclock ? {overclock: true} : {}),
        ...(reuse ? {reuse: true} : {}),
      };
      const rule = spellRule(d, {mode, overclock});
      const selectors = rule.targets.map(spec => targetSelector(game, p, spec));
      if (d.extraCost?.retire) selectors.push(cardSelector(game, 'retire', retireOptions(game, p, d.extraCost.retire)));
      ways.push(
        explain({
          key: `${mode ?? 'base'}-${overclock ? 'overclock' : 'standard'}${reuse ? '-reuse' : ''}`,
          label:
            [modeLabel, d.overclock ? (overclock ? 'Overclocked' : 'Standard') : null, reuse ? 'Reuse' : null]
              .filter(Boolean)
              .join(' · ') || 'Cast',
          options,
          totalCost: game.costOf(d, options),
          issues: game.playIssues(p, c, options),
          selectors,
        }),
      );
    }
  return ways;
}

export function abilityWays(game, p, c) {
  const d = BY_ID[c.id];
  return (d.abilities ?? [])
    .filter(a => a.kind === 'activated')
    .map(a => {
      const cost = a.cost ?? {};
      const selectors = (a.targets ?? []).map(spec => targetSelector(game, p, spec));
      if (cost.retire && cost.retire !== 'self')
        selectors.push(cardSelector(game, 'retire', retireOptions(game, p, cost.retire, c.uid)));
      if (cost.archive) selectors.push(cardSelector(game, 'archive', archiveOptions(game, p, cost.archive)));
      return explain({
        key: a.id,
        abilityId: a.id,
        label: a.label,
        options: {},
        totalCost: cost.compute ?? 0,
        issues: game.activationIssues(p, c.uid, a.id),
        selectors,
      });
    });
}

// Picks are candidate indexes per selector. A single-choice selector replaces its pick; a multi one toggles within max.
export function togglePick(way, picks, key, index) {
  const sel = way.selectors.find(s => s.key === key);
  if (!sel || !sel.candidates[index]) return picks;
  const now = picks[key] ?? [];
  const next = now.includes(index)
    ? now.filter(i => i !== index)
    : sel.max === 1
      ? [index]
      : now.length < sel.max
        ? [...now, index]
        : now;
  return {...picks, [key]: next};
}
export const ready = (way, picks) =>
  !way.issues.length &&
  way.selectors.every(s => (picks[s.key] ?? []).length >= s.min && (picks[s.key] ?? []).length <= s.max);
export function toOptions(way, picks) {
  const targets = {},
    costUids = [];
  for (const s of way.selectors) {
    const chosen = (picks[s.key] ?? []).map(i => s.candidates[i]).map(({kind, uid}) => ({kind, uid}));
    if (s.kind === 'target') {
      if (s.many) targets[s.key] = chosen;
      else if (chosen.length) targets[s.key] = chosen[0];
    } else costUids.push(...chosen.map(t => t.uid));
  }
  return {...way.options, targets, costUids};
}

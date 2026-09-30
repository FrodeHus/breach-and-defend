// public/expansion-view.mjs
// Interface markup for the expansion's rules: stack entries, preparing a cast or activation, pending choices,
// card-dialog actions and the archive. Pure strings, so it can be tested without a browser.
import {esc} from './html.mjs';
import {BY_ID} from './cards.mjs';
import {card} from './card-view.mjs';
import {abilityWays, castWays} from './prepare.mjs';

const who = (s, p) => (p === 0 ? 'You' : s.versus ? 'Opponent' : 'Computer');

// Any stack entry. A First Breach spell renders exactly as it always has.
export function stackItem(s, e) {
  const {game} = s;
  const targets = e.opts
    ? Object.values(e.opts.targets ?? {})
        .flat()
        .map(t => game.targetName(t))
    : e.target
      ? [game.targetName(e.target)]
      : [];
  const tags = [e.ability && 'Ability', e.opts?.overclock && 'Overclocked', e.opts?.reuse && 'Reuse'].filter(Boolean);
  return `<div class="stack-item${e.ability ? ' ability' : ''}"${e.card ? ` data-motion-uid="${e.card.uid}"` : ''}><strong>${esc(game.entryName(e))}</strong>${who(s, e.p)}${tags.length ? ` · ${tags.join(' · ')}` : ''}${targets.length ? ' → ' + targets.map(esc).join(', ') : ''}</div>`;
}

// The battlefield row: identical tokens in a labelled group with a count; every card keeps its own button.
export function tokenGroups(s, cards, p) {
  const out = [];
  for (let i = 0; i < cards.length;) {
    const c = cards[i],
      d = BY_ID[c.id];
    let j = i + 1;
    if (d.token) while (j < cards.length && cards[j].id === c.id) j++;
    const run = cards.slice(i, j);
    out.push(
      run.length > 1
        ? `<div class="token-group" role="group" aria-label="${run.length} ${esc(d.name)} tokens"><span class="token-count" aria-hidden="true">×${run.length}</span>${run.map(x => card(s, x, {zone: 'field', p})).join('')}</div>`
        : card(s, c, {zone: 'field', p}),
    );
    i = j;
  }
  return out.join('');
}

const reason = issues => (issues.length ? `<small class="action-reason">${esc(issues[0].message)}</small>` : '');
// Buttons for what the player can do with this card beyond casting it from hand: abilities, and Reuse.
export function cardActions(s, c, zone) {
  const {game} = s;
  if (!game || !c?.uid) return '';
  if (zone === 'field' && game.players[0].field.some(x => x.uid === c.uid)) {
    const ways = abilityWays(game, 0, c);
    if (!ways.length) return '';
    return `<div class="card-actions" aria-label="Abilities">${ways
      .map(
        w =>
          `<button class="primary" data-ability="${w.abilityId}" ${w.issues.length ? 'disabled' : ''}>${esc(w.label)} · ${w.totalCost} compute</button>${reason(w.issues)}`,
      )
      .join('')}</div>`;
  }
  if (zone === 'grave' && game.players[0].grave.some(x => x.uid === c.uid)) {
    const ways = castWays(game, 0, c, 'grave');
    if (!ways.length || BY_ID[c.id].reuse == null) return '';
    const cheapest = Math.min(...ways.map(w => w.totalCost)),
      usable = ways.some(w => !w.issues.length);
    return `<div class="card-actions"><button class="primary" id="reuse" ${usable ? '' : 'disabled'}>Reuse · ${cheapest} compute</button>${usable ? '' : reason(ways[0].issues)}</div>`;
  }
  return '';
}

export function archiveDialog(s, p) {
  const {game} = s;
  const cards = game.players[p].archive ?? [];
  return `<h2>${p === 0 ? 'Your' : 'Opponent’s'} archive</h2><p class="muted">Archived cards are out of the game for good. Nothing returns them.</p><div class="grid">${cards.map(c => card(s, c)).join('') || '<p>No archived cards.</p>'}</div>`;
}

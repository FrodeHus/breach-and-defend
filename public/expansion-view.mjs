// public/expansion-view.mjs
// Interface markup for the expansion's rules: stack entries, preparing a cast or activation, pending choices,
// card-dialog actions and the archive. Pure strings, so it can be tested without a browser.
import {esc} from './html.mjs';
import {BY_ID} from './cards.mjs';
import {card} from './card-view.mjs';
import {abilityWays, castWays, ready} from './prepare.mjs';

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

const reason = (id, issues) =>
  issues.length ? `<small class="action-reason" id="${id}">${esc(issues[0].message)}</small>` : '';
// Buttons for what the player can do with this card beyond casting it from hand: abilities, and Reuse.
export function cardActions(s, c, zone) {
  const {game} = s;
  if (!game || !c?.uid) return '';
  if (zone === 'field' && game.players[0].field.some(x => x.uid === c.uid)) {
    const ways = abilityWays(game, 0, c);
    if (!ways.length) return '';
    return `<div class="card-actions" role="group" aria-label="Abilities">${ways
      .map(w => {
        const rid = `reason-${w.abilityId}`;
        return `<button class="primary" data-ability="${w.abilityId}" ${w.issues.length ? `disabled aria-describedby="${rid}"` : ''}>${esc(w.label)} · ${w.totalCost} compute</button>${reason(rid, w.issues)}`;
      })
      .join('')}</div>`;
  }
  if (zone === 'grave' && game.players[0].grave.some(x => x.uid === c.uid)) {
    const ways = castWays(game, 0, c, 'grave');
    if (!ways.length || BY_ID[c.id].reuse == null) return '';
    const cheapest = ways.reduce((a, w) => (w.totalCost < a.totalCost ? w : a)),
      usable = ways.some(w => !w.issues.length);
    return `<div class="card-actions"><button class="primary" id="reuse" ${usable ? '' : 'disabled aria-describedby="reason-reuse"'}>Reuse · ${cheapest.totalCost} compute</button>${usable ? '' : reason('reason-reuse', cheapest.issues)}</div>`;
  }
  return '';
}

export function archiveDialog(s, p) {
  const {game} = s;
  const cards = game.players[p].archive ?? [];
  return `<h2>${p === 0 ? 'Your' : 'Opponent’s'} archive</h2><p class="muted">Archived cards are out of the game for good. Nothing returns them.</p><div class="grid">${cards.map(c => card(s, c)).join('') || '<p>No archived cards.</p>'}</div>`;
}

const costText = (way, ability) =>
  `${way.totalCost} compute${ability?.cost?.tap ? ', tap' : ''}${ability?.cost?.retire === 'self' ? ', retire this' : ''}`;
// Choosing how to cast or activate: a way, then its targets and cost cards. Nothing is spent until Confirm.
export function prepDialog(s, prep) {
  const {game} = s;
  const found = game.find(prep.uid),
    d = BY_ID[found?.card.id ?? ''] ?? {};
  const ability = prep.kind === 'activate' ? d.abilities?.find(a => a.id === prep.ways[0]?.abilityId) : null;
  const way = prep.way == null ? null : prep.ways[prep.way];
  const ways =
    prep.kind === 'activate'
      ? ''
      : `<div class="prep-ways" role="group" aria-label="How to cast">${prep.ways
          .map((w, i) => {
            const rid = `reason-way-${i}`;
            return `<div class="prep-way"><button data-way="${i}" aria-pressed="${prep.way === i}" ${w.issues.length ? `disabled aria-describedby="${rid}"` : ''}>${esc(w.label)} — ${w.totalCost} compute</button>${reason(rid, w.issues)}</div>`;
          })
          .join('')}</div>`;
  const selectors = way
    ? way.selectors
        .map(
          sel =>
            `<fieldset class="prep-selector"><legend>${esc(sel.label)}</legend>${
              sel.candidates.length
                ? sel.candidates
                    .map(
                      (c, i) =>
                        `<button data-pick="${esc(sel.key)}:${i}" aria-pressed="${(prep.picks[sel.key] ?? []).includes(i)}">${esc(c.label)}</button>`,
                    )
                    .join('')
                : '<p class="muted">Nothing to choose.</p>'
            }</fieldset>`,
        )
        .join('')
    : '';
  const title =
    prep.kind === 'activate' && way ? `${esc(way.label)} — ${costText(way, ability)}` : `Cast ${esc(d.name ?? '')}`;
  const canConfirm = way && ready(way, prep.picks, game);
  const eyebrow = prep.kind === 'activate' ? 'ACTIVATE' : prep.zone === 'grave' ? 'REUSE FROM DISCARD' : 'CAST';
  return `<div class="eyebrow">${eyebrow} / ${esc((d.name ?? '').toUpperCase())}</div><h2>${title}</h2><p class="muted">${esc(d.text ?? '')}</p>${ways}${way?.issues.length && prep.kind === 'activate' ? reason('reason-prep', way.issues) : ''}${selectors}<div class="toolbar"><button class="primary" id="prepConfirm" ${canConfirm ? '' : 'disabled'}>Confirm${way ? ` · ${way.totalCost} compute` : ''}</button><button id="prepCancel">Cancel</button></div>`;
}

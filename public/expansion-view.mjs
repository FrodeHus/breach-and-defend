// public/expansion-view.mjs
// Interface markup for the expansion's rules: stack entries, preparing a cast or activation, pending choices,
// card-dialog actions and the archive. Pure strings, so it can be tested without a browser.
import {esc} from './html.mjs';

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

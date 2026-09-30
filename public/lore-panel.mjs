import {esc} from './html.mjs';
const FLIP_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LABELS = {flavor:'Show learning text', learn:'Show flavor text'};

// Both faces are rendered so a flip only swaps visibility; the chosen side is remembered across cards and re-renders.
export function lorePanel(d, side = 'flavor') {
  const learn = side === 'learn';
  return `<section class="lore ${d.faction}" data-side="${learn ? 'learn' : 'flavor'}" aria-label="${esc(d.name)} story and lesson"><div class="lore-inner"><figure class="lore-face lore-flavor" ${learn ? 'hidden' : ''}><blockquote>“${esc(d.flavor)}”</blockquote><figcaption>— ${esc(d.flavorBy)}</figcaption></figure><div class="lore-face lore-learn" ${learn ? '' : 'hidden'}><div class="eyebrow">LEARN / WHAT IS IT?</div><p>${esc(d.lesson)}</p></div></div><button type="button" class="lore-flip" aria-label="${LABELS[learn ? 'learn' : 'flavor']}" title="${LABELS[learn ? 'learn' : 'flavor']}">${FLIP_ICON}<span>${learn ? 'Flavor' : 'Learn'}</span></button></section>`;
}

export function installLoreFlip({onFlip}) {
  document.addEventListener('click', e => {
    const button = e.target instanceof Element ? e.target.closest('.lore-flip') : null;
    const panel = button?.closest('.lore');
    if (!panel || panel.dataset.flipping) return;
    const next = panel.dataset.side === 'learn' ? 'flavor' : 'learn';
    onFlip(next);
    const swap = () => {
      panel.dataset.side = next;
      panel.querySelector('.lore-flavor').hidden = next === 'learn';
      panel.querySelector('.lore-learn').hidden = next !== 'learn';
      button.setAttribute('aria-label', LABELS[next]);
      button.title = LABELS[next];
      button.querySelector('span').textContent = next === 'learn' ? 'Flavor' : 'Learn';
    };
    const inner = panel.querySelector('.lore-inner');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !inner.animate) { swap(); return; }
    panel.dataset.flipping = '1';
    const half = {duration:140, easing:'ease-in', fill:'forwards'};
    const out = inner.animate([{transform:'rotateY(0)'}, {transform:'rotateY(90deg)'}], half);
    let back = null;
    out.finished.then(() => {
      swap();
      back = inner.animate([{transform:'rotateY(-90deg)'}, {transform:'rotateY(0)'}], {...half, easing:'ease-out'});
      return back.finished;
    }).catch(swap).finally(() => { out.cancel(); back?.cancel(); delete panel.dataset.flipping; });
  });
}

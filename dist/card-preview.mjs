const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function previewPosition(anchor, size, viewport) {
  const margin = 12, gap = 10;
  const above = anchor.top - size.height - gap;
  const below = anchor.top + anchor.height + gap;
  const top = above >= margin ? above
    : below + size.height <= viewport.height - margin ? below
    : clamp(above, margin, viewport.height - size.height - margin);
  return {
    left: clamp(anchor.left + anchor.width / 2 - size.width / 2, margin, viewport.width - size.width - margin),
    top,
  };
}

// A separate layer avoids clipping by the scrolling hand and never changes its layout.
export function installCardPreview({root, renderCard, canShow}) {
  const panel = document.createElement('div');
  panel.id = 'cardHoverPreview';
  panel.className = 'card-hover-preview';
  panel.setAttribute('role', 'tooltip');
  panel.hidden = true;
  document.body.append(panel);
  let source = null, animation = null, hideTimer = null, pointer = null, suppressed = null;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const eligible = node => {
    const el = node instanceof Element ? node.closest('[data-card]') : null;
    return el && root.contains(el) && el.matches('.hand [data-card], .opening-hand [data-card], #libraryGrid [data-card]') ? el : null;
  };
  function unlink() {
    if (!source) return;
    source.classList.remove('preview-source');
    const ids = (source.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== panel.id);
    if (ids.length) source.setAttribute('aria-describedby', ids.join(' '));
    else source.removeAttribute('aria-describedby');
  }
  function dismiss(immediate = false) {
    clearTimeout(hideTimer);
    animation?.cancel();
    const old = source;
    unlink(); source = null;
    if (panel.hidden) return;
    if (immediate || reduced() || !old?.isConnected) { panel.hidden = true; return; }
    const a = old.getBoundingClientRect(), b = panel.getBoundingClientRect();
    const closing = panel.animate([
      {transform:'none', opacity:1},
      {transform:`translate(${a.left+a.width/2-b.left-b.width/2}px, ${a.top+a.height/2-b.top-b.height/2}px) scale(${Math.min(1,a.width/b.width)})`, opacity:0},
    ], {duration:120,easing:'ease-out',fill:'both'});
    animation = closing;
    closing.finished.then(() => { if (animation === closing) { panel.hidden = true; closing.cancel(); } }).catch(() => {});
  }
  function show(el) {
    clearTimeout(hideTimer);
    if (!el || el === suppressed || !canShow()) return;
    if (source === el && !panel.hidden) return;
    dismiss(true);
    source = el;
    const html = renderCard(el);
    if (!html) { source = null; return; }
    panel.innerHTML = html;
    panel.hidden = false;
    source.classList.add('preview-source');
    source.setAttribute('aria-describedby', [...new Set((source.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).concat(panel.id))].join(' '));
    const a = source.getBoundingClientRect(), size = panel.getBoundingClientRect();
    const p = previewPosition(a, size, {width:document.documentElement.clientWidth,height:window.innerHeight});
    panel.style.left = `${p.left}px`; panel.style.top = `${p.top}px`;
    if (!reduced()) animation = panel.animate([
      {transform:`translate(${a.left+a.width/2-p.left-size.width/2}px, ${a.top+a.height/2-p.top-size.height/2}px) scale(${Math.min(1,a.width/size.width)})`,opacity:0},
      {transform:'none',opacity:1},
    ], {duration:180,easing:'cubic-bezier(.2,.75,.25,1)'});
  }
  function deferHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!panel.matches(':hover') && !source?.matches(':hover') && !(source === document.activeElement && source?.matches(':focus-visible'))) dismiss();
    }, 130);
  }
  root.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    pointer = {x:e.clientX,y:e.clientY};
    const el = eligible(e.target);
    if (el !== suppressed) suppressed = null;
    if (el) show(el); else deferHide();
  });
  root.addEventListener('pointerout', e => {
    if (source?.contains(e.target) && !source.contains(e.relatedTarget) && !panel.contains(e.relatedTarget)) deferHide();
  });
  root.addEventListener('focusin', e => {
    const el = eligible(e.target);
    if (el !== suppressed) suppressed = null;
    if (el?.matches(':focus-visible')) show(el);
  });
  root.addEventListener('focusout', deferHide);
  panel.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  panel.addEventListener('pointerleave', deferHide);
  panel.addEventListener('click', () => { const el = source; dismiss(true); el?.click(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && source) { suppressed = source; dismiss(); }
  });
  document.addEventListener('pointerdown', e => {
    if (!panel.contains(e.target)) dismiss(true);
    if (e.pointerType === 'touch') pointer = null;
  }, true);
  document.addEventListener('scroll', e => { if (!panel.contains(e.target)) { pointer = null; dismiss(true); } }, true);
  window.addEventListener('resize', () => { pointer = null; dismiss(true); });
  window.addEventListener('blur', () => { pointer = null; dismiss(true); });
  return {
    dismiss,
    refresh() {
      const focused = eligible(document.activeElement);
      const hovered = pointer ? eligible(document.elementFromPoint(pointer.x, pointer.y)) : null;
      show(focused?.matches(':focus-visible') ? focused : hovered);
    },
  };
}

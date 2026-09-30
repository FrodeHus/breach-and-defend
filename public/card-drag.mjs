// Recheck at release: a drag never reserves resources or bypasses play rules.
export function dropHandCard(game, uid, play) {
  const card = game.players[0].hand.find(card => card.uid === uid);
  if (!card) return ['This card is no longer in your hand.'];
  const issues = game.playIssues(0, card).map(issue => issue.message);
  if (!issues.length) play(uid);
  return issues;
}

export function installCardDrag({root, previewSource, canStart, describe, onBusy, onDragStart, onDrop}) {
  let gesture = null,
    suppressClick = false;
  const status = document.createElement('div');
  status.className = 'card-drag-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.body.append(status);

  function finish(drop = false) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (g.dragging) suppressClick = true;
    g.source.classList.remove('card-drag-source');
    g.ghost?.remove();
    g.lane?.classList.remove('card-drop-ready', 'card-drop-blocked', 'card-drop-over');
    document.body.classList.remove('card-dragging');
    status.hidden = true;
    if (root.hasPointerCapture(g.pointerId)) root.releasePointerCapture(g.pointerId);
    // Clear the gesture before opening a dialog or rendering the played card.
    if (drop && g.dragging && g.over) onDrop(g.uid);
    onBusy(false);
  }
  document.addEventListener('pointerdown', e => {
    suppressClick = false;
    if (gesture || !e.isPrimary || e.button !== 0 || !canStart()) return;
    const source = e.target.closest('.hand [data-card][data-uid]') || previewSource(e.target);
    if (!source?.matches('.hand [data-card][data-uid]') || !root.contains(source)) return;
    gesture = {
      source,
      uid: Number(source.dataset.uid),
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      over: false,
    };
    onBusy(true);
  });
  document.addEventListener(
    'pointermove',
    e => {
      const g = gesture;
      if (!g || g.pointerId !== e.pointerId) return;
      if (!g.dragging) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < 8) return;
        g.dragging = true;
        onDragStart();
        root.setPointerCapture(e.pointerId);
        const rect = g.source.getBoundingClientRect();
        g.offsetX = Math.max(0, Math.min(rect.width, g.x - rect.left));
        g.offsetY = Math.max(0, Math.min(rect.height, g.y - rect.top));
        g.ghost = g.source.cloneNode(true);
        for (const el of [g.ghost, ...g.ghost.querySelectorAll('*')]) {
          for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('data-') || attr.name === 'id' || attr.name.startsWith('aria-'))
              el.removeAttribute(attr.name);
          }
        }
        g.ghost.className = g.source.className + ' card-drag-ghost';
        g.ghost.setAttribute('aria-hidden', 'true');
        g.ghost.inert = true;
        g.ghost.style.width = `${rect.width}px`;
        g.ghost.style.height = `${rect.height}px`;
        document.body.append(g.ghost);
        g.source.classList.add('card-drag-source');
        g.lane = root.querySelector('.your-lane');
        const issues = describe(g.uid);
        g.lane?.classList.add(issues.length ? 'card-drop-blocked' : 'card-drop-ready');
        status.textContent = issues.length
          ? `Cannot play: ${issues.join(' ')}`
          : 'Drop on your battlefield to play · Esc to cancel';
        status.hidden = false;
        document.body.classList.add('card-dragging');
      }
      e.preventDefault();
      g.ghost.style.left = `${e.clientX - g.offsetX}px`;
      g.ghost.style.top = `${e.clientY - g.offsetY}px`;
      g.over = !!g.lane?.contains(document.elementFromPoint(e.clientX, e.clientY));
      g.lane?.classList.toggle('card-drop-over', g.over);
    },
    {passive: false},
  );
  document.addEventListener('pointerup', e => {
    if (gesture?.pointerId !== e.pointerId) return;
    // Use the release location, even if the last move was over another area.
    gesture.over = !!gesture.lane?.contains(document.elementFromPoint(e.clientX, e.clientY));
    finish(true);
  });
  document.addEventListener('pointercancel', e => {
    if (gesture?.pointerId === e.pointerId) finish();
  });
  root.addEventListener('lostpointercapture', () => finish());
  root.addEventListener('dragstart', e => {
    if (gesture) e.preventDefault();
  });
  document.addEventListener(
    'click',
    e => {
      if (suppressClick && e.detail !== 0) {
        suppressClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && gesture) {
        e.preventDefault();
        finish();
      }
    },
    true,
  );
  // A new intentional press must never be swallowed after a canceled gesture.
  document.addEventListener(
    'pointerdown',
    () => {
      suppressClick = false;
    },
    true,
  );
  window.addEventListener('blur', () => finish());
  window.addEventListener('resize', () => finish());
  return {
    get busy() {
      return !!gesture;
    },
    cancel: () => finish(),
  };
}

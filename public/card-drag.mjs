// Recheck at release: a drag never reserves resources or bypasses play rules.
export function dropHandCard(game, uid, play) {
  const card = game.players[0].hand.find(card => card.uid === uid);
  if (!card) return ['This card is no longer in your hand.'];
  const issues = game.playIssues(0, card).map(issue => issue.message);
  if (!issues.length) play(uid);
  return issues;
}

// Shared by click and drag blocking; moves the blocker off any attacker it was already assigned to.
export function assignBlock(game, blocks, blockerUid, attackerUid) {
  const b = game.find(blockerUid),
    a = game.find(attackerUid);
  if (!game.attacks.includes(attackerUid) || a?.zone !== 'field') return ['Choose an attacking unit to block.'];
  if (b?.zone !== 'field' || b.p !== 0 || game.data(b.card).type !== 'Unit' || b.card.tapped)
    return ['Choose an untapped unit to block.'];
  if (!game.canBlock(b.card, a.card)) return ['Stealth attackers need a blocker with Stealth or Detection.'];
  for (const k in blocks) blocks[k] = blocks[k].filter(x => x !== blockerUid);
  (blocks[attackerUid] ??= []).push(blockerUid);
  return [];
}

// `block` (optional) enables dragging your battlefield units onto attackers:
// {canDrag(uid), attackers() → uids, check(blockerUid, attackerUid) → issues, onDrop(blockerUid, attackerUid)}.
export function installCardDrag({root, previewSource, canStart, describe, onBusy, onDragStart, onDrop, block}) {
  let gesture = null,
    suppressClick = false;
  const status = document.createElement('div');
  status.className = 'card-drag-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  document.body.append(status);

  const zoneAt = (g, e) => {
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    return g.zones.find(z => z.el.contains(hit)) || null;
  };
  function finish(drop = false) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    if (g.dragging) suppressClick = true;
    g.source.classList.remove('card-drag-source');
    g.ghost?.remove();
    for (const z of g.zones || []) z.el.classList.remove('card-drop-ready', 'card-drop-blocked', 'card-drop-over');
    document.body.classList.remove('card-dragging');
    status.hidden = true;
    if (root.hasPointerCapture(g.pointerId)) root.releasePointerCapture(g.pointerId);
    // Clear the gesture before opening a dialog or rendering the played card.
    if (drop && g.dragging && g.over) g.over.drop();
    onBusy(false);
  }
  document.addEventListener('pointerdown', e => {
    suppressClick = false;
    if (gesture || !e.isPrimary || e.button !== 0 || !canStart()) return;
    const source = e.target.closest('[data-card][data-uid]') || previewSource(e.target);
    if (!source || !root.contains(source)) return;
    const uid = Number(source.dataset.uid);
    let mode;
    if (source.matches('.hand [data-card]')) mode = 'play';
    else if (source.matches('.your-lane [data-card]') && block?.canDrag(uid)) mode = 'block';
    else return;
    gesture = {
      source,
      uid,
      mode,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      over: null,
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
        if (g.mode === 'play') {
          const lane = root.querySelector('.your-lane');
          const issues = describe(g.uid);
          g.zones = lane ? [{el: lane, issues, drop: () => onDrop(g.uid)}] : [];
          status.textContent = issues.length
            ? `Cannot play: ${issues.join(' ')}`
            : 'Drop on your battlefield to play · Esc to cancel';
        } else {
          // Every attacker is a zone; illegal ones are marked so a drop explains why it failed.
          g.zones = block.attackers().flatMap(attacker => {
            const el = root.querySelector(`.opponent-lane [data-uid="${attacker}"]`);
            return el ? [{el, issues: block.check(g.uid, attacker), drop: () => block.onDrop(g.uid, attacker)}] : [];
          });
          status.textContent = g.zones.some(z => !z.issues.length)
            ? 'Drop on an attacker to block · Esc to cancel'
            : `Cannot block: ${g.zones[0]?.issues.join(' ') || 'no attackers.'}`;
        }
        for (const z of g.zones) z.el.classList.add(z.issues.length ? 'card-drop-blocked' : 'card-drop-ready');
        status.hidden = false;
        document.body.classList.add('card-dragging');
      }
      e.preventDefault();
      g.ghost.style.left = `${e.clientX - g.offsetX}px`;
      g.ghost.style.top = `${e.clientY - g.offsetY}px`;
      g.over = zoneAt(g, e);
      for (const z of g.zones) z.el.classList.toggle('card-drop-over', z === g.over);
    },
    {passive: false},
  );
  document.addEventListener('pointerup', e => {
    if (gesture?.pointerId !== e.pointerId) return;
    // Use the release location, even if the last move was over another area.
    if (gesture.dragging) gesture.over = zoneAt(gesture, e);
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

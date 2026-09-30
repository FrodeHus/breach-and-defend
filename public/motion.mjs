// Visual transitions observe rules state; they never apply damage or move game cards.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
const nodes = () => [...document.querySelectorAll('#app [data-motion-uid]')];
const rect = el => el?.getBoundingClientRect();
const center = r => ({x: r.left + r.width / 2, y: r.top + r.height / 2});
// Waits for a promise, but never longer than ms. Resolves {done:true,value} or {done:false}; a rejection before the deadline propagates.
export function within(promise, ms, {schedule = setTimeout, cancel = clearTimeout} = {}) {
  let timer;
  const late = new Promise(resolve => {
    timer = schedule(() => resolve({done: false}), ms);
  });
  return Promise.race([Promise.resolve(promise).then(value => ({done: true, value})), late]).finally(() =>
    cancel(timer),
  );
}
// A background tab can leave an animation's `finished` unsettled until it next paints, so every wait is capped by a timer.
export function settle(animation, duration, slack = 400) {
  return within(
    animation.finished.catch(() => {}),
    duration + slack,
  );
}
// Nothing is visible to animate in a hidden tab.
const still = () => reduced() || document.hidden;
function animate(el, frames, duration) {
  const ms = reduced() ? 1 : duration;
  return settle(el.animate(frames, {duration: ms, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both'}), ms);
}
function ghost(item) {
  const el = item.el.cloneNode(true);
  el.removeAttribute('id');
  el.removeAttribute('data-motion-uid');
  el.removeAttribute('data-card');
  el.setAttribute('aria-hidden', 'true');
  el.classList.add('motion-ghost');
  Object.assign(el.style, {
    left: `${item.r.left}px`,
    top: `${item.r.top}px`,
    width: `${item.r.width}px`,
    height: `${item.r.height}px`,
    margin: '0',
    transform: 'none',
  });
  document.body.append(el);
  return el;
}
export function snapshot(game) {
  const cards = new Map();
  game.players.forEach((p, owner) =>
    ['hand', 'field', 'grave'].forEach(zone => p[zone].forEach(c => cards.set(c.uid, {zone, owner}))),
  );
  game.stack.forEach(s => cards.set(s.card.uid, {zone: 'stack', owner: s.p}));
  const visual = new Map(nodes().map(el => [Number(el.dataset.motionUid), {el, r: rect(el)}]));
  return {
    cards,
    visual,
    phase: game.phase,
    attacks: [...game.attacks],
    blocks: structuredClone(game.blocks),
    active: game.active,
    decks: [0, 1].map(p => rect($(`[data-player="${p}"] .deck-pile`))),
    graves: [0, 1].map(p => rect($(`[data-grave="${p}"]`))),
    players: [0, 1].map(p => rect($(`[data-player="${p}"]`))),
  };
}
async function impact(r) {
  if (!r) return;
  const p = center(r),
    ring = document.createElement('div');
  ring.className = 'impact-ring';
  ring.style.left = `${p.x}px`;
  ring.style.top = `${p.y}px`;
  document.body.append(ring);
  await animate(
    ring,
    [
      {transform: 'translate(-50%,-50%) scale(.2)', opacity: 1},
      {transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0},
    ],
    360,
  );
  ring.remove();
}
export async function combat(before, game) {
  if (before.phase !== 'afterBlock' || game.phase !== 'endCombat' || still()) return;
  await Promise.all(
    before.attacks.map(async uid => {
      const from = before.visual.get(uid);
      if (!from) return;
      const targets = (before.blocks[uid] || []).map(id => before.visual.get(id)).filter(Boolean);
      const destinations = targets.length ? targets : [{r: before.players[1 - before.active]}];
      const g = ghost(from);
      from.el.style.visibility = 'hidden';
      try {
        for (const target of destinations) {
          if (!target.r) continue;
          const a = center(from.r),
            b = center(target.r),
            x = b.x - a.x,
            y = b.y - a.y;
          await animate(
            g,
            [
              {transform: 'perspective(800px) translate3d(0,0,0) rotateX(0)'},
              {
                transform: `perspective(800px) translate3d(${x * 0.9}px,${y * 0.9}px,65px) rotateX(${y > 0 ? -14 : 14}deg) rotateZ(-4deg)`,
              },
            ],
            310,
          );
          await Promise.all([
            impact(target.r),
            target.el
              ? animate(
                  target.el,
                  [
                    {transform: 'translateX(0)'},
                    {transform: 'translateX(9px) rotate(4deg)'},
                    {transform: 'translateX(-5px)'},
                    {transform: 'translateX(0)'},
                  ],
                  260,
                )
              : Promise.resolve(),
          ]);
          await animate(
            g,
            [{transform: `translate(${x * 0.9}px,${y * 0.9}px) scale(1.06)`}, {transform: 'translate(0,0) scale(1)'}],
            220,
          );
        }
      } finally {
        g.remove();
        from.el.style.visibility = '';
      }
    }),
  );
}
async function depart(item, target, destroyed) {
  const g = ghost(item);
  try {
    if (destroyed) {
      const particles = Array.from({length: 18}, (_, i) => {
        const p = document.createElement('i');
        p.className = 'dissolve-particle';
        const x = item.r.left + (((i % 6) + 0.5) * item.r.width) / 6,
          y = item.r.top + ((Math.floor(i / 6) + 0.5) * item.r.height) / 3;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        document.body.append(p);
        return animate(
          p,
          [
            {opacity: 1, transform: 'translate(0,0) scale(1)'},
            {opacity: 0, transform: `translate(${((i % 5) - 2) * 27}px,${-45 - (i % 4) * 18}px) scale(0)`},
          ],
          640,
        ).then(() => p.remove());
      });
      await Promise.all([
        animate(
          g,
          [
            {opacity: 1, filter: 'brightness(1)', clipPath: 'inset(0 0 0 0)'},
            {offset: 0.4, opacity: 0.85, filter: 'brightness(2.7)', clipPath: 'inset(0 0 22% 0)'},
            {opacity: 0, filter: 'brightness(3) blur(5px)', clipPath: 'inset(0 0 100% 0)'},
          ],
          640,
        ),
        ...particles,
      ]);
    } else {
      const a = center(item.r),
        b = target ? center(target) : a;
      await animate(
        g,
        [
          {transform: 'perspective(700px) rotateY(0) scale(1)', opacity: 1},
          {
            offset: 0.45,
            transform: 'perspective(700px) rotateY(65deg) rotateZ(-18deg) scale(.55,.8)',
            filter: 'brightness(.65)',
            opacity: 1,
          },
          {
            transform: `perspective(700px) translate(${b.x - a.x}px,${b.y - a.y}px) rotateY(150deg) rotateZ(48deg) scale(.05,.12)`,
            opacity: 0,
          },
        ],
        650,
      );
    }
  } finally {
    g.remove();
  }
}
export async function transitions(before, game) {
  if (still()) return;
  const after = snapshot(game),
    jobs = [];
  for (const [uid, now] of after.cards) {
    const old = before.cards.get(uid),
      item = after.visual.get(uid);
    if (now.zone === 'grave' && old && old.zone !== 'grave') {
      let from = before.visual.get(uid);
      if (!from && old.zone === 'hand' && old.owner === 1 && before.players[1]) {
        const el = document.createElement('div');
        el.className = 'card hidden-card ' + game.players[old.owner].faction;
        const r = before.players[1];
        from = {el, r: {left: r.left + r.width / 2, top: r.top, width: 90, height: 125}};
      }
      if (from) jobs.push(depart(from, after.graves[now.owner], old.zone === 'field'));
    }
    if (item && (!old || old.zone !== now.zone) && now.zone !== 'grave') {
      const origin =
          before.visual.get(uid)?.r ||
          (now.zone === 'hand' ? before.decks?.[now.owner] : null) ||
          before.players[now.owner],
        a = center(item.r),
        b = origin ? center(origin) : {x: a.x - 90, y: a.y + 80};
      const g = ghost(item);
      item.el.style.visibility = 'hidden';
      g.classList.add('entry-card');
      const back = document.createElement('div');
      back.className = 'card-back ' + game.players[now.owner].faction;
      g.append(back);
      jobs.push(
        animate(
          g,
          [
            {
              transform: `perspective(850px) translate3d(${b.x - a.x}px,${b.y - a.y}px,0) rotateY(180deg) rotateZ(-10deg) scale(.7)`,
              opacity: 0,
            },
            {offset: 0.18, opacity: 1},
            {
              offset: 0.7,
              transform: 'perspective(850px) translate3d(0,-12px,70px) rotateY(20deg) rotateZ(2deg) scale(1.05)',
              opacity: 1,
            },
            {transform: 'perspective(850px) translate3d(0,0,0) rotateY(0) rotateZ(0) scale(1)', opacity: 1},
          ],
          620,
        ).finally(() => {
          g.remove();
          item.el.style.visibility = '';
        }),
      );
    }
  }
  await Promise.all(jobs);
}
let arrowFrame = 0;
const SVG = 'http://www.w3.org/2000/svg';
const SHIELD = 'M0 -10 L9 -6.5 V-0.5 C9 5 5 8.5 0 11 C-5 8.5 -9 5 -9 -0.5 V-6.5 Z';
// Circuit-board route: straight runs with 45° bends. Each blocker runs to its attacker's own bus line, so
// blockers of one attacker merge into a single trunk and different attackers never share a horizontal run.
export function blockTrace(from, to, busY) {
  const dir = Math.sign(to.y - from.y) || 1,
    sx = Math.sign(to.x - from.x),
    c = Math.min(10, Math.abs(to.x - from.x) / 2, Math.abs(busY - from.y), Math.abs(to.y - busY));
  if (!sx) return `M ${from.x} ${from.y} V ${to.y}`;
  return [
    `M ${from.x} ${from.y}`,
    `V ${busY - dir * c}`,
    `L ${from.x + sx * c} ${busY}`,
    `H ${to.x - sx * c}`,
    `L ${to.x} ${busY + dir * c}`,
    `V ${to.y}`,
  ].join(' ');
}
// Spreads one bus line per attacker across the gap between the rows, ordered left to right.
export function busLines(count, near, far, spacing = 10) {
  const lo = Math.min(near, far) + 12,
    hi = Math.max(near, far) - 12,
    mid = (near + far) / 2,
    step = count > 1 ? Math.min(spacing, Math.max(0, hi - lo) / (count - 1)) : 0;
  return Array.from({length: count}, (_, k) => mid + (k - (count - 1) / 2) * step);
}
// Hovering a card picks out its own links; kept across redraws.
let hotUid = null,
  linkHover = false;
function markLinks() {
  const svg = document.querySelector('.block-arrows');
  if (!svg) return;
  svg.classList.toggle('has-hot', !!hotUid && !!svg.querySelector(`[data-uids~="${hotUid}"]`));
  for (const g of svg.querySelectorAll('[data-uids]'))
    g.classList.toggle('hot', g.dataset.uids.split(' ').includes(hotUid));
}
function highlightLinks() {
  if (linkHover) return;
  linkHover = true;
  document.addEventListener('pointerover', e => {
    const el = e.target instanceof Element && e.target.closest('[data-motion-uid][data-zone="field"]');
    hotUid = el ? el.dataset.motionUid : null;
    markLinks();
  });
}
export function arrows(assignments) {
  cancelAnimationFrame(arrowFrame);
  highlightLinks();
  arrowFrame = requestAnimationFrame(() => {
    document.querySelector('.block-arrows')?.remove();
    if (!$('.table')) return;
    const field = uid => $(`[data-motion-uid="${uid}"][data-zone="field"]`),
      visible = el => {
        const r = rect(el),
          row = rect(el.closest('.board-row'));
        return row && r.right > row.left && r.left < row.right;
      };
    const groups = Object.entries(assignments)
      .map(([attacker, blockers]) => {
        const to = field(attacker);
        const from = blockers.map(field).filter(el => el && visible(el));
        return to && visible(to) && from.length ? {attacker, to, from} : null;
      })
      .filter(Boolean)
      .sort((a, b) => rect(a.to).left - rect(b.to).left);
    if (!groups.length) return;
    const svg = document.createElementNS(SVG, 'svg');
    svg.classList.add('block-arrows');
    svg.setAttribute('aria-hidden', 'true');
    const tr0 = rect(groups[0].to),
      fr0 = rect(groups[0].from[0]),
      // dir: which way the traces run from the blockers' row toward the attackers' row.
      dir = fr0.top > tr0.top ? -1 : 1,
      edge = (r, toward) => (toward > 0 ? r.bottom : r.top),
      buses = busLines(groups.length, edge(fr0, dir), edge(tr0, -dir));
    let id = 0;
    groups.forEach(({attacker, to, from}, k) => {
      const tr = rect(to),
        tip = {x: tr.left + tr.width / 2, y: edge(tr, -dir) - dir * 12},
        g = document.createElementNS(SVG, 'g');
      g.classList.add('block-link', from[0].classList.contains('red') ? 'red' : 'blue');
      g.dataset.uids = [attacker, ...from.map(el => el.dataset.motionUid)].join(' ');
      let html = '';
      for (const el of from) {
        const fr = rect(el),
          start = {x: fr.left + fr.width / 2, y: edge(fr, dir)},
          d = blockTrace(start, tip, buses[k]),
          pid = `block-trace-${id++}`;
        html += `<path class="casing" d="${d}"/><path class="wire" d="${d}"/><path class="flow" id="${pid}" d="${d}"/>`;
        html += `<circle class="solder" cx="${start.x}" cy="${start.y}" r="4.5"/>`;
        html += `<circle class="packet" r="3.5"><animateMotion dur="1.3s" repeatCount="indefinite"><mpath href="#${pid}"/></animateMotion></circle>`;
      }
      html += `<g class="shield" transform="translate(${tip.x} ${edge(tr, -dir)})"><path d="${SHIELD}"/><path class="check" d="M-3.5 0.5 L-1 3 L3.5 -2.5"/></g>`;
      g.innerHTML = html;
      svg.append(g);
    });
    document.body.append(svg);
    markLinks();
  });
}

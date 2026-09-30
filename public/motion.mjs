// Visual transitions observe rules state; they never apply damage or move game cards.
import * as stage3d from './stage3d.mjs';
import {faces} from './card-faces.mjs';
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
// Rules-side view of the table: where every card is, how hurt each unit is, and each player's capacity.
export function state(game) {
  const cards = new Map(),
    damage = new Map();
  game.players.forEach((p, owner) =>
    ['hand', 'field', 'grave'].forEach(zone =>
      p[zone].forEach(c => {
        cards.set(c.uid, {zone, owner});
        if (zone === 'field') damage.set(c.uid, c.damage || 0);
      }),
    ),
  );
  game.stack.forEach(s => s.card && cards.set(s.card.uid, {zone: 'stack', owner: s.p}));
  return {cards, damage, life: game.players.map(p => p.life)};
}
// What happened between two states, as events the animations react to. Healing and end-of-turn resets are not events.
export function changes(before, after) {
  const events = [];
  for (const [uid, now] of after.cards) {
    const old = before.cards.get(uid);
    if (now.zone === 'grave' && old && old.zone !== 'grave')
      events.push({
        type: 'leave',
        uid,
        owner: now.owner,
        from: old.zone,
        fromOwner: old.owner,
        destroyed: old.zone === 'field',
      });
    else if (now.zone !== 'grave' && (!old || old.zone !== now.zone))
      events.push({type: 'enter', uid, owner: now.owner, zone: now.zone, from: old?.zone ?? null});
  }
  for (const [uid, hurt] of after.damage) {
    const was = before.damage?.get(uid);
    if (was !== undefined && hurt > was) events.push({type: 'damaged', uid, amount: hurt - was});
  }
  after.life.forEach((life, p) => {
    const was = before.life?.[p];
    if (was !== undefined && life < was) events.push({type: 'playerHit', p, amount: was - life});
  });
  return events;
}
export function snapshot(game) {
  const visual = new Map(nodes().map(el => [Number(el.dataset.motionUid), {el, r: rect(el)}]));
  return {
    ...state(game),
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
const factionOf = el => (el?.classList.contains('red') ? 'red' : 'blue');
async function lungeCss(from, destinations) {
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
}
async function lunge3d(from, destinations, uid, game, hits, damage) {
  const size = {width: from.r.width, height: from.r.height},
    faction = factionOf(from.el),
    f = await faces({
      id: from.el.dataset.card,
      faction,
      from: 'tile',
      to: 'tile',
      ...size,
      stats: statsOf(game, uid, damage.get(uid)),
    });
  for (const target of destinations) {
    if (!target.r) continue;
    const knock = target.el
      ? {
          els: [target.el],
          faces: await faces({
            id: target.el.dataset.card,
            faction: factionOf(target.el),
            from: 'tile',
            to: 'tile',
            width: target.r.width,
            height: target.r.height,
            stats: statsOf(game, target.uid, damage.get(target.uid)),
          }),
        }
      : null;
    let landed = Promise.resolve();
    await stage3d.lunge({
      els: [from.el],
      from: from.r,
      to: target.r,
      faces: f,
      onImpact: () => {
        const amount = hits.get(target.key) || 0;
        hits.delete(target.key); // one total per target, however many attackers hit it
        landed = stage3d.burst({rect: target.r, faction, amount, knock});
      },
    });
    await landed;
  }
}
export async function combat(before, game) {
  if (before.phase !== 'afterBlock' || game.phase !== 'endCombat' || still()) return;
  before.fought = true; // transitions() leaves the damage from this combat to these animations
  const hits = new Map(
    changes(before, state(game))
      .filter(e => e.type === 'damaged' || e.type === 'playerHit')
      .map(e => [e.type === 'damaged' ? e.uid : `p${e.p}`, e.amount]),
  );
  await Promise.all(
    before.attacks.map(async uid => {
      const from = before.visual.get(uid);
      if (!from) return;
      const targets = (before.blocks[uid] || [])
        .map(id => ({...before.visual.get(Number(id)), uid: Number(id), key: Number(id)}))
        .filter(t => t.r);
      const defender = 1 - before.active,
        destinations = targets.length ? targets : [{r: before.players[defender], key: `p${defender}`}];
      return stage3d.ready()
        ? fallback(lunge3d(from, destinations, uid, game, hits, before.damage), () => lungeCss(from, destinations))
        : lungeCss(from, destinations);
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
// The card leaving play, or a stand-in at the opponent's panel when it left their hidden hand.
function departing(before, e, game) {
  const from = before.visual.get(e.uid);
  if (from || e.from !== 'hand' || e.fromOwner !== 1 || !before.players[1]) return from || null;
  const el = document.createElement('div');
  el.className = 'card hidden-card ' + game.players[e.fromOwner].faction;
  const r = before.players[1];
  return {el, r: {left: r.left + r.width / 2, top: r.top, width: 90, height: 125}};
}
function enter(before, e, item, game) {
  const origin =
      before.visual.get(e.uid)?.r || (e.zone === 'hand' ? before.decks?.[e.owner] : null) || before.players[e.owner],
    a = center(item.r),
    b = origin ? center(origin) : {x: a.x - 90, y: a.y + 80};
  const g = ghost(item);
  item.el.style.visibility = 'hidden';
  g.classList.add('entry-card');
  const back = document.createElement('div');
  back.className = 'card-back ' + game.players[e.owner].faction;
  g.append(back);
  return animate(
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
  });
}
// A failed 3D animation replays with CSS; stage3d switches itself off after the first failure.
const fallback = (job, css) =>
  job.catch(err => {
    stage3d.fail(err);
    return css();
  });
const kindOf = zone => (zone === 'field' ? 'tile' : 'hand');
// A stack entry is a text row, not a card: it flies and flips as a hand-sized card centred on the row.
export function cardAround(r, width = 110, height = 140) {
  const left = r.left + r.width / 2 - width / 2,
    top = r.top + r.height / 2 - height / 2;
  return {x: left, y: top, left, top, width, height, right: left + width, bottom: top + height};
}
// A card coming out of a deck pile or the opponent's hidden hand starts as a card the height of that pile or
// panel, in the destination's proportions: flying from the panel's own box stretched it to the panel's shape.
export const launchRect = (origin, to) => {
  const k = Math.min(1, origin.height / to.height);
  return cardAround(origin, to.width * k, to.height * k);
};
const onStack = el => !!el?.classList?.contains('stack-item');
// A stack row names its card; a row already gone takes the id from the card wherever the game now holds it.
const cardId = (game, uid, el) =>
  el?.dataset?.card || game.find?.(uid)?.card?.id || game.stack?.find(s => s.card?.uid === uid)?.card?.id;
// `damage` overrides the card's current damage, for faces drawn as they looked before combat resolved.
function statsOf(game, uid, damage) {
  const f = game.find?.(uid);
  return f?.card ? {...game.stats(f.card, f.p), damage: damage ?? (f.card.damage || 0)} : null;
}
async function enter3d(before, e, item, game) {
  const old = before.visual.get(e.uid)?.r,
    origin = old || (e.zone === 'hand' ? before.decks?.[e.owner] : null) || before.players[e.owner];
  if (!origin) return;
  item.el.style.visibility = 'hidden'; // else the card shows in its slot while the faces load, then vanishes to fly in
  try {
    const to = onStack(item.el) ? cardAround(item.r) : item.r,
      from = !old ? launchRect(origin, to) : onStack(before.visual.get(e.uid).el) ? cardAround(old) : old,
      f = await faces({
        id: cardId(game, e.uid, item.el) || before.visual.get(e.uid)?.el.dataset.card,
        faction: game.players[e.owner].faction,
        from: kindOf(e.from),
        to: kindOf(e.zone),
        width: to.width,
        height: to.height,
        stats: e.zone === 'field' ? statsOf(game, e.uid) : null,
      });
    await stage3d.fly({els: [item.el], from, to, faces: f, flip: old ? null : 'up'});
  } finally {
    item.el.style.visibility = '';
  }
}
// Spell damage and damage to a player: the burst without a lunge, in the colours of whoever is not being hit.
async function hit3d(r, el, e, game) {
  const victim = e.type === 'damaged' ? game.find?.(e.uid)?.p : e.p,
    faction = game.players[victim === 0 ? 1 : 0]?.faction || 'blue',
    knock = el
      ? {
          els: [el],
          faces: await faces({
            id: el.dataset.card,
            faction: factionOf(el),
            from: 'tile',
            to: 'tile',
            width: r.width,
            height: r.height,
            stats: statsOf(
              game,
              e.uid,
              e.type === 'damaged' ? Math.max(0, (game.find?.(e.uid)?.card.damage || 0) - e.amount) : undefined,
            ),
          }),
        }
      : null;
  await stage3d.burst({rect: r, faction, amount: e.amount, knock});
}
async function leave3d(from, pile, e, game) {
  const r = onStack(from.el) ? cardAround(from.r) : from.r,
    f = await faces({
      id: cardId(game, e.uid, from.el),
      faction: game.players[e.fromOwner].faction,
      from: kindOf(e.from),
      to: kindOf(e.from),
      width: r.width,
      height: r.height,
      stats: null,
    });
  if (e.destroyed) return stage3d.shatter({rect: r, faces: f, faction: game.players[e.fromOwner].faction});
  if (pile) return stage3d.fly({els: [], from: r, to: pile, faces: f, flip: 'down', duration: 650});
}
export async function transitions(before, game) {
  if (still()) return;
  const after = snapshot(game),
    jobs = [];
  for (const e of changes(before, after)) {
    if (e.type === 'leave') {
      const from = departing(before, e, game);
      const pile = after.graves[e.owner];
      if (from)
        jobs.push(
          stage3d.ready()
            ? fallback(leave3d(from, pile, e, game), () => depart(from, pile, e.destroyed))
            : depart(from, pile, e.destroyed),
        );
    } else if (e.type === 'enter') {
      const item = after.visual.get(e.uid);
      if (item)
        jobs.push(
          stage3d.ready()
            ? fallback(enter3d(before, e, item, game), () => enter(before, e, item, game))
            : enter(before, e, item, game),
        );
    } else if (!before.fought) {
      const r = e.type === 'damaged' ? after.visual.get(e.uid)?.r : after.players[e.p];
      if (!r) continue;
      const el = e.type === 'damaged' ? after.visual.get(e.uid).el : null;
      jobs.push(stage3d.ready() ? fallback(hit3d(r, el, e, game), () => impact(r)) : impact(r));
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

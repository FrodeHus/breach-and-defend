import test from 'node:test';
import assert from 'node:assert/strict';
import {within, settle, blockTrace, busLines, state, changes, cardAround, launchRect} from '../public/motion.mjs';
import {Game} from '../public/engine.mjs';
import {CARDS} from '../public/cards.mjs';

const never = () => new Promise(() => {});
function manualClock() {
  const timers = new Set();
  return {
    schedule: (fn, ms) => {
      const h = {fn, ms};
      timers.add(h);
      return h;
    },
    cancel: h => timers.delete(h),
    fire() {
      for (const h of [...timers]) {
        timers.delete(h);
        h.fn();
      }
    },
    get size() {
      return timers.size;
    },
  };
}

test('within returns the value when the promise settles before the deadline, and clears its timer', async () => {
  const clock = manualClock();
  assert.deepEqual(await within(Promise.resolve(7), 1000, clock), {done: true, value: 7});
  assert.equal(clock.size, 0);
});

test('within gives up on a promise that never settles', async () => {
  const clock = manualClock();
  const waiting = within(never(), 1000, clock);
  clock.fire();
  assert.deepEqual(await waiting, {done: false});
});

test('within passes on a rejection that comes before the deadline', async () => {
  await assert.rejects(
    within(Promise.reject(Error('Wait for your turn to act.')), 1000, manualClock()),
    /Wait for your turn/,
  );
});

// Reproduced in a hidden browser tab: an entry animation reported playState "finished" but its
// `finished` promise stayed pending for 114 s, until the tab painted again.
test('an animation whose finished promise never settles still ends shortly after its duration', async () => {
  const started = Date.now();
  assert.deepEqual(await settle({finished: never()}, 20, 10), {done: false});
  assert.ok(Date.now() - started < 1000);
});

test('a cancelled animation counts as done', async () => {
  const cancelled = {finished: Promise.reject(new DOMException('cancelled', 'AbortError'))};
  assert.deepEqual(await settle(cancelled, 20), {done: true, value: undefined});
});

test('block traces run straight up, bend 45° onto the bus and back into the attacker', () => {
  assert.equal(blockTrace({x: 300, y: 500}, {x: 100, y: 212}, 360), 'M 300 500 V 370 L 290 360 H 110 L 100 350 V 212');
  assert.equal(blockTrace({x: 100, y: 500}, {x: 100, y: 212}, 360), 'M 100 500 V 212');
  // Close columns shrink the bend so the route never doubles back.
  assert.equal(blockTrace({x: 106, y: 500}, {x: 100, y: 212}, 360), 'M 106 500 V 363 L 103 360 H 103 L 100 357 V 212');
});

test('each attacker gets its own bus line inside the gap between the rows', () => {
  assert.deepEqual(busLines(1, 500, 200), [350]);
  assert.deepEqual(busLines(3, 500, 200), [340, 350, 360]);
  const tight = busLines(4, 250, 200);
  assert.ok(
    tight.every(y => y >= 212 && y <= 238),
    tight.join(),
  );
  assert.equal(new Set(tight).size, 4);
});

const cardId = name => CARDS.find(c => c.name === name).id;
function table() {
  const g = new Game();
  g.players.forEach(p => Object.assign(p, {hand: [], field: [], grave: [], life: 20}));
  g.stack = [];
  return g;
}
const put = (g, p, zone, name) => {
  const c = g.card(cardId(name));
  g.players[p][zone].push(c);
  return c;
};
const move = (g, p, c, from, to) => {
  g.players[p][from] = g.players[p][from].filter(x => x !== c);
  g.players[p][to].push(c);
};

test('state records zones, unit damage and player capacity', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee');
  u.damage = 2;
  g.players[1].life = 17;
  const s = state(g);
  assert.deepEqual(s.cards.get(u.uid), {zone: 'field', owner: 0});
  assert.equal(s.damage.get(u.uid), 2);
  assert.deepEqual(s.life, [20, 17]);
});

test('changes reports cards drawn, played and bounced', () => {
  const g = table(),
    u = put(g, 0, 'hand', 'SOC Trainee'),
    b = put(g, 1, 'field', 'Recon Operator');
  const before = state(g);
  move(g, 0, u, 'hand', 'field');
  move(g, 1, b, 'field', 'hand');
  const drawn = put(g, 0, 'hand', 'Threat Hunter');
  assert.deepEqual(changes(before, state(g)), [
    {type: 'enter', uid: drawn.uid, owner: 0, zone: 'hand', from: null},
    {type: 'enter', uid: u.uid, owner: 0, zone: 'field', from: 'hand'},
    {type: 'enter', uid: b.uid, owner: 1, zone: 'hand', from: 'field'},
  ]);
});

test('changes tells destroyed units from discarded cards', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee'),
    h = put(g, 1, 'hand', 'Recon Operator');
  const before = state(g);
  move(g, 0, u, 'field', 'grave');
  move(g, 1, h, 'hand', 'grave');
  assert.deepEqual(changes(before, state(g)), [
    {type: 'leave', uid: u.uid, owner: 0, from: 'field', fromOwner: 0, destroyed: true},
    {type: 'leave', uid: h.uid, owner: 1, from: 'hand', fromOwner: 1, destroyed: false},
  ]);
});

test('changes reports new damage and lost capacity, never healing or units entering hurt', () => {
  const g = table(),
    u = put(g, 0, 'field', 'SOC Trainee'),
    healed = put(g, 1, 'field', 'Recon Operator');
  healed.damage = 1;
  const before = state(g);
  u.damage = 1;
  healed.damage = 0;
  g.players[1].life -= 3;
  g.players[0].life += 2;
  const fresh = put(g, 1, 'field', 'Payload Runner');
  fresh.damage = 1;
  assert.deepEqual(changes(before, state(g)), [
    {type: 'enter', uid: fresh.uid, owner: 1, zone: 'field', from: null},
    {type: 'damaged', uid: u.uid, amount: 1},
    {type: 'playerHit', p: 1, amount: 3},
  ]);
});

test('changes is empty when nothing moved', () => {
  const g = table();
  put(g, 0, 'field', 'SOC Trainee');
  assert.deepEqual(changes(state(g), state(g)), []);
});

test('cardAround centres a hand-sized card on a stack row', () => {
  const r = cardAround({left: 1025, top: 164, width: 216, height: 52}, 100, 140);
  assert.deepEqual([r.left, r.top, r.width, r.height], [1083, 120, 100, 140]);
  assert.equal(r.right - r.left, 100);
  assert.equal(r.bottom - r.top, 140);
});

test('launchRect starts a card from the opponent panel in the destination proportions, not the panel shape', () => {
  const bar = {left: 400, top: 60, width: 460, height: 58},
    tile = {left: 500, top: 200, width: 120, height: 160};
  const r = launchRect(bar, tile);
  assert.ok(Math.abs(r.width / r.height - 120 / 160) < 1e-9);
  assert.equal(r.height, 58);
  assert.equal(r.left + r.width / 2, 630);
  assert.equal(r.top + r.height / 2, 89);
  assert.equal(launchRect({left: 0, top: 0, width: 400, height: 400}, tile).height, 160);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  BY_ID,
  CARDS,
  DEFAULT_POOL,
  EXPANSION_POOL,
  POOLS,
  SETS,
  deck,
  playablePool,
  poolReleased,
  releasedCards,
  releasedPools,
} from '../public/cards.mjs';

const mirror = t => {
  POOLS.mirror = {
    name: 'Mirror',
    optIn: 'Mirror',
    sets: ['first-breach'],
    deck: f => [...POOLS['first-breach'].deck(f)].reverse(),
  };
  t.after(() => delete POOLS.mirror);
};
const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');

test('every card belongs to a known set and First Breach ids are unchanged', () => {
  for (const c of CARDS) assert.ok(Object.hasOwn(SETS, c.set), `${c.name} set`);
  assert.deepEqual(SETS['first-breach'], {name: 'First Breach', code: 'FB1', released: true});
  assert.equal(CARDS.filter(c => c.set === 'first-breach').length, 50);
  assert.equal(BY_ID.r0.name, 'Relay Node');
  assert.equal(BY_ID.r24.name, 'Disable Safeguard');
  assert.equal(BY_ID.b0.name, 'Secure Datacenter');
  assert.equal(BY_ID.b24.name, 'Configuration Audit');
});

test('the default pool builds exactly the shipped First Breach starters', () => {
  assert.equal(DEFAULT_POOL, 'first-breach');
  // Hashes of the deck lists before sets existed: any change would change every seeded shuffle.
  assert.equal(sha(deck('red')), '71cd4634db8b69fd87402a504897df657b308772b58937d352ef5524344c8795');
  assert.equal(sha(deck('blue')), '664645c93cc145e09909f95aa39dc530eb85cdba53e9962a62aad3a653a5bc9d');
  for (const f of ['red', 'blue']) assert.deepEqual(deck(f, DEFAULT_POOL), deck(f));
  assert.throws(() => deck('red', 'nope'), /Unknown card pool: nope\./);
  assert.throws(() => deck('red', '__proto__'), /Unknown card pool/);
});

test('every pool deck is legal: one faction, 60 cards, at most two of each non-basic card', () => {
  for (const [id, pool] of Object.entries(POOLS))
    for (const f of ['red', 'blue']) {
      const list = pool.deck(f);
      assert.equal(list.length, 60, `${id} ${f} size`);
      const basic = CARDS.find(c => c.set === 'first-breach' && c.faction === f && c.type === 'Infrastructure').id;
      for (const [cardId, copies] of Object.entries(Object.groupBy(list, x => x))) {
        assert.equal(BY_ID[cardId].faction, f, `${id} ${f} ${cardId} faction`);
        if (cardId !== basic) assert.ok(copies.length <= 2, `${id} ${f} ${cardId} copies`);
      }
    }
});

test('only pools whose sets are all released are offered', t => {
  assert.deepEqual(releasedPools(), ['first-breach', EXPANSION_POOL]);
  assert.equal(poolReleased('nope'), false);
  mirror(t);
  assert.deepEqual(releasedPools(), ['first-breach', EXPANSION_POOL, 'mirror']);
  SETS.hidden = {name: 'Hidden', code: 'HD1', released: false};
  POOLS.later = {name: 'Later', sets: ['first-breach', 'hidden'], deck: POOLS['first-breach'].deck};
  t.after(() => {
    delete SETS.hidden;
    delete POOLS.later;
  });
  assert.equal(poolReleased('later'), false);
  assert.ok(!releasedPools().includes('later'));
});

test('released cards are the cards of released sets', () => {
  assert.deepEqual(
    releasedCards().map(c => c.id),
    CARDS.filter(c => SETS[c.set].released).map(c => c.id),
  );
});

test('a stored or chosen pool falls back to First Breach unless it is released and the game is not guided', t => {
  assert.equal(playablePool(undefined), 'first-breach');
  assert.equal(playablePool(null), 'first-breach');
  assert.equal(playablePool('nope'), 'first-breach');
  assert.equal(playablePool({}), 'first-breach');
  mirror(t);
  assert.equal(playablePool('mirror'), 'mirror');
  assert.equal(playablePool('mirror', {guided: true}), 'first-breach');
});

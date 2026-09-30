// public/library.mjs
// Card library view. Pure strings, so it can be tested without a browser.
import {BY_ID, POOLS, SETS, deck, releasedCards, releasedPools, releasedTokens} from './cards.mjs';
import {esc} from './html.mjs';
import {card} from './card-view.mjs';

// What a pool's decks are made of, counted from the red list (both factions follow the same recipe).
function composition(pool) {
  const n = {Infrastructure: 0, Unit: 0, other: 0};
  for (const id of deck('red', pool)) {
    const type = BY_ID[id].type;
    n[type === 'Infrastructure' || type === 'Unit' ? type : 'other']++;
  }
  return n;
}
const deckNote = () => {
  const pools = releasedPools();
  if (pools.length === 1)
    return 'Each starter contains 24 infrastructure, two copies of each of its 12 units, and one copy of each of its 12 other cards.';
  return pools
    .map(id => {
      const n = composition(id);
      return `${esc(POOLS[id].name)} decks have ${n.Infrastructure} infrastructure, ${n.Unit} units and ${n.other} other cards.`;
    })
    .join(' ');
};
const releasedSets = () => Object.keys(SETS).filter(id => SETS[id].released);
export function library(s) {
  const {filter} = s;
  const sets = releasedSets(),
    decks = releasedPools().length * 2;
  const setFilter =
    sets.length > 1
      ? `<select id="setFilter" aria-label="Filter by set"><option value="all">All sets</option>${sets.map(id => `<option value="${id}" ${filter.set === id ? 'selected' : ''}>${esc(SETS[id].name)}</option>`).join('')}</select>`
      : '';
  const eyebrow = sets.length > 1 ? 'ALL SETS' : `${SETS[sets[0]].name.toUpperCase()} / COMPLETE SET`;
  return `<div class="library"><div class="library-head"><div><div class="eyebrow">${eyebrow}</div><h1>Card library.</h1></div><span class="pill">${releasedCards().length} cards · ${decks} ${decks === 2 ? 'starter decks' : 'decks'}</span></div><p class="muted">Explore the rules, learn the security concept, and plan your next play.</p><div class="filters"><input id="search" type="search" placeholder="Search names, rules, or security concepts…" aria-label="Search cards" value="${esc(filter.q)}"><select id="factionFilter" aria-label="Filter by faction"><option value="all">Both factions</option><option value="blue" ${filter.faction === 'blue' ? 'selected' : ''}>Blue team</option><option value="red" ${filter.faction === 'red' ? 'selected' : ''}>Red team</option></select><select id="typeFilter" aria-label="Filter by card type"><option value="all">All card types</option>${['Infrastructure', 'Unit', 'Response', 'Operation', 'Tool', 'Control'].map(t => `<option ${filter.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${setFilter}</div><div id="libraryGrid" class="grid"></div><p class="footer-note">${deckNote()}</p></div>`;
}
export const matches = (c, {q, faction, type, set = 'all'}) =>
  (faction === 'all' || c.faction === faction) &&
  (type === 'all' || c.type === type) &&
  (set === 'all' || c.set === set) &&
  `${c.name} ${c.text} ${c.lesson ?? ''}`.toLowerCase().includes(q.toLowerCase());
export function libraryGrid(s) {
  const cs = [...releasedCards(), ...releasedTokens()].filter(c => matches(c, s.filter));
  return cs.length
    ? cs.map(c => card(s, c.id)).join('')
    : '<p class="muted">No matching cards. Try another search or filter.</p>';
}

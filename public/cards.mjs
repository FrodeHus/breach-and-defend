// Original teaching set. Mechanics are abstractions, not operational instructions.
import {LORE} from './lore.mjs';
import {PERSISTENT_THREATS} from './persistent-threats.mjs';
// A set stays out of the library and the start screen until `released`: every card has lore and art by then.
export const SETS = {
  'first-breach': {name: 'First Breach', code: 'FB1', released: true},
  'persistent-threats': {name: 'Persistent Threats', code: 'PT1', released: false},
};
const cards = [];
function add(set, faction, name, cost, type, text, extra = {}) {
  // First Breach ids come from position and must never shift; later sets give explicit ids.
  const id = extra.id ?? faction[0] + cards.filter(c => c.faction === faction && c.set === 'first-breach').length;
  const lore = LORE[name];
  if (!lore && SETS[set].released) throw Error(`${name} has no lore.`);
  cards.push({
    id,
    set,
    faction,
    name,
    cost,
    type,
    text,
    flavor: lore?.flavor,
    flavorBy: lore?.by,
    lesson: lore?.learn,
    ...extra,
    art: `cards/${name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}`,
  });
}
const R = (...a) => add('first-breach', 'red', ...a),
  B = (...a) => add('first-breach', 'blue', ...a);
R('Relay Node', 0, 'Infrastructure', 'Tap: Add 1 compute.');
R('Recon Operator', 1, 'Unit', '', {power: 1, toughness: 2, subtype: 'Operator'});
R('Credential Broker', 2, 'Unit', 'Recharge', {power: 2, toughness: 1, keywords: ['recharge'], subtype: 'Identity'});
R('Phishing Courier', 2, 'Unit', 'Rapid deploy. Phishing.', {
  power: 2,
  toughness: 1,
  keywords: ['rapid'],
  tags: ['phishing'],
  subtype: 'Social engineering',
});
R('Payload Runner', 2, 'Unit', '', {power: 2, toughness: 2, subtype: 'Malware'});
R('Rogue Access Point', 3, 'Unit', 'Stealth', {power: 2, toughness: 2, keywords: ['stealth'], subtype: 'Network'});
R('Session Hijacker', 3, 'Unit', 'Rapid deploy', {power: 3, toughness: 1, keywords: ['rapid'], subtype: 'Identity'});
R('Lateral Mover', 3, 'Unit', '', {power: 3, toughness: 3, subtype: 'Operator'});
R('Persistence Agent', 4, 'Unit', 'Always-on', {power: 3, toughness: 4, keywords: ['alwaysOn'], subtype: 'Malware'});
R('Supply Chain Implant', 4, 'Unit', 'Stealth', {power: 3, toughness: 3, keywords: ['stealth'], subtype: 'Malware'});
R('Exfiltration Drone', 4, 'Unit', 'Stealth. Recharge', {
  power: 2,
  toughness: 3,
  keywords: ['stealth', 'recharge'],
  subtype: 'Network',
});
R('Ransomware Engine', 5, 'Unit', 'Overflow', {power: 5, toughness: 4, keywords: ['overflow'], subtype: 'Malware'});
R('Campaign Architect', 6, 'Unit', 'Always-on', {power: 5, toughness: 6, keywords: ['alwaysOn'], subtype: 'Operator'});
R('Credential Phishing', 2, 'Operation', 'Deal 3 damage to the opponent. Phishing.', {
  effect: 'damage',
  amount: 3,
  target: 'opponent',
  tags: ['phishing'],
});
R('Exploit Window', 2, 'Response', 'Deal 3 damage to target unit.', {effect: 'damage', amount: 3, target: 'unit'});
R('Disrupt Telemetry', 2, 'Response', 'Counter target Response or Operation.', {effect: 'counter', target: 'spell'});
R('Open Source Recon', 2, 'Operation', 'Draw two cards.', {effect: 'draw', amount: 2});
R('Denial of Service', 4, 'Operation', 'Deal 4 damage to the opponent.', {
  effect: 'damage',
  amount: 4,
  target: 'opponent',
});
R('Token Replay', 2, 'Response', 'Return target unit to its owner’s hand.', {effect: 'bounce', target: 'unit'});
R('Privilege Escalation', 2, 'Response', 'Target unit gets +3/+1 until end of turn.', {
  effect: 'buff',
  powerBoost: 3,
  toughnessBoost: 1,
  target: 'unit',
});
R('Erase Evidence', 4, 'Operation', 'Destroy target unit.', {effect: 'destroy', target: 'unit'});
R('Rebuild Foothold', 3, 'Operation', 'Return target unit card from your discard to your hand.', {
  effect: 'recover',
  target: 'grave',
});
R('Botnet Reserve', 3, 'Tool', 'At the start of your turn, gain 1 operational capacity.', {
  effect: 'upkeepHeal',
  amount: 1,
});
R('Command Channel', 3, 'Control', 'Your units get +1/+0.', {effect: 'anthem', powerBoost: 1, toughnessBoost: 0});
R('Disable Safeguard', 2, 'Operation', 'Destroy target Tool or Control.', {effect: 'destroy', target: 'support'});
B('Secure Datacenter', 0, 'Infrastructure', 'Tap: Add 1 compute.');
B('SOC Trainee', 1, 'Unit', '', {power: 1, toughness: 2, subtype: 'Analyst'});
B('Endpoint Sensor', 2, 'Unit', 'Detection', {power: 1, toughness: 3, keywords: ['detection'], subtype: 'Service'});
B('Incident Responder', 2, 'Unit', 'Always-on', {power: 2, toughness: 2, keywords: ['alwaysOn'], subtype: 'Analyst'});
B('Awareness Champion', 2, 'Unit', 'Recharge', {power: 2, toughness: 1, keywords: ['recharge'], subtype: 'Analyst'});
B('Network Sentinel', 3, 'Unit', 'Stealth', {power: 2, toughness: 3, keywords: ['stealth'], subtype: 'Service'});
B('Threat Hunter', 3, 'Unit', 'Rapid deploy', {power: 3, toughness: 2, keywords: ['rapid'], subtype: 'Analyst'});
B('Segmentation Gateway', 3, 'Unit', 'Firewall. Detection', {
  power: 1,
  toughness: 5,
  keywords: ['firewall', 'detection'],
  subtype: 'Service',
});
B('Forensic Investigator', 4, 'Unit', 'Always-on', {
  power: 3,
  toughness: 4,
  keywords: ['alwaysOn'],
  subtype: 'Analyst',
});
B('Identity Guardian', 4, 'Unit', 'Stealth', {power: 3, toughness: 3, keywords: ['stealth'], subtype: 'Service'});
B('Recovery Engineer', 4, 'Unit', 'Recharge', {power: 3, toughness: 3, keywords: ['recharge'], subtype: 'Analyst'});
B('Containment Team', 5, 'Unit', 'Always-on', {power: 4, toughness: 5, keywords: ['alwaysOn'], subtype: 'Analyst'});
B('Resilience Architect', 6, 'Unit', 'Overflow', {power: 5, toughness: 6, keywords: ['overflow'], subtype: 'Analyst'});
B('Revoke Sessions', 2, 'Response', 'Return target unit to its owner’s hand.', {effect: 'bounce', target: 'unit'});
B('Emergency Patch', 2, 'Response', 'Deal 3 damage to target unit.', {effect: 'damage', amount: 3, target: 'unit'});
B('Block Execution', 2, 'Response', 'Counter target Response or Operation.', {effect: 'counter', target: 'spell'});
B('Correlate Logs', 2, 'Operation', 'Draw two cards.', {effect: 'draw', amount: 2});
B('Disrupt Infrastructure', 4, 'Operation', 'Deal 4 damage to the opponent.', {
  effect: 'damage',
  amount: 4,
  target: 'opponent',
});
B('Restore Backup', 2, 'Response', 'Gain 4 operational capacity.', {effect: 'heal', amount: 4});
B('Least Privilege', 2, 'Response', 'Target unit gets -3/+0 until end of turn.', {
  effect: 'buff',
  powerBoost: -3,
  toughnessBoost: 0,
  target: 'unit',
});
B('Isolate Host', 4, 'Operation', 'Destroy target unit.', {effect: 'destroy', target: 'unit'});
B('Clean Rebuild', 3, 'Operation', 'Return target unit card from your discard to your hand.', {
  effect: 'recover',
  target: 'grave',
});
B('Immutable Backup', 3, 'Tool', 'At the start of your turn, gain 1 operational capacity.', {
  effect: 'upkeepHeal',
  amount: 1,
});
B('Phishing-Resistant MFA', 3, 'Control', 'Prevent damage to you from sources with Phishing.', {
  effect: 'antiPhishing',
});
B('Configuration Audit', 2, 'Operation', 'Destroy target Tool or Control.', {effect: 'destroy', target: 'support'});
// The Persistent Threats cards: unreleased (no lore or art yet), with their own stable ids.
for (const {faction, name, cost, type, text, ...extra} of PERSISTENT_THREATS)
  add('persistent-threats', faction, name, cost, type, text, extra);
export const CARDS = cards;
export const BY_ID = Object.fromEntries(cards.map(c => [c.id, c]));
// A card's or token's lore fields, from LORE by name.
const loreOf = name => {
  const lore = LORE[name];
  return {flavor: lore?.flavor, flavorBy: lore?.by, lesson: lore?.learn};
};
// Tokens are created during play: they are looked up by id like cards, but are never in CARDS or a deck.
export const TOKENS = {
  backdoor: {
    id: 'pt-backdoor',
    set: 'persistent-threats',
    faction: 'red',
    name: 'Backdoor',
    cost: 0,
    type: 'Tool',
    token: true,
    text: '1 compute, retire this Tool: Target unit you control gets +2/+0 until end of turn. Activate only during your main phase while the stack is empty.',
    abilities: [
      {
        id: 'boost',
        kind: 'activated',
        label: 'Boost a unit',
        cost: {compute: 1, retire: 'self'},
        targets: [{key: 't', zone: 'field', side: 'you', types: ['Unit']}],
        steps: [{op: 'buff', to: 't', power: 2}],
      },
    ],
    art: 'cards/backdoor',
    ...loreOf('Backdoor'),
  },
  indicator: {
    id: 'pt-indicator',
    set: 'persistent-threats',
    faction: 'blue',
    name: 'Indicator',
    cost: 0,
    type: 'Tool',
    token: true,
    text: '2 compute, retire this Tool: Draw a card. Activate only during your main phase while the stack is empty.',
    abilities: [
      {
        id: 'analyze',
        kind: 'activated',
        label: 'Analyze',
        cost: {compute: 2, retire: 'self'},
        steps: [{op: 'draw', n: 1}],
      },
    ],
    art: 'cards/indicator',
    ...loreOf('Indicator'),
  },
};
for (const t of Object.values(TOKENS)) {
  if (!t.lesson && SETS[t.set].released) throw Error(`${t.name} has no lore.`);
  BY_ID[t.id] = t;
}
// The shipped starters: 24 infrastructure, two of each unit, one of everything else. Order matters: seeded shuffles
// start from it, so changing it would change every saved and audited match.
function starter(faction) {
  const own = cards.filter(c => c.faction === faction && c.set === 'first-breach');
  return [
    ...Array(24).fill(own[0].id),
    ...own.filter(c => c.type === 'Unit').flatMap(c => [c.id, c.id]),
    ...own.filter(c => !['Unit', 'Infrastructure'].includes(c.type)).map(c => c.id),
  ];
}
export const DEFAULT_POOL = 'first-breach';
// A match's card pool: which sets it uses and the deck each faction plays. `optIn` names it on the start screen.
export const POOLS = {
  'first-breach': {name: 'First Breach', sets: ['first-breach'], deck: starter},
};
// The design's two mixed decks: 24 infrastructure, 20 units and 16 other cards each.
const RECIPES = {
  red: [
    ['Relay Node', 20],
    ...[
      'Ghost Relay',
      'Reconnaissance Outpost',
      'Attack Surface Mapper',
      'Beachhead Scout',
      'Staged Loader',
      'Dormant Implant',
      'Access Broker',
      'Living-off-the-Land Operator',
      'Redundant Handler',
      'Coordinated Intrusion Lead',
      'Long-Haul Campaign',
      'Phishing Courier',
      'Map Trust Relationships',
      'Seed Access',
      'Burn the Channel',
      'Exploit the Handoff',
      'Signal Spoof',
      'Reopened Connection',
      'Exfiltration Buffer',
      'Distributed Command',
    ].map(n => [n, 2]),
  ],
  blue: [
    ['Secure Datacenter', 20],
    ...[
      'Forensic Repository',
      'Instrumented Datacenter',
      'Alert Triage Analyst',
      'Canary Service',
      'Telemetry Curator',
      'Behavioral Monitor',
      'Case Analyst',
      'Lockdown Coordinator',
      'Restoration Lead',
      'Incident Commander',
      'Resilient Service Mesh',
      'Incident Responder',
      'Reconstruct the Timeline',
      'Preserve the Scene',
      'Scoped Remediation',
      'Verify Provenance',
      'Live Response',
      'Break the Chain',
      'Analysis Workbench',
      'Continuous Validation',
    ].map(n => [n, 2]),
  ],
};
const idOf = name => cards.find(c => c.name === name).id;
export const EXPANSION_POOL = 'first-breach+persistent-threats';
POOLS[EXPANSION_POOL] = {
  name: 'First Breach + Persistent Threats',
  optIn: 'Persistent Threats',
  sets: ['first-breach', 'persistent-threats'],
  deck: faction => RECIPES[faction].flatMap(([name, n]) => Array(n).fill(idOf(name))),
};
export const poolReleased = id =>
  typeof id === 'string' && Object.hasOwn(POOLS, id) && POOLS[id].sets.every(s => SETS[s]?.released);
export const releasedPools = () => Object.keys(POOLS).filter(poolReleased);
export const releasedCards = () => cards.filter(c => SETS[c.set].released);
export const releasedTokens = () => Object.values(TOKENS).filter(t => SETS[t.set].released);
// The header's edition label: the newest released set and how many sets are out.
export function edition() {
  const sets = Object.keys(SETS).filter(id => SETS[id].released);
  return `${SETS[sets.at(-1)].name.toUpperCase()} / ${String(sets.length).padStart(2, '0')}`;
}
// Guided games teach First Breach, and a stored choice may name a pool this version no longer offers.
export const playablePool = (choice, {guided = false} = {}) =>
  !guided && poolReleased(choice) ? choice : DEFAULT_POOL;
export function deck(faction, pool = DEFAULT_POOL) {
  if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool)) throw Error(`Unknown card pool: ${pool}.`);
  return POOLS[pool].deck(faction);
}
export const KEYWORDS = {
  rapid: 'May attack the turn it enters.',
  alwaysOn: 'Attacking does not tap this unit.',
  stealth: 'Can only be blocked by units with Stealth or Detection.',
  detection: 'Can block units with Stealth.',
  recharge: 'Damage dealt by this unit also recharges that much of your capacity.',
  overflow: 'Excess combat damage can reach the opponent after lethal damage is assigned to blockers.',
  firewall: 'Cannot attack.',
};
export const KEYWORD_NAMES = {
  rapid: 'Rapid deploy',
  alwaysOn: 'Always-on',
  stealth: 'Stealth',
  detection: 'Detection',
  recharge: 'Recharge',
  overflow: 'Overflow',
  firewall: 'Firewall',
};
// Persistent Threats rules terms: shown in the Field Guide and on the expansion cards that use them.
export const MECHANICS = {
  probe: [
    'Probe',
    'Look at the top N cards of your deck. Put any of them into your discard and the rest back on top in any order. Cards you put into your discard are public; the cards you keep and their order stay hidden from your opponent.',
  ],
  overclock: [
    'Overclock',
    'As you cast this card you may pay N more compute for its stronger effect. The cast dialog shows both total costs.',
  ],
  reuse: [
    'Reuse',
    'Cast this card from your discard by paying N compute instead of its cost. Afterwards it is archived, even if it is countered.',
  ],
  retire: [
    'Retire',
    'Put a card you control into your discard to pay a cost or for an effect. A retired token leaves the game. Destroying a card is not retiring it.',
  ],
  archive: [
    'Archive',
    'A public zone beside the discard for cards removed from the game for good. Nothing returns archived cards.',
  ],
  backdoor: [
    'Backdoor',
    'A red Tool token. 1 compute, retire it: a unit you control gets +2/+0 until end of turn. Use it in your main phase while the stack is empty.',
  ],
  indicator: [
    'Indicator',
    'A blue Tool token. 2 compute, retire it: draw a card. Use it in your main phase while the stack is empty.',
  ],
};
// The rules terms an expansion card's text uses. First Breach cards have none, so their markup never changes.
export const mechanicsOf = d =>
  d.set === 'persistent-threats'
    ? Object.keys(MECHANICS).filter(k => new RegExp(`\\b${MECHANICS[k][0]}`, 'i').test(d.text))
    : [];

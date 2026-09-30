// Persistent Threats cards as rule data (see public/rules.mjs for what each field means). Plain data only:
// cards.mjs registers these under the persistent-threats set, and nothing here imports the engine.
export const BACKDOOR = 'pt-backdoor',
  INDICATOR = 'pt-indicator';
const probe = n => ({op: 'probe', n});
const token = (id, n = 1) => ({op: 'createToken', token: id, n});
const trig = (id, label, on, steps, extra = {}) => ({id, kind: 'triggered', label, on, steps, ...extra});
const act = (id, label, cost, steps, extra = {}) => ({id, kind: 'activated', label, cost, steps, ...extra});
const opposingUnit = {key: 't', zone: 'field', side: 'opponent', types: ['Unit']};
const yourUnit = {key: 't', zone: 'field', side: 'you', types: ['Unit']};
const stackSpell = {key: 't', zone: 'stack', types: ['Response', 'Operation']};
const red = (id, name, cost, type, text, extra = {}) => ({id, faction: 'red', name, cost, type, text, ...extra});
const blue = (id, name, cost, type, text, extra = {}) => ({id, faction: 'blue', name, cost, type, text, ...extra});
const unit = (subtype, power, toughness, extra = {}) => ({subtype, power, toughness, ...extra});

export const PERSISTENT_THREATS = [
  red(
    'pt-r01',
    'Ghost Relay',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. 3 compute, Tap, retire Ghost Relay: Create two Backdoors.',
    {
      entersTapped: true,
      abilities: [
        act('cash', 'Retire for two Backdoors', {compute: 3, tap: true, retire: 'self'}, [token(BACKDOOR, 2)]),
      ],
    },
  ),
  red(
    'pt-r02',
    'Reconnaissance Outpost',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. When this enters, Probe 1.',
    {entersTapped: true, abilities: [trig('scan', 'Probe 1', 'enter', [probe(1)])]},
  ),
  red('pt-r03', 'Attack Surface Mapper', 1, 'Unit', 'When this enters, Probe 1.', {
    ...unit('Operator', 1, 1),
    abilities: [trig('map', 'Probe 1', 'enter', [probe(1)])],
  }),
  red(
    'pt-r04',
    'Beachhead Scout',
    2,
    'Unit',
    'Whenever this deals combat damage to the opponent, create a Backdoor. This triggers only once each turn.',
    {
      ...unit('Operator', 2, 1),
      abilities: [trig('foothold', 'Create a Backdoor', 'hitsOpponent', [token(BACKDOOR)], {once: true})],
    },
  ),
  red('pt-r05', 'Staged Loader', 2, 'Unit', 'Has Rapid deploy while you control a Backdoor.', {
    ...unit('Malware', 2, 1),
    when: [{keyword: 'rapid', if: {control: BACKDOOR}}],
  }),
  red('pt-r06', 'Dead-Drop Courier', 3, 'Unit', 'Stealth. When this is defeated, Probe 1.', {
    ...unit('Network', 2, 1),
    keywords: ['stealth'],
    abilities: [trig('drop', 'Probe 1', 'defeated', [probe(1)])],
  }),
  red(
    'pt-r07',
    'Access Broker',
    3,
    'Unit',
    'Whenever you retire a Tool, this gets +1/+0 until end of turn. This triggers only once each turn.',
    {
      ...unit('Identity', 3, 2),
      abilities: [
        trig('trade', '+1/+0', 'youRetire', [{op: 'buff', to: 'self', power: 1}], {
          what: {types: ['Tool']},
          once: true,
        }),
      ],
    },
  ),
  red('pt-r08', 'Dormant Implant', 3, 'Unit', 'When this enters, create a Backdoor.', {
    ...unit('Malware', 2, 3),
    abilities: [trig('implant', 'Create a Backdoor', 'enter', [token(BACKDOOR)])],
  }),
  red(
    'pt-r09',
    'Living-off-the-Land Operator',
    4,
    'Unit',
    'Whenever you cast a card from your discard, draw a card, then discard a card. This triggers only once each turn.',
    {
      ...unit('Operator', 3, 3),
      abilities: [
        trig(
          'loot',
          'Draw, then discard',
          'youCastFromGrave',
          [
            {op: 'draw', n: 1},
            {op: 'discard', n: 1},
          ],
          {once: true},
        ),
      ],
    },
  ),
  red(
    'pt-r10',
    'Redundant Handler',
    4,
    'Unit',
    'When this is defeated, if this card is still in your discard, you may retire a Backdoor. If you do, return this card to your hand.',
    {
      ...unit('Operator', 3, 4),
      abilities: [
        trig('reenter', 'Return to hand', 'defeated', [
          {
            op: 'optionalRetire',
            what: {id: BACKDOOR},
            ifSelfIn: 'grave',
            prompt: 'Retire a Backdoor to return Redundant Handler to your hand?',
            then: [{op: 'recover', to: 'self', zone: 'hand'}],
          },
        ]),
      ],
    },
  ),
  red(
    'pt-r11',
    'Coordinated Intrusion Lead',
    5,
    'Unit',
    '1 compute, retire a Backdoor: Target unit you control gets +1/+0 and Overflow until end of turn.',
    {
      ...unit('Operator', 4, 4),
      abilities: [
        act(
          'surge',
          '+1/+0 and Overflow',
          {compute: 1, retire: {id: BACKDOOR}},
          [{op: 'buff', to: 't', power: 1, keywords: ['overflow']}],
          {targets: [yourUnit]},
        ),
      ],
    },
  ),
  red('pt-r12', 'Long-Haul Campaign', 6, 'Unit', 'Overflow. When this enters, create two Backdoors.', {
    ...unit('Operator', 5, 5),
    keywords: ['overflow'],
    abilities: [trig('campaign', 'Create two Backdoors', 'enter', [token(BACKDOOR, 2)])],
  }),
  red('pt-r13', 'Map Trust Relationships', 1, 'Operation', 'Probe 2. Reuse 3.', {steps: [probe(2)], reuse: 3}),
  red('pt-r14', 'Seed Access', 2, 'Operation', 'Create two Backdoors.', {steps: [token(BACKDOOR, 2)]}),
  red(
    'pt-r15',
    'Coordinated Pressure',
    3,
    'Operation',
    'Deal 4 damage to target opposing unit. Overclock 2: Deal 6 damage instead.',
    {
      targets: [opposingUnit],
      steps: [{op: 'damage', to: 't', amount: 4}],
      overclock: {cost: 2, instead: true, steps: [{op: 'damage', to: 't', amount: 6}]},
    },
  ),
  red(
    'pt-r16',
    'Burn the Channel',
    2,
    'Operation',
    'As an additional cost, retire a Tool. Destroy target opposing unit.',
    {extraCost: {retire: {types: ['Tool']}}, targets: [opposingUnit], steps: [{op: 'destroy', to: 't'}]},
  ),
  red(
    'pt-r17',
    'Cascading Outage',
    4,
    'Operation',
    'Deal 2 damage to every unit. Overclock 2: Deal 4 damage to every unit instead.',
    {
      steps: [{op: 'damageAll', amount: 2}],
      overclock: {cost: 2, instead: true, steps: [{op: 'damageAll', amount: 4}]},
    },
  ),
  red(
    'pt-r18',
    'Adaptive Payload',
    1,
    'Response',
    'Target unit you control gets +2/+0 until end of turn. Overclock 2: It gets +2/+2 and Overflow until end of turn instead.',
    {
      targets: [yourUnit],
      steps: [{op: 'buff', to: 't', power: 2}],
      overclock: {
        cost: 2,
        instead: true,
        steps: [{op: 'buff', to: 't', power: 2, toughness: 2, keywords: ['overflow']}],
      },
    },
  ),
  red(
    'pt-r19',
    'Exploit the Handoff',
    2,
    'Response',
    'Deal 2 damage to target opposing unit, or 4 damage if it is tapped as this resolves.',
    {targets: [opposingUnit], steps: [{op: 'damage', to: 't', amount: 2, tappedAmount: 4}]},
  ),
  red(
    'pt-r20',
    'Signal Spoof',
    2,
    'Response',
    'Counter target Response or Operation unless its controller pays 2 compute. Probe 1.',
    {targets: [stackSpell], steps: [{op: 'counterUnlessPay', to: 't', amount: 2}, probe(1)]},
  ),
  red(
    'pt-r21',
    'Reopened Connection',
    2,
    'Response',
    'Return target unit you control to its owner’s hand. Draw a card. Reuse 4.',
    {
      targets: [yourUnit],
      steps: [
        {op: 'bounce', to: 't'},
        {op: 'draw', n: 1},
      ],
      reuse: 4,
    },
  ),
  red(
    'pt-r22',
    'Burn Credentials',
    1,
    'Response',
    'Archive up to two target cards from a single player’s discard. Probe 1.',
    {
      targets: [{key: 'g', zone: 'grave', side: 'any', upTo: 2, onePlayer: true}],
      steps: [{op: 'archive', to: 'g'}, probe(1)],
    },
  ),
  red(
    'pt-r23',
    'Disposable Cache',
    2,
    'Tool',
    'When this enters, create a Backdoor. 2 compute, Tap, retire another Tool: Draw two cards, then discard a card.',
    {
      abilities: [
        trig('stash', 'Create a Backdoor', 'enter', [token(BACKDOOR)]),
        act('cycle', 'Draw two, then discard one', {compute: 2, tap: true, retire: {types: ['Tool'], other: true}}, [
          {op: 'draw', n: 2},
          {op: 'discard', n: 1},
        ]),
      ],
    },
  ),
  red(
    'pt-r24',
    'Exfiltration Buffer',
    3,
    'Tool',
    'Whenever one or more units you control deal combat damage to the opponent, draw a card. This triggers only once each turn.',
    {abilities: [trig('exfil', 'Draw a card', 'yourUnitsHit', [{op: 'draw', n: 1}], {once: true})]},
  ),
  red(
    'pt-r25',
    'Distributed Command',
    4,
    'Control',
    'Whenever you retire a Tool, deal 1 damage to the opponent. This triggers only once each turn. At the beginning of your end step, if you attacked with at least two units this turn, create a Backdoor.',
    {
      abilities: [
        trig('pressure', '1 damage to the opponent', 'youRetire', [{op: 'damageOpponent', n: 1}], {
          what: {types: ['Tool']},
          once: true,
        }),
        trig('regroup', 'Create a Backdoor', 'yourEndStep', [token(BACKDOOR)], {if: {attackedWith: 2}}),
      ],
    },
  ),
];

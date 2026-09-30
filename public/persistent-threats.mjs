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
  blue(
    'pt-b01',
    'Forensic Repository',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. 3 compute, Tap, retire Forensic Repository: Create two Indicators.',
    {
      entersTapped: true,
      abilities: [
        act('preserve', 'Retire for two Indicators', {compute: 3, tap: true, retire: 'self'}, [token(INDICATOR, 2)]),
      ],
    },
  ),
  blue(
    'pt-b02',
    'Instrumented Datacenter',
    0,
    'Infrastructure',
    'Enters tapped. Tap: Add 1 compute. When this enters, Probe 1.',
    {entersTapped: true, abilities: [trig('scan', 'Probe 1', 'enter', [probe(1)])]},
  ),
  blue('pt-b03', 'Alert Triage Analyst', 1, 'Unit', 'When this enters, Probe 1.', {
    ...unit('Analyst', 1, 1),
    abilities: [trig('triage', 'Probe 1', 'enter', [probe(1)])],
  }),
  blue('pt-b04', 'Canary Service', 2, 'Unit', 'Firewall. When this is defeated, create two Indicators.', {
    ...unit('Service', 0, 3),
    keywords: ['firewall'],
    abilities: [trig('alarm', 'Create two Indicators', 'defeated', [token(INDICATOR, 2)])],
  }),
  blue('pt-b05', 'Telemetry Curator', 2, 'Unit', 'When this enters, create an Indicator.', {
    ...unit('Analyst', 1, 2),
    abilities: [trig('collect', 'Create an Indicator', 'enter', [token(INDICATOR)])],
  }),
  blue(
    'pt-b06',
    'Behavioral Monitor',
    3,
    'Unit',
    'Detection. Whenever this blocks, create an Indicator. This triggers only once each turn.',
    {
      ...unit('Service', 1, 4),
      keywords: ['detection'],
      abilities: [trig('observe', 'Create an Indicator', 'block', [token(INDICATOR)], {once: true})],
    },
  ),
  blue(
    'pt-b07',
    'Case Analyst',
    3,
    'Unit',
    'Whenever you retire an Indicator, this gets +1/+1 until end of turn. This triggers only once each turn.',
    {
      ...unit('Analyst', 2, 3),
      abilities: [
        trig('analyze', '+1/+1', 'youRetire', [{op: 'buff', to: 'self', power: 1, toughness: 1}], {
          what: {id: INDICATOR},
          once: true,
        }),
      ],
    },
  ),
  blue(
    'pt-b08',
    'Lockdown Coordinator',
    3,
    'Unit',
    'When this enters, tap target opposing unit. That unit doesn’t untap during its controller’s next untap step.',
    {
      ...unit('Analyst', 2, 2),
      abilities: [
        trig('lockdown', 'Lock down a unit', 'enter', [{op: 'tap', to: 't', lock: true}], {targets: [opposingUnit]}),
      ],
    },
  ),
  blue(
    'pt-b09',
    'Restoration Lead',
    4,
    'Unit',
    'When this enters, return target unit card with printed cost 2 or less from your discard to your hand.',
    {
      ...unit('Analyst', 3, 3),
      abilities: [
        trig('restore', 'Recover a small unit', 'enter', [{op: 'recover', to: 't', zone: 'hand'}], {
          targets: [{key: 't', zone: 'grave', side: 'you', types: ['Unit'], maxCost: 2}],
        }),
      ],
    },
  ),
  blue('pt-b10', 'Adaptive Perimeter', 4, 'Unit', 'Detection. Has Always-on while you control an Indicator.', {
    ...unit('Service', 2, 5),
    keywords: ['detection'],
    when: [{keyword: 'alwaysOn', if: {control: INDICATOR}}],
  }),
  blue(
    'pt-b11',
    'Incident Commander',
    5,
    'Unit',
    'Always-on. Whenever you retire an Indicator, untap target unit you control. This triggers only once each turn.',
    {
      ...unit('Analyst', 4, 4),
      keywords: ['alwaysOn'],
      abilities: [
        trig('coordinate', 'Untap a unit', 'youRetire', [{op: 'untap', to: 't'}], {
          what: {id: INDICATOR},
          once: true,
          targets: [yourUnit],
        }),
      ],
    },
  ),
  blue('pt-b12', 'Resilient Service Mesh', 6, 'Unit', 'Always-on. When this enters, create two Indicators.', {
    ...unit('Service', 4, 6),
    keywords: ['alwaysOn'],
    abilities: [trig('mesh', 'Create two Indicators', 'enter', [token(INDICATOR, 2)])],
  }),
  // pt-b13 … pt-b22 (blue Operations and Responses) are added in Task 5, between these units and the Tools.
  blue(
    'pt-b23',
    'Analysis Workbench',
    2,
    'Tool',
    'When this enters, create an Indicator. 2 compute, Tap, retire an Indicator: Draw two cards, then discard a card.',
    {
      abilities: [
        trig('collect', 'Create an Indicator', 'enter', [token(INDICATOR)]),
        act('study', 'Draw two, then discard one', {compute: 2, tap: true, retire: {id: INDICATOR}}, [
          {op: 'draw', n: 2},
          {op: 'discard', n: 1},
        ]),
      ],
    },
  ),
  blue(
    'pt-b24',
    'Recovery Runbook',
    3,
    'Tool',
    '2 compute, Tap, archive a unit card from your discard: Gain 3 operational capacity.',
    {
      abilities: [
        act('recover', 'Gain 3 capacity', {compute: 2, tap: true, archive: {types: ['Unit']}}, [{op: 'heal', n: 3}]),
      ],
    },
  ),
  blue(
    'pt-b25',
    'Continuous Validation',
    4,
    'Control',
    'Whenever an opponent casts their second card in a turn, create an Indicator. Whenever you retire an Indicator, gain 1 operational capacity. This second ability triggers only once each turn.',
    {
      abilities: [
        trig('signal', 'Create an Indicator', 'opponentSecondCast', [token(INDICATOR)]),
        trig('verify', 'Gain 1 capacity', 'youRetire', [{op: 'heal', n: 1}], {what: {id: INDICATOR}, once: true}),
      ],
    },
  ),
];

import {BY_ID, DEFAULT_POOL, deck} from './cards.mjs';
import {seededRandom} from './rng.mjs';
import {
  CHOICES,
  ON,
  OPS,
  abilityOf,
  archiveOptions,
  autoTargets,
  candidates,
  checkTargets,
  isRule,
  pickedTargets,
  recheck,
  retireOptions,
  ruleOf,
  spellRule,
} from './rules.mjs';
export const PHASES = [
  'upkeep',
  'draw',
  'main1',
  'beginCombat',
  'attack',
  'afterAttack',
  'block',
  'afterBlock',
  'endCombat',
  'main2',
  'end',
];
export const COMBAT_STEPS = ['attack', 'afterAttack', 'block', 'afterBlock', 'endCombat'];
export const PHASE_NAMES = {
  opening: 'Opening hand',
  upkeep: 'Start of turn',
  draw: 'Draw',
  main1: 'Main I',
  beginCombat: 'Begin combat',
  attack: 'Declare attackers',
  afterAttack: 'Attack responses',
  block: 'Declare blockers',
  afterBlock: 'Combat responses',
  endCombat: 'End combat',
  main2: 'Main II',
  end: 'End step',
  cleanup: 'Discard to seven',
};
// Card fields that only exist while an effect has set them. Nothing survives a zone change.
const TRANSIENT = ['kw', 'locked', 'used'];
const clearTransient = c => TRANSIENT.forEach(k => delete c[k]);
export class Game {
  constructor(faction = 'blue', random = Math.random, {first = 0, mode = 'solo', pool = DEFAULT_POOL} = {}) {
    this.random = random;
    this.mode = mode;
    this.pool = pool;
    this.first = first;
    this.uid = 0;
    this.players = [faction, faction === 'blue' ? 'red' : 'blue'].map(f => ({
      faction: f,
      life: 20,
      deck: this.shuffle(deck(f, pool).map(id => this.card(id))),
      hand: [],
      field: [],
      grave: [],
      archive: [],
      landPlayed: false,
    }));
    this.active = first;
    this.priority = first;
    this.phase = 'opening';
    this.turn = 1;
    this.stack = [];
    this.log = [];
    this.events = [];
    this.passes = 0;
    this.mulls = [0, 0];
    this.kept = [false, mode === 'solo'];
    this.attacks = [];
    this.blocks = {};
    this.pending = null; // The one open choice: {id, actor, kind, private, prompt, min, max, options, data?, frame?}
    this.queue = []; // Events of the current action, turned into triggers by settle()
    this.waiting = []; // Triggers not yet on the stack
    this.casts = [0, 0]; // Cards each player has cast this turn
    this.winner = null;
    this.reason = '';
    this.players.forEach((p, i) => this.draw(i, 7));
    this.note('Welcome to the arena. Keep your opening hand or take a mulligan.');
  }
  card(id) {
    return {id, uid: ++this.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0};
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(this.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  data(c) {
    return BY_ID[c.id];
  }
  note(s) {
    this.log.unshift(s);
    if (this.log.length > 120) this.log.pop();
  }
  label(p) {
    return this.mode === 'solo'
      ? p === 0
        ? 'You'
        : 'Computer'
      : this.players[p].faction === 'blue'
        ? 'Blue team'
        : 'Red team';
  }
  verb(p, you, they) {
    return this.mode === 'solo' && p === 0 ? you : they;
  }
  get mulligans() {
    return this.mulls[0];
  }
  draw(p, n) {
    for (let i = 0; i < n; i++) {
      const c = this.players[p].deck.pop();
      if (!c) {
        this.winner = 1 - p;
        this.reason = `${this.label(p)} could not draw from an empty deck.`;
        return;
      }
      this.players[p].hand.push(c);
    }
  }
  find(uid) {
    for (let p = 0; p < 2; p++)
      for (const zone of ['field', 'hand', 'grave']) {
        let card = this.players[p][zone].find(c => c.uid === uid);
        if (card) return {card, p, zone};
      }
    return null;
  }
  stats(c, p) {
    const d = this.data(c);
    let a = 0,
      b = 0;
    for (const x of this.players[p].field) {
      let e = this.data(x);
      if (e.effect === 'anthem') {
        a += e.powerBoost || 0;
        b += e.toughnessBoost || 0;
      }
    }
    return {power: Math.max(0, (d.power || 0) + c.bp + a), toughness: (d.toughness || 0) + c.bt + b};
  }
  // A card's keywords right now: printed ones, those granted until end of turn, and conditional ones.
  keywords(c) {
    const d = this.data(c),
      out = new Set([...(d.keywords ?? []), ...(c.kw ?? [])]);
    const p = this.players.findIndex(q => q.field.some(x => x.uid === c.uid));
    for (const w of d.when ?? []) if (p >= 0 && this.holds(p, w.if)) out.add(w.keyword);
    return out;
  }
  has(c, keyword) {
    return this.keywords(c).has(keyword);
  }
  holds(p, cond) {
    if (cond.control) return this.players[p].field.some(x => x.id === cond.control);
    return false;
  }
  mana(p) {
    return this.players[p].field.filter(c => this.data(c).type === 'Infrastructure' && !c.tapped).length;
  }
  pay(p, n) {
    this.players[p].field
      .filter(c => this.data(c).type === 'Infrastructure' && !c.tapped)
      .slice(0, n)
      .forEach(c => (c.tapped = true));
  }
  mulligan(p = 0) {
    if (this.phase !== 'opening' || this.kept[p] || this.mulls[p] >= 7) throw Error('No mulligan available.');
    const q = this.players[p];
    q.deck = this.shuffle([...q.deck, ...q.hand]);
    q.hand = [];
    this.draw(p, 7);
    const n = ++this.mulls[p];
    this.note(
      this.mode === 'solo'
        ? `Mulligan ${n}: keep seven, then put ${n} on the bottom.`
        : `${this.label(p)} takes mulligan ${n}.`,
    );
  }
  keep(bottom = [], p = 0) {
    const n = this.mulls[p],
      q = this.players[p];
    if (
      this.phase !== 'opening' ||
      this.kept[p] ||
      !Array.isArray(bottom) ||
      bottom.length !== n ||
      new Set(bottom).size !== n ||
      bottom.some(uid => !q.hand.some(c => c.uid === uid))
    )
      throw Error(`Choose ${n} cards to put on the bottom.`);
    for (const uid of bottom) {
      const i = q.hand.findIndex(c => c.uid === uid);
      q.deck.unshift(...q.hand.splice(i, 1));
    }
    this.kept[p] = true;
    if (this.mode !== 'solo') this.note(`${this.label(p)} keeps their opening hand.`);
    if (!this.kept.every(Boolean)) return;
    this.phase = 'upkeep';
    this.note(
      this.mode === 'solo'
        ? 'You take the first turn. The starting player skips their first draw.'
        : `${this.label(this.first)} takes the first turn and skips their first draw.`,
    );
  }
  targets(p, c) {
    const d = this.data(c);
    if (d.target === 'opponent') return [{kind: 'player', p: 1 - p}];
    if (d.target === 'spell')
      return this.stack
        .filter(s => s.card && ['Response', 'Operation'].includes(this.data(s.card).type))
        .map(s => ({kind: 'spell', uid: s.card.uid}));
    if (d.target === 'grave')
      return this.players[p].grave.filter(x => this.data(x).type === 'Unit').map(x => ({kind: 'card', uid: x.uid}));
    if (d.target === 'unit' || d.target === 'support')
      return this.players.flatMap(q =>
        q.field
          .filter(x =>
            d.target === 'unit' ? this.data(x).type === 'Unit' : ['Tool', 'Control'].includes(this.data(x).type),
          )
          .map(x => ({kind: 'card', uid: x.uid})),
      );
    return [];
  }
  playIssues(p, c, options = {}) {
    if (this.winner !== null)
      return [{code: 'finished', message: 'This match has ended. Start a new match to play cards.'}];
    if (!c || !this.players[p].hand.some(x => x.uid === c.uid))
      return [{code: 'not-in-hand', message: 'This card is not in your hand.'}];
    if (this.pending) return [{code: 'pending', message: 'Finish the pending choice first.'}];
    const d = this.data(c),
      issues = [];
    const add = (code, message) => issues.push({code, message});
    const locked = {
      opening: 'Keep your opening hand before playing cards.',
      cleanup: 'Finish discarding to seven cards before playing cards.',
      attack: 'Confirm or skip your attackers first. Responses can be cast in the following priority window.',
      block: 'Confirm your blocks first. Responses can be cast in the following priority window.',
    };
    if (locked[this.phase]) add(this.phase, locked[this.phase]);
    else {
      if (this.priority !== p) add('priority', 'Wait for your priority: the other player acts next.');
      if (d.type !== 'Response') {
        if (p !== this.active || !['main1', 'main2'].includes(this.phase))
          add('main-phase', `${d.type} cards can only be played during your Main I or Main II phase.`);
        if (this.stack.length)
          add('stack', `Wait for pending effects on the stack to resolve before playing a ${d.type} card.`);
      }
    }
    if (d.type === 'Infrastructure') {
      if (this.players[p].landPlayed)
        add('infrastructure-limit', 'You have already played infrastructure this turn. Wait until your next turn.');
    } else {
      const ready = this.mana(p),
        cost = this.costOf(d, options);
      if (ready < cost) {
        const total = this.players[p].field.filter(x => this.data(x).type === 'Infrastructure').length;
        add(
          'compute',
          `Needs ${cost} compute; only ${ready} available. ${total >= cost ? 'Tapped infrastructure becomes ready on your next turn.' : 'Build more infrastructure during your main phases, one per turn.'}`,
        );
      }
      if (d.target && !this.targets(p, c).length) {
        const missing = {
          unit: 'There are no units on the battlefield to target.',
          support: 'There are no Tools or Controls on the battlefield to target.',
          grave: 'There are no unit cards in your discard to recover.',
          spell:
            'There is no Response or Operation on the stack to counter. Units, Tools and Controls are not valid targets.',
        };
        add(`target-${d.target}`, missing[d.target] || 'There is no valid target for this card.');
      }
      if (options.overclock && !d.overclock) add('overclock', `${d.name} has no Overclock.`);
      else if (isRule(d)) issues.push(...this.ruleIssues(p, d, options));
      if (d.extraCost) issues.push(...this.costIssues(p, d.extraCost));
    }
    return issues;
  }
  costOf(d, {overclock = false} = {}) {
    return d.cost + (overclock && d.overclock ? d.overclock.cost : 0);
  }
  // A rule card can be cast when some way of casting it (a mode, with or without Overclock) has its targets.
  ruleIssues(p, d, {mode = null, overclock = false} = {}) {
    if (d.modes && mode != null && !d.modes[mode]) return [{code: 'mode', message: 'Choose one of this card’s modes.'}];
    const modes = d.modes ? (mode == null ? d.modes.map((_, i) => i) : [mode]) : [null];
    const reachable = modes.some(m =>
      spellRule(d, {mode: m, overclock}).targets.every(
        spec => spec.optional || spec.upTo || candidates(this, p, spec).length,
      ),
    );
    return reachable ? [] : [{code: 'target', message: 'There is no legal target for this card.'}];
  }
  legal(p, c) {
    return this.playIssues(p, c).length === 0;
  }
  play(p, uid, target = null, options = {}) {
    const q = this.players[p],
      c = q.hand.find(c => c.uid === uid),
      issues = this.playIssues(p, c, options);
    if (issues.length) throw Error(issues.map(issue => issue.message).join(' '));
    const d = this.data(c);
    if (d.target && !this.targets(p, c).some(t => JSON.stringify(t) === JSON.stringify(target)))
      throw Error('Choose a legal target.');
    let opts = null;
    if (isRule(d)) {
      if (d.modes && options.mode == null) throw Error('Choose one of this card’s modes.');
      const problem = checkTargets(this, p, spellRule(d, options).targets, options.targets ?? {});
      if (problem) throw Error(problem);
      const picks = options.costUids ?? [];
      const costProblem = d.extraCost ? this.checkPicks(p, d.extraCost, null, picks, options.targets) : null;
      if (costProblem) throw Error(costProblem);
      opts = {targets: structuredClone(options.targets ?? {})};
      if (options.overclock) opts.overclock = true;
      if (d.modes) opts.mode = options.mode;
    }
    q.hand = q.hand.filter(x => x.uid !== uid);
    if (d.type === 'Infrastructure') {
      if (d.entersTapped) c.tapped = true;
      q.field.push(c);
      q.landPlayed = true;
      this.note(`${this.label(p)} ${this.verb(p, 'play', 'plays')} ${d.name}.`);
      this.emit({type: 'enter', p, uid: c.uid});
      this.settle();
      return;
    }
    this.pay(p, this.costOf(d, options));
    if (d.extraCost) this.payCost(p, d.extraCost, null, options.costUids ?? []);
    this.stack.push(opts ? {card: c, p, target: null, opts} : {card: c, p, target});
    this.events.push({name: d.name, lesson: d.lesson, faction: d.faction});
    this.passes = 0;
    this.casts[p]++;
    this.emit({type: 'cast', p, uid: c.uid, count: this.casts[p], fromGrave: false});
    this.note(
      `${this.label(p)} ${this.verb(p, 'cast', 'casts')} ${d.name}${opts?.overclock ? ', overclocked' : ''}${target ? ` → ${this.targetName(target)}` : ''}.`,
    );
    this.settle();
  }
  activationIssues(p, uid, abilityId) {
    if (this.winner !== null) return [{code: 'finished', message: 'This match has ended.'}];
    if (this.pending) return [{code: 'pending', message: 'Finish the pending choice first.'}];
    const src = this.players[p].field.find(c => c.uid === uid);
    const a = src && this.data(src).abilities?.find(x => x.id === abilityId && x.kind === 'activated');
    if (!a) return [{code: 'no-ability', message: 'This card has no such ability.'}];
    const issues = [],
      add = (code, message) => issues.push({code, message});
    if (this.priority !== p || p !== this.active || !['main1', 'main2'].includes(this.phase) || this.stack.length)
      add('main-phase', 'Abilities can only be activated during your main phase while the stack is empty.');
    const cost = a.cost ?? {};
    if (cost.tap && src.tapped) add('tapped', `${this.data(src).name} is tapped.`);
    // A tap cost on infrastructure uses it up, so its compute has to come from other infrastructure.
    const ready = this.mana(p) - (cost.tap && !src.tapped && this.data(src).type === 'Infrastructure' ? 1 : 0);
    if (ready < (cost.compute ?? 0)) add('compute', `Needs ${cost.compute} compute; only ${ready} available.`);
    issues.push(...this.costIssues(p, cost, uid));
    if ((a.targets ?? []).some(spec => !spec.optional && !spec.upTo && !candidates(this, p, spec).length))
      add('target', 'There is no legal target for this ability.');
    return issues;
  }
  costIssues(p, cost, sourceUid = null) {
    const issues = [];
    if (cost.retire && cost.retire !== 'self' && !retireOptions(this, p, cost.retire, sourceUid).length)
      issues.push({code: 'retire', message: 'You have nothing to retire for this cost.'});
    if (cost.archive && !archiveOptions(this, p, cost.archive).length)
      issues.push({code: 'archive', message: 'You have no card in your discard to archive for this cost.'});
    return issues;
  }
  activate(p, uid, abilityId, options = {}) {
    const issues = this.activationIssues(p, uid, abilityId);
    if (issues.length) throw Error(issues.map(i => i.message).join(' '));
    const src = this.players[p].field.find(c => c.uid === uid),
      d = this.data(src),
      a = d.abilities.find(x => x.id === abilityId),
      picks = options.costUids ?? [];
    const problem =
      checkTargets(this, p, a.targets ?? [], options.targets ?? {}) ??
      this.checkPicks(p, a.cost ?? {}, uid, picks, options.targets);
    if (problem) throw Error(problem);
    this.payCost(p, a.cost ?? {}, src, picks);
    this.stack.push({
      ability: {card: d.id, uid, id: abilityId},
      p,
      target: null,
      opts: {targets: structuredClone(options.targets ?? {})},
    });
    this.passes = 0;
    this.note(`${this.label(p)} ${this.verb(p, 'activate', 'activates')} ${d.name}: ${a.label}.`);
    this.settle();
  }
  // Checks the chosen cost cards: the one to retire, then the one to archive, in that order.
  checkPicks(p, cost, sourceUid, picks, chosenTargets) {
    const retiring = cost.retire && cost.retire !== 'self';
    if (!Array.isArray(picks) || picks.length !== (retiring ? 1 : 0) + (cost.archive ? 1 : 0))
      return 'Choose the cards this cost needs.';
    const [toRetire, toArchive] = retiring ? picks : [null, ...picks];
    if (retiring && !retireOptions(this, p, cost.retire, sourceUid).some(c => c.uid === toRetire))
      return 'Choose a card you can retire for this cost.';
    if (cost.archive && !archiveOptions(this, p, cost.archive).some(c => c.uid === toArchive))
      return 'Choose a card in your discard to archive for this cost.';
    const targeted = pickedTargets(chosenTargets);
    if (picks.some(u => targeted.includes(u)) || (cost.retire === 'self' && targeted.includes(sourceUid)))
      return 'A card paying a cost can\u2019t also be a target.';
    return null;
  }
  // Pays every part of a cost at once, after everything has been checked. A tap cost is paid first, so the
  // source's own compute can't pay for it.
  payCost(p, cost, source, picks) {
    if (cost.tap) source.tapped = true;
    this.pay(p, cost.compute ?? 0);
    let i = 0;
    if (cost.retire === 'self') this.retire(p, source);
    else if (cost.retire) {
      const uid = picks[i++];
      this.retire(
        p,
        this.players[p].field.find(c => c.uid === uid),
      );
    }
    if (cost.archive) {
      const uid = picks[i++];
      this.archiveCard(
        p,
        this.players[p].grave.find(c => c.uid === uid),
      );
    }
  }
  targetName(t) {
    if (t.kind === 'player')
      return this.mode === 'solo' ? (t.p === 0 ? 'your capacity' : 'computer capacity') : `${this.label(t.p)} capacity`;
    if (t.kind === 'spell') {
      const s = this.stack.find(s => s.card?.uid === t.uid);
      return s ? this.data(s.card).name : 'resolved spell';
    }
    const f = this.find(t.uid);
    return f ? this.data(f.card).name : 'departed card';
  }
  pass(p) {
    if (this.pending) throw Error('Finish the pending choice first.');
    if (this.winner !== null || this.priority !== p || ['opening', 'attack', 'block', 'cleanup'].includes(this.phase))
      throw Error('Cannot pass at this step.');
    this.passes++;
    if (this.passes < 2) {
      this.priority = 1 - p;
      return;
    }
    this.passes = 0;
    if (this.stack.length) {
      this.resolve();
      this.priority = this.active;
    } else this.advance();
  }
  resolve() {
    const s = this.stack.pop();
    if (s.ability || s.opts) return this.resolveRule(s);
    const {card, p, target} = s,
      d = this.data(card);
    const valid = !d.target || this.targets(p, card).some(t => JSON.stringify(t) === JSON.stringify(target));
    if (!valid) {
      this.players[p].grave.push(card);
      this.note(`${d.name} has no legal target and does not resolve.`);
      return;
    }
    if (['Unit', 'Tool', 'Control'].includes(d.type)) {
      this.players[p].field.push(card);
      this.emit({type: 'enter', p, uid: card.uid});
      this.note(`${d.name} enters the battlefield.`);
    } else {
      const f = target?.kind === 'card' ? this.find(target.uid) : null;
      switch (d.effect) {
        case 'damage':
          if (target.kind === 'player') this.hurt(target.p, d.amount, card, p);
          else f.card.damage += d.amount;
          break;
        case 'heal':
          this.players[p].life += d.amount;
          break;
        case 'draw':
          this.draw(p, d.amount);
          break;
        case 'destroy':
          this.remove(f.p, f.card);
          break;
        case 'bounce':
          this.bounce(f.p, f.card);
          break;
        case 'buff':
          f.card.bp += d.powerBoost;
          f.card.bt += d.toughnessBoost;
          break;
        case 'recover':
          clearTransient(f.card);
          this.players[p].grave = this.players[p].grave.filter(x => x.uid !== f.card.uid);
          Object.assign(f.card, {uid: ++this.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0});
          this.players[p].hand.push(f.card);
          break;
        case 'counter': {
          const i = this.stack.findIndex(x => x.card?.uid === target.uid);
          const other = this.stack.splice(i, 1)[0];
          this.players[other.p].grave.push(other.card);
          this.note(`${this.data(other.card).name} is countered.`);
          break;
        }
      }
      this.players[p].grave.push(card);
      this.note(`${d.name} resolves.`);
    }
    this.settle();
  }
  resolveRule(s) {
    const {targets, fizzled} = recheck(this, s.p, ruleOf(s).targets, s.opts.targets);
    if (fizzled) {
      if (s.card) this.leaveStack(s);
      this.note(`${this.entryName(s)} has no legal target and does not resolve.`);
    } else
      this.run({
        entry: s,
        i: 0,
        targets,
        p: s.p,
        self: s.card?.uid ?? s.ability.uid,
        source: {id: s.card?.id ?? s.ability.card},
      });
    this.settle();
  }
  // Runs an entry's steps from frame.i. A step that needs a choice sets `pending` and the frame waits in it.
  run(frame) {
    const {steps} = ruleOf(frame.entry);
    for (; frame.i < steps.length && this.winner === null; frame.i++) {
      const step = steps[frame.i];
      if (OPS[step.op](this, frame, step)) {
        frame.i++;
        this.pending.frame = frame;
        return false;
      }
    }
    this.finish(frame.entry);
    return true;
  }
  finish(entry) {
    if (entry.card) this.leaveStack(entry);
    this.note(`${this.entryName(entry)} resolves.`);
  }
  leaveStack(entry) {
    this.players[entry.p].grave.push(entry.card);
  }
  entryName(s) {
    return s.card ? this.data(s.card).name : `${BY_ID[s.ability.card].name} (${abilityOf(s.ability).label})`;
  }
  remove(p, c) {
    this.players[p].field = this.players[p].field.filter(x => x.uid !== c.uid);
    const d = this.data(c);
    // Tokens stop existing when they leave the battlefield; they never reach a discard.
    if (d.token) this.note(`${d.name} is removed.`);
    else {
      clearTransient(c);
      this.players[p].grave.push(c);
      this.note(`${d.name} goes to discard.`);
    }
    if (d.type === 'Unit') this.emit({type: 'defeated', p, uid: c.uid});
  }
  // Returning to hand makes a new object: nothing that happened on the battlefield follows the card.
  bounce(p, c) {
    this.players[p].field = this.players[p].field.filter(x => x.uid !== c.uid);
    if (this.data(c).token) return this.note(`${this.data(c).name} is removed.`);
    clearTransient(c);
    Object.assign(c, {uid: ++this.uid, tapped: false, sick: true, damage: 0, bp: 0, bt: 0});
    this.players[p].hand.push(c);
  }
  createToken(p, id) {
    const c = this.card(id);
    this.players[p].field.push(c);
    this.note(`${this.label(p)} ${this.verb(p, 'create', 'creates')} a ${this.data(c).name}.`);
    this.emit({type: 'enter', p, uid: c.uid});
    return c;
  }
  // Retiring is not destruction: a permanent its controller gives up, as a cost or by choice.
  retire(p, c) {
    this.emit({type: 'retire', p, uid: c.uid, id: c.id, cardType: this.data(c).type});
    this.remove(p, c);
  }
  // The archive is public and final: nothing brings a card back from it.
  archiveCard(p, c) {
    this.players[p].grave = this.players[p].grave.filter(x => x.uid !== c.uid);
    clearTransient(c);
    this.players[p].archive.push(c);
    this.note(`${this.data(c).name} is archived.`);
  }
  hurt(victim, amount, source, owner) {
    if (
      this.data(source).tags?.includes('phishing') &&
      this.players[victim].field.some(c => this.data(c).effect === 'antiPhishing')
    ) {
      this.note('Phishing-Resistant MFA prevents phishing damage.');
      return 0;
    }
    this.players[victim].life -= amount;
    return amount;
  }
  check() {
    let again = true;
    while (again) {
      again = false;
      for (let p = 0; p < 2; p++)
        for (const c of [...this.players[p].field])
          if (this.data(c).type === 'Unit') {
            const t = this.stats(c, p).toughness;
            if (t <= 0 || c.damage >= t) {
              this.remove(p, c);
              again = true;
            }
          }
    }
    const dead = this.players.map(p => p.life <= 0);
    if (dead[0] && dead[1]) {
      this.winner = 'draw';
      this.reason = 'Both operations reached zero capacity simultaneously.';
    } else if (dead.some(Boolean)) {
      this.winner = dead[0] ? 1 : 0;
      this.reason = 'Operational capacity reached zero.';
    }
  }
  emit(e) {
    this.queue.push(e);
  }
  // After every action: defeat units at zero toughness, then put abilities that triggered onto the stack.
  settle() {
    this.collect();
    this.check();
    // Nothing triggers once the match is decided; drop it so a finished match saves no expansion state.
    if (this.winner !== null) {
      this.queue = [];
      this.waiting = [];
      this.pending = null;
      return;
    }
    this.collect();
    if (!this.pending) this.place();
  }
  // Turns queued events into waiting triggers while their sources are still where the events found them.
  collect() {
    for (const e of this.queue.splice(0)) this.waiting.push(...this.triggersFor(e));
  }
  triggersFor(e) {
    const found = [];
    const consider = (c, p) => {
      for (const a of this.data(c).abilities ?? []) {
        if (a.kind !== 'triggered' || !ON[a.on](e, c, p, a)) continue;
        // Counted when it triggers, even if the trigger is later countered or removed.
        if (a.once) {
          if (c.used?.includes(a.id)) continue;
          (c.used ??= []).push(a.id);
        }
        found.push({id: ++this.uid, p, ability: {card: c.id, uid: c.uid, id: a.id}});
      }
    };
    this.players.forEach((q, p) => q.field.forEach(c => consider(c, p)));
    // A card's own "when this is defeated" ability triggers from the discard it went to.
    if (e.type === 'defeated') {
      const f = this.find(e.uid);
      if (f?.zone === 'grave') consider(f.card, e.p);
    }
    return found;
  }
  // Puts waiting triggers on the stack: the active player's first (so they resolve last), each player's in the
  // order they choose. A trigger with no legal target is removed; one with a choice of targets asks.
  place() {
    let placed = false;
    while (this.waiting.length && !this.pending) {
      const p = this.waiting.some(t => t.p === this.active) ? this.active : 1 - this.active;
      const mine = this.waiting.filter(t => t.p === p);
      if (mine.length > 1 && !mine.every(t => t.ordered)) {
        this.pending = {
          id: ++this.uid,
          actor: p,
          kind: 'order',
          private: false,
          prompt: 'Choose the order your abilities go on the stack. The first goes on first and resolves last.',
          min: mine.length,
          max: mine.length,
          options: mine.map(t => t.id),
        };
        break;
      }
      const t = mine[0],
        specs = abilityOf(t.ability).targets ?? [];
      if (!t.targets) {
        const auto = autoTargets(this, p, specs);
        if (auto === 'choose') {
          this.pending = {
            id: ++this.uid,
            actor: p,
            kind: 'targets',
            private: false,
            prompt: `Choose targets for ${this.entryName({ability: t.ability})}.`,
            min: 1,
            max: 1,
            options: specs.map(spec => ({
              key: spec.key,
              optional: !!spec.optional,
              upTo: spec.upTo ?? 0,
              candidates: candidates(this, p, spec),
            })),
            data: {trigger: t.id},
          };
          break;
        }
        this.waiting = this.waiting.filter(x => x !== t);
        if (auto === 'none') {
          this.note(`${this.entryName({ability: t.ability})} has no legal target and is removed.`);
          continue;
        }
        t.targets = auto;
      } else this.waiting = this.waiting.filter(x => x !== t);
      this.stack.push({ability: t.ability, p, target: null, opts: {targets: t.targets}});
      this.note(`${this.entryName({ability: t.ability})} triggers.`);
      placed = true;
    }
    if (placed) {
      this.priority = this.active;
      this.passes = 0;
    }
  }
  choose(p, selection) {
    const c = this.pending;
    if (!c || c.actor !== p) throw Error('There is no choice for you to make.');
    CHOICES[c.kind](this, c, selection && typeof selection === 'object' ? selection : {});
    this.pending = null;
    if (c.frame && this.run(c.frame)) {
      this.priority = this.active;
      this.passes = 0;
    }
    this.settle();
  }
  canAttack(p, c) {
    const d = this.data(c);
    return !!(
      p === this.active &&
      d.type === 'Unit' &&
      !c.tapped &&
      (!c.sick || this.has(c, 'rapid')) &&
      !this.has(c, 'firewall')
    );
  }
  attackers(p, uids) {
    if (this.pending) throw Error('Finish the pending choice first.');
    if (
      this.phase !== 'attack' ||
      p !== this.active ||
      new Set(uids).size !== uids.length ||
      uids.some(uid => !this.players[p].field.some(c => c.uid === uid && this.canAttack(p, c)))
    )
      throw Error('Choose ready units that can attack.');
    this.attacks = [...uids];
    this.blocks = {};
    for (const uid of uids) {
      const c = this.find(uid).card;
      if (!this.has(c, 'alwaysOn')) c.tapped = true;
    }
    this.phase = uids.length ? 'afterAttack' : 'endCombat';
    this.priority = this.active;
    this.passes = 0;
    this.note(
      uids.length
        ? `${this.label(p)} ${this.verb(p, 'attack', 'attacks')} with ${uids.length} unit${uids.length === 1 ? '' : 's'}.`
        : `${this.label(p)} ${this.verb(p, 'do', 'does')} not attack.`,
    );
  }
  canBlock(blocker, attacker) {
    const b = this.data(blocker);
    return !!(
      b.type === 'Unit' &&
      !blocker.tapped &&
      (!this.has(attacker, 'stealth') || this.has(blocker, 'stealth') || this.has(blocker, 'detection'))
    );
  }
  blockers(p, assignments) {
    if (this.pending) throw Error('Finish the pending choice first.');
    if (this.phase !== 'block' || p === this.active) throw Error('Not your blocking step.'); // Keys must be canonical uids: combat looks blocks up by uid, so "05" or "0x5" would silently not block.
    if (
      !assignments ||
      typeof assignments !== 'object' ||
      Array.isArray(assignments) ||
      Object.entries(assignments).some(([a, bs]) => !/^[1-9][0-9]*$/.test(a) || !Array.isArray(bs))
    )
      throw Error('Invalid blocks.');
    const used = [];
    for (const [a, bs] of Object.entries(assignments)) {
      if (!this.attacks.includes(Number(a))) throw Error('Invalid attacker.');
      const af = this.find(Number(a));
      if (!af || af.zone !== 'field') throw Error('Attacker has left.');
      for (const uid of bs) {
        const bf = this.find(uid);
        if (!bf || bf.zone !== 'field' || bf.p !== p || !this.canBlock(bf.card, af.card) || used.includes(uid))
          throw Error('Illegal blocker.');
        used.push(uid);
      }
    }
    this.blocks = structuredClone(assignments);
    this.phase = 'afterBlock';
    this.priority = this.active;
    this.passes = 0;
    this.note(
      `${this.label(p)} ${this.verb(p, 'assign', 'assigns')} ${used.length} blocker${used.length === 1 ? '' : 's'}.`,
    );
    for (const uid of used) this.emit({type: 'block', p, uid});
    this.settle();
  }
  combat() {
    const pending = [],
      gains = [0, 0];
    const add = (source, owner, target, amount) => {
      if (amount <= 0) return;
      pending.push({source, owner, target, amount});
    };
    for (const uid of this.attacks) {
      const a = this.find(uid);
      if (!a || a.zone !== 'field' || a.p !== this.active) continue;
      const wasBlocked = (this.blocks[uid] || []).length > 0;
      const bs = (this.blocks[uid] || []).map(id => this.find(id)).filter(b => b?.zone === 'field');
      let power = this.stats(a.card, a.p).power;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i],
          lethal = Math.max(0, this.stats(b.card, b.p).toughness - b.card.damage);
        const trample = this.has(a.card, 'overflow');
        const n = i === bs.length - 1 && !trample ? power : Math.min(power, lethal);
        add(a.card, a.p, {kind: 'card', uid: b.card.uid}, n);
        power -= n;
        add(b.card, b.p, {kind: 'card', uid: a.card.uid}, this.stats(b.card, b.p).power);
      }
      if (!wasBlocked || this.has(a.card, 'overflow')) add(a.card, a.p, {kind: 'player', p: 1 - a.p}, power);
    }
    for (const hit of pending) {
      let n = hit.amount;
      if (hit.target.kind === 'player') n = this.hurt(hit.target.p, n, hit.source, hit.owner);
      else this.find(hit.target.uid).card.damage += n;
      if (hit.target.kind === 'player' && n > 0) this.emit({type: 'combatDamage', p: hit.owner, uid: hit.source.uid});
      if (this.has(hit.source, 'recharge')) gains[hit.owner] += n;
    }
    gains.forEach((n, p) => (this.players[p].life += n));
    this.note('Combat damage is dealt simultaneously.');
    this.settle();
  }
  advance() {
    switch (this.phase) {
      case 'upkeep':
        this.phase = 'draw';
        if (!(this.turn === 1 && this.active === this.first)) this.draw(this.active, 1);
        break;
      case 'draw':
        this.phase = 'main1';
        break;
      case 'main1':
        this.phase = 'beginCombat';
        break;
      case 'beginCombat':
        this.phase = 'attack';
        break;
      case 'afterAttack':
        this.phase = 'block';
        break;
      case 'afterBlock':
        this.combat();
        this.phase = 'endCombat';
        break;
      case 'endCombat':
        this.phase = 'main2';
        break;
      case 'main2':
        this.phase = 'end';
        this.emit({type: 'endStep', p: this.active});
        break;
      case 'end':
        if (this.players[this.active].hand.length > 7) {
          this.phase = 'cleanup';
          break;
        }
        this.endTurn();
        break;
    }
    this.priority = this.active;
    this.passes = 0;
    this.settle();
  }
  discard(uids) {
    if (this.pending) throw Error('Finish the pending choice first.');
    const p = this.players[this.active];
    const n = p.hand.length - 7;
    if (
      this.phase !== 'cleanup' ||
      uids.length !== n ||
      new Set(uids).size !== n ||
      uids.some(uid => !p.hand.some(c => c.uid === uid))
    )
      throw Error(`Choose ${n} cards to discard.`);
    for (const uid of uids) {
      const i = p.hand.findIndex(c => c.uid === uid);
      p.grave.push(...p.hand.splice(i, 1));
    }
    this.endTurn();
  }
  endTurn() {
    for (const p of this.players)
      for (const c of p.field) {
        c.damage = 0;
        c.bp = 0;
        c.bt = 0;
        delete c.kw;
        delete c.used;
      }
    this.check();
    if (this.winner !== null) return;
    this.active = 1 - this.active;
    this.turn++;
    this.phase = 'upkeep';
    this.priority = this.active;
    this.passes = 0;
    this.attacks = [];
    this.casts = [0, 0];
    this.blocks = {};
    const p = this.players[this.active];
    p.landPlayed = false;
    for (const c of p.field) {
      // A locked-down card skips this one untap step; the lock then expires.
      if (c.locked) delete c.locked;
      else c.tapped = false;
      c.sick = false;
      if (this.data(c).effect === 'upkeepHeal') p.life += this.data(c).amount;
    }
    this.note(
      `Turn ${this.turn}: ${this.label(this.active)} ${this.verb(this.active, 'untap and start', 'untaps and starts')} the turn.`,
    );
    this.settle();
  }
  actor() {
    if (this.pending) return this.pending.actor;
    if (this.phase === 'opening') return this.kept[0] ? 1 : 0;
    if (['attack', 'cleanup'].includes(this.phase)) return this.active;
    if (this.phase === 'block') return 1 - this.active;
    return this.priority;
  }
  concede(p) {
    if (this.winner !== null) throw Error('The match has already ended.');
    this.winner = 1 - p;
    this.reason = `${this.label(p)} left the match.`;
    this.pending = null;
    this.note(this.reason);
  }
  toJSON() {
    const {random, ...state} = this;
    // First Breach matches keep the pre-expansion format, so their saves, views and audit digests don't change.
    // Only expansion cards read cast counts, and the rest of the expansion state is saved only when not empty.
    if (state.pool === DEFAULT_POOL) delete state.pool;
    if (state.pool === undefined || state.casts.every(n => n === 0)) delete state.casts;
    if (state.pending === null) delete state.pending;
    if (!state.queue.length) delete state.queue;
    if (!state.waiting.length) delete state.waiting;
    state.players = state.players.map(({archive, ...q}) => (archive.length ? {...q, archive} : q));
    return structuredClone({...state, rng: random.state ?? null});
  }
  static fromJSON(json) {
    const {rng, ...state} = structuredClone(json);
    const g = Object.assign(Object.create(Game.prototype), state);
    g.pool ??= DEFAULT_POOL;
    g.pending ??= null;
    g.queue ??= [];
    g.waiting ??= [];
    g.casts ??= [0, 0];
    for (const q of g.players) q.archive ??= [];
    g.random = rng ? seededRandom(rng) : Math.random;
    return g;
  }
  aiAction() {
    const p = this.actor();
    if (p !== 1 || this.winner !== null) return;
    const me = this.players[1],
      foe = this.players[0];
    if (this.phase === 'cleanup') {
      this.discard(
        [...me.hand]
          .sort((a, b) => this.data(b).cost - this.data(a).cost)
          .slice(0, me.hand.length - 7)
          .map(c => c.uid),
      );
      return;
    }
    if (this.phase === 'attack') {
      const ready = me.field.filter(c => this.canAttack(1, c));
      this.attackers(
        1,
        ready
          .filter(c => {
            const a = this.stats(c, 1);
            const threats = foe.field.filter(b => this.canBlock(b, c));
            return !threats.length || this.has(c, 'alwaysOn') || a.power >= 2;
          })
          .map(c => c.uid),
      );
      return;
    }
    if (this.phase === 'block') {
      const assignments = {},
        available = me.field.filter(c => this.data(c).type === 'Unit' && !c.tapped);
      for (const uid of this.attacks) {
        const a = this.find(uid);
        if (!a || a.zone !== 'field') continue;
        const as = this.stats(a.card, 0);
        let choices = available
          .filter(b => this.canBlock(b, a.card))
          .sort((b, c) => {
            let bs = this.stats(b, 1),
              cs = this.stats(c, 1);
            return (cs.toughness > as.power ? 10 : 0) + cs.power - ((bs.toughness > as.power ? 10 : 0) + bs.power);
          });
        let b =
          choices.find(b => this.stats(b, 1).toughness > as.power || this.stats(b, 1).power >= as.toughness) ||
          (me.life <= 8 || as.power >= 4 ? choices[0] : null);
        if (b) {
          assignments[uid] = [b.uid];
          available.splice(available.indexOf(b), 1);
        }
      }
      this.blockers(1, assignments);
      return;
    }
    const legal = me.hand.filter(c => this.legal(1, c));
    const main = this.active === 1 && ['main1', 'main2'].includes(this.phase) && !this.stack.length;
    let selected = null,
      target = null;
    if (main) {
      selected = legal.find(c => this.data(c).type === 'Infrastructure');
      if (!selected)
        selected = legal
          .filter(c => ['Unit', 'Control', 'Tool'].includes(this.data(c).type))
          .sort((a, b) => this.data(b).cost - this.data(a).cost)[0];
    }
    if (!selected)
      for (const c of legal) {
        const d = this.data(c),
          ts = this.targets(1, c);
        if (d.effect === 'counter') {
          const top = [...this.stack].reverse().find(s => s.p === 0 && s.card && ts.some(t => t.uid === s.card.uid));
          if (top) {
            selected = c;
            target = {kind: 'spell', uid: top.card.uid};
            break;
          }
        } else if (d.effect === 'damage' && d.target === 'opponent' && main) {
          selected = c;
          target = ts[0];
          break;
        } else if (['destroy', 'damage', 'bounce'].includes(d.effect) && d.target !== 'opponent') {
          const enemies = ts
            .filter(t => this.find(t.uid)?.p === 0)
            .sort((a, b) => this.data(this.find(b.uid).card).cost - this.data(this.find(a.uid).card).cost);
          const t = enemies.find(
            t =>
              d.effect !== 'damage' ||
              this.stats(this.find(t.uid).card, 0).toughness - this.find(t.uid).card.damage <= d.amount,
          );
          if (t && (main || this.active === 0 || this.stack.length)) {
            selected = c;
            target = t;
            break;
          }
        } else if (d.effect === 'heal' && me.life <= 16) {
          selected = c;
          break;
        } else if (d.effect === 'draw' && main) {
          selected = c;
          break;
        } else if (d.effect === 'recover' && main) {
          selected = c;
          target = ts.sort((a, b) => this.data(this.find(b.uid).card).cost - this.data(this.find(a.uid).card).cost)[0];
          break;
        } else if (d.effect === 'buff' && this.phase === 'afterBlock') {
          const ts2 = ts.filter(t => {
            const f = this.find(t.uid);
            return (
              f.p === (d.powerBoost > 0 ? 1 : 0) &&
              (this.attacks.includes(t.uid) || Object.values(this.blocks).flat().includes(t.uid))
            );
          });
          if (ts2.length) {
            selected = c;
            target = ts2[0];
            break;
          }
        }
      }
    if (selected) this.play(1, selected.uid, target);
    else this.pass(1);
  }
}

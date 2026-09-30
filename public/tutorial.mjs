import {BY_ID} from './cards.mjs';

export const LESSONS = [
  ['opening', 'Keep a hand'],
  ['infrastructure', 'Build compute'],
  ['unit', 'Deploy a unit'],
  ['response', 'Pass or respond'],
  ['attack', 'Attack'],
  ['block', 'Defend'],
];

const handTarget = c => `[data-zone="hand"][data-uid="${c.uid}"]`;
const fieldTarget = c => `[data-zone="field"][data-uid="${c.uid}"]`;
const step = (id, title, text, targets = []) => ({id, title, text, targets});

// Guidance observes the real rules engine; it never changes a hand or a move.
export class Tutorial {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.completed = new Set();
  }

  exit() {
    this.enabled = false;
  }

  capture(g) {
    if (!this.enabled) return null;
    return {
      phase: g.phase,
      actor: g.actor(),
      stack: g.stack.length,
      attacks: g.attacks.length,
      passes: g.passes,
      hand: new Set(g.players[0].hand.map(c => c.uid)),
    };
  }

  observe(g, before) {
    if (!this.enabled || !before || before.actor !== 0) return;
    if (before.phase === 'opening' && g.phase !== 'opening') this.completed.add('opening');
    if (g.players[0].field.some(c => before.hand.has(c.uid) && BY_ID[c.id].type === 'Infrastructure'))
      this.completed.add('infrastructure');
    const played = g.stack.filter(s => s.p === 0 && before.hand.has(s.card.uid));
    if (played.some(s => BY_ID[s.card.id].type === 'Unit')) this.completed.add('unit');
    if (
      played.some(s => BY_ID[s.card.id].type === 'Response') ||
      (before.stack && (g.passes !== before.passes || g.stack.length < before.stack))
    )
      this.completed.add('response');
    if (before.phase === 'attack' && g.phase !== 'attack' && g.attacks.length) this.completed.add('attack');
    if (before.phase === 'block' && g.phase !== 'block' && before.attacks) this.completed.add('block');
  }

  shouldPause(g) {
    return (
      this.enabled && !this.completed.has('response') && g.winner === null && g.actor() === 0 && g.stack.length > 0
    );
  }

  step(g, {selected = new Set(), blocks = {}, blocker = null} = {}) {
    if (!this.enabled) return null;
    if (this.completed.size === LESSONS.length)
      return step(
        'complete',
        'You know the essentials.',
        'You have kept a hand, built compute, deployed a unit, used priority, attacked and defended. Continue the match on your own, or open the Field guide whenever you need it.',
      );
    if (g.winner !== null)
      return step(
        'ended',
        'Keep learning next match.',
        'This match ended before every lesson came up. You can opt into guidance again when choosing a faction.',
      );
    if (g.phase === 'opening')
      return step(
        'opening',
        'Choose your opening hand.',
        g.mulligans
          ? `Select ${g.mulligans} card${g.mulligans === 1 ? '' : 's'} to return to the deck, then Keep hand. Keep infrastructure and affordable units when you can.`
          : 'Reduce the opponent’s capacity from 20 to 0 to win. Look for two or three Infrastructure cards and low-cost units. Inspect a card, then Keep hand; Mulligan redraws at the cost of returning one more card.',
        g.mulligans ? ['.opening-hand', '#keep'] : ['#keep', '#mulligan'],
      );
    if (g.actor() !== 0)
      return step(
        'watch',
        'Watch the computer’s move.',
        'Your lessons stay here while the computer plays. Notice how its compute taps to pay for cards and becomes ready on its next turn.',
      );
    if (g.stack.length) {
      const responses = g.players[0].hand.filter(c => BY_ID[c.id].type === 'Response' && g.legal(0, c));
      return step(
        'response',
        'Pass or respond.',
        `The stack holds pending effects. The newest resolves first after both players pass. ${responses.length ? 'You can inspect a highlighted Response and cast it, or choose Pass priority.' : 'You have no playable Response. Choose Pass priority to let the other player act; passing does not cancel your card.'}`,
        [...responses.map(handTarget), '#advance'],
      );
    }
    if (g.phase === 'attack') {
      const ready = g.players[0].field.filter(c => g.canAttack(0, c));
      return step(
        'attack',
        'Choose your attackers.',
        ready.length
          ? `${selected.size ? `${selected.size} selected. Confirm with Attack with ${selected.size}, or select a unit again to remove it.` : 'Select a highlighted unit, then confirm your attack.'} Attacking usually taps a unit, leaving it unable to block. New units wait a turn unless they have Rapid deploy.`
          : 'No units can attack yet. New units wait until your next turn unless they have Rapid deploy; tapped units and Firewall units cannot attack. Choose Skip attack and keep building.',
        [...ready.map(fieldTarget), '#advance'],
      );
    }
    if (g.phase === 'block') {
      const attackers = g.attacks.map(uid => g.find(uid)?.card).filter(Boolean);
      const ready = g.players[0].field.filter(c => attackers.some(a => g.canBlock(c, a)));
      const chosen = g.players[0].field.find(c => c.uid === blocker);
      const assigned = Object.values(blocks).flat().length;
      return step(
        'block',
        'Choose your defense.',
        !attackers.length
          ? 'There are no attackers this combat. Continue; the defense lesson will be available when an opponent attacks.'
          : chosen
            ? 'Now select a highlighted opposing attacker. Your blocker deals its power and receives damage in return. Stealth attackers need Stealth or Detection to block.'
            : ready.length
              ? `${assigned ? `${assigned} blocker${assigned === 1 ? '' : 's'} assigned. Confirm blocks, or assign more. ` : 'Select a highlighted unit of yours, then an opposing attacker. '}Blocking does not tap units. Unblocked attackers damage your capacity; you can also choose to take damage.`
              : 'You have no legal blockers. Choose Take unblocked damage to continue. Keep an untapped unit ready next time; Stealth attackers need Stealth or Detection to block.',
        [...(chosen ? attackers.filter(a => g.canBlock(chosen, a)) : ready).map(fieldTarget), '#advance'],
      );
    }
    if (g.phase === 'cleanup')
      return step(
        'cleanup',
        'Make room for your next draw.',
        `Select ${g.players[0].hand.length - 7} cards to discard, then choose Discard selected. Your hand must have at most seven cards at the end of your turn.`,
        ['.hand', '#advance'],
      );
    if (g.active === 0 && ['main1', 'main2'].includes(g.phase)) {
      const legal = g.players[0].hand.filter(c => g.legal(0, c));
      const lands = legal.filter(c => BY_ID[c.id].type === 'Infrastructure');
      const units = legal.filter(c => BY_ID[c.id].type === 'Unit');
      if (lands.length && (!this.completed.has('infrastructure') || !this.completed.has('unit')))
        return step(
          'infrastructure',
          'Build your compute.',
          'Select a highlighted Infrastructure card, then Play infrastructure in its details. It is free, and you may play one per turn. Each ready infrastructure pays one compute automatically.',
          lands.map(handTarget),
        );
      if (units.length && !this.completed.has('unit'))
        return step(
          'unit',
          'Deploy your first unit.',
          'Select a highlighted Unit, then Cast card. The top-right number is its compute cost; the bottom-right numbers are power / toughness. Your infrastructure taps automatically to pay.',
          units.map(handTarget),
        );
      return step(
        'turn',
        g.phase === 'main1' ? 'Move toward combat.' : 'Finish your turn.',
        `${!this.completed.has('unit') ? 'No affordable unit is available right now. Build compute over later turns and watch your draws. ' : 'You may play more affordable cards, or save compute for a Response. '}${g.phase === 'main1' ? 'Choose Go to combat. Your attack lesson appears when you select attackers.' : 'Choose End turn. Your cards become ready at the start of your next turn; keep untapped units to defend.'} Lessons are checked off as opportunities arise.`,
        ['#advance'],
      );
    }
    return step(
      'continue',
      'Follow the turn phases.',
      'The phase bar shows where you are in the turn. Continue when ready; the guide will point out your next action.',
      ['#advance', '.phase-bar'],
    );
  }
}

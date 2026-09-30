// public/expansion-tips.mjs
// Short optional lessons for Persistent Threats, shown in the quick-tips panel of expansion matches only.
import {BY_ID, DEFAULT_POOL} from './cards.mjs';

// The player's own pending choice.
export function choiceTip(game) {
  const c = game.pending;
  if (game.pool === DEFAULT_POOL || c?.actor !== 0) return null;
  if (c.kind === 'probe')
    return '<strong>Probe.</strong> Only you see these cards. Discarding one is not always a loss: a card with Reuse can still be cast from your discard later.';
  if (c.kind === 'order')
    return '<strong>Order your triggers.</strong> The first one you place goes on the stack first, so it resolves last.';
  if (c.kind === 'pay')
    return '<strong>Pay or be countered.</strong> Paying taps ready infrastructure now, which leaves less compute for Responses this turn.';
  return '<strong>Make your choice.</strong> Automatic passing waits for your answer. Close the dialog to look at the board, then use Make your choice to reopen it.';
}

// Expansion material the player has right now, most actionable first.
export function expansionTip(game) {
  if (game.pool === DEFAULT_POOL) return null;
  const me = game.players[0];
  if (me.grave.some(c => BY_ID[c.id].reuse != null && !game.playIssues(0, c, {reuse: true}).length))
    return '<strong>Reuse.</strong> A card in your discard can be cast once more for its Reuse cost. Open your discard to cast it; afterwards it is archived.';
  if (me.hand.some(c => BY_ID[c.id].overclock && game.legal(0, c)))
    return '<strong>Overclock.</strong> Casting a card with Overclock offers a standard and a stronger version. Paying more now can leave you without a Response.';
  if (me.field.some(c => c.id === 'pt-backdoor'))
    return '<strong>Backdoors.</strong> Spend 1 compute and retire one to give a unit +2/+0, or keep them to pay costs such as Burn the Channel. They are Tools, so they can be destroyed.';
  if (me.field.some(c => c.id === 'pt-indicator'))
    return '<strong>Indicators.</strong> Spend 2 compute and retire one to draw a card. Some cards reward retiring them, so time it with your plan.';
  if (me.archive.length || game.players[1].archive.length)
    return '<strong>Archive.</strong> Archived cards are out of the game for good. Open an archive pile to see them.';
  return null;
}

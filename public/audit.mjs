// @ts-check
// public/audit.mjs
import {
  actionFields,
  applyAction,
  bottomCommit,
  canonical,
  choiceCommit,
  digest,
  playOptions,
  restoreBottoms,
  restoreChoices,
  seedHex,
  sha256Hex,
  timeoutAction,
  unflipAction,
  versusGame,
  viewFor,
} from './protocol.mjs';
import {freshClock, runningClock} from './match.mjs';
import {DEFAULT_POOL, POOLS} from './cards.mjs';

const PARTS = {
  you: 'Your cards or capacity',
  foe: 'Your opponent’s cards or capacity',
  table: 'The turn, stack or combat state',
};
// The host logs a play's options cut to the fields the engine reads (see Match.apply), while the guest keeps what it
// sent, so both sides are cut the same way before they are compared.
const fields = a =>
  (a.type === 'play' || a.type === 'activate') && a.options !== undefined
    ? actionFields({...a, options: playOptions(a.options)})
    : actionFields(a);
const same = (a, b) => canonical(fields(a)) === canonical(fields(b));

// Network delay and the two ends noticing a dropped connection at slightly different moments can make an honest
// timeout arrive a little before the guest's own clock says it is due.
export const TIMEOUT_GRACE_MS = 5000;

// The guest's own copy of the referee's clock, run on the guest's timestamps: when the match started, when each
// entry arrived, and when the guest was disconnected (the referee pauses the clock then). It needs no clock values
// from the host, so a host that invents a timeout for the guest cannot also invent the time that ran out.
function guestClock(game, {startedAt, times, gaps}) {
  const c = freshClock();
  let running = null;
  const paused = (from, to) => gaps.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(to, b) - Math.max(from, a)), 0);
  const used = at => (running ? at - running.since - paused(running.since, at) : 0);
  const restart = (at, fresh) => {
    if (running) c[running.kind] -= used(at);
    running = game.winner === null ? {kind: runningClock(c, game, fresh), since: at} : null;
  };
  restart(startedAt, false);
  return {
    timeOf: n => times[n],
    left: at => (running ? c[running.kind] - used(at) : Infinity),
    moved: at => restart(at, true),
  };
}

// Replays a finished match from the revealed seed and compares it with what this player actually saw.
// `log` is what the guest received, with the host's mulligan bottoms redacted to a count; `bottoms` is what the
// host revealed for them at the end. Only those fields are filled in, and each must match its count.
// Likewise `choices` holds the host's Probe answers, sent live only as commitments; each must match its commitment.
export async function audit({
  seedCommit,
  hostSecret,
  guestSecret,
  hostFaction,
  pool = DEFAULT_POOL,
  log: received = [],
  bottoms = null,
  choices = null,
  digests = [],
  sent = {},
  timing = null,
}) {
  const unverified = reason => ({result: 'unverified', reason});
  const tampered = (turn, reason) => ({result: 'tampered', turn, reason});
  if (!hostSecret) return unverified('Your opponent left before revealing the match seed.');
  if ((await sha256Hex(hostSecret)) !== seedCommit)
    return tampered(1, 'The revealed seed does not match the one your opponent committed to.');
  if (!guestSecret || !digests[0] || !digests[received.length])
    return unverified('Your saved record of this match is incomplete.');
  if (typeof pool !== 'string' || !Object.hasOwn(POOLS, pool))
    return unverified('This match used cards this version of the game doesn’t have.');
  const unbottomed = restoreBottoms(received, bottoms);
  if (!unbottomed)
    return tampered(1, 'The revealed opening-hand choices do not match what your opponent did during the match.');
  // Each redacted bottom was committed to when it happened; the revealed one must be that same set.
  for (const [i, e] of received.entries()) {
    if (!(e?.bottomCount > 0)) continue;
    if (
      typeof e.bottomCommit !== 'string' ||
      e.bottomCommit !== (await bottomCommit(hostSecret, e.n, unbottomed[i].bottom))
    ) {
      return tampered(1, 'Your opponent changed which cards they put on the bottom after a mulligan.');
    }
  }
  // Likewise each redacted Probe answer: it must be revealed, and be the one committed to when it was made.
  const log = restoreChoices(unbottomed, choices);
  if (!log) return tampered(1, 'Your opponent didn’t reveal the private choices they made during the match.');
  for (const [i, e] of unbottomed.entries()) {
    if (!e?.secret || e.by !== 0 || Object.hasOwn(e, 'selection')) continue;
    if (
      typeof e.selectionCommit !== 'string' ||
      e.selectionCommit !== (await choiceCommit(hostSecret, e.n, log[i].selection))
    )
      return tampered(1, 'Your opponent changed a private choice after making it.');
  }

  const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction, pool);
  const compare = async (i, turn) => {
    const want = digests[i];
    if (!want) return null; // Not seen live (e.g. while reconnecting); later views still cover this state.
    const got = await digest(viewFor(game, 1));
    if (got.all === want.all) return null;
    const part = ['you', 'foe', 'table'].find(k => got[k] !== want[k]) ?? 'table';
    return tampered(
      turn,
      i === 0 && part === 'you'
        ? 'Your opening hand differs from a fair shuffle.'
        : `${PARTS[part]} differ from a fair replay.`,
    );
  };

  // Records saved before timing was kept have none, so their timeouts are checked for their move only.
  let clock = timing?.startedAt != null && timing.times ? guestClock(game, {gaps: [], ...timing}) : null;
  let problem = await compare(0, 1);
  let lastSeq = 0;
  for (const [i, entry] of log.entries()) {
    if (problem) return problem;
    const turn = game.turn;
    if (entry.n !== i + 1) return unverified('Your saved record of this match is incomplete.');
    const at = clock?.timeOf(entry.n);
    if (at == null) clock = null; // Without this arrival time the copy loses step; later timeouts go unchecked.
    if (entry.timeout) {
      if (!same(entry, timeoutAction(game, entry.by)))
        return tampered(turn, 'A move was recorded as a timeout that is not the automatic timeout move.');
      if (entry.by === 1 && clock && clock.left(at) > TIMEOUT_GRACE_MS)
        return tampered(turn, 'Your opponent recorded a timeout for you before your clock ran out.');
    } else if (entry.by === 1) {
      if (!(entry.seq > lastSeq) || !(sent[entry.seq] && same(unflipAction(sent[entry.seq]), entry))) {
        return tampered(turn, 'A move was recorded for you that you never made.');
      }
      lastSeq = entry.seq;
    }
    // Only a Probe answer names hidden cards, so only it may be withheld until the reveal.
    if (entry.by === 0 && entry.secret && !(entry.type === 'choose' && game.pending?.kind === 'probe'))
      return tampered(turn, 'Your opponent hid a move that wasn’t a private choice.');
    try {
      applyAction(game, entry.by, entry);
    } catch {
      return tampered(turn, 'Your opponent made a move the rules do not allow.');
    }
    clock?.moved(at);
    problem = await compare(i + 1, turn);
  }
  if (problem) return problem;
  if (digests.length > log.length + 1 || game.winner === null)
    return unverified('Your saved record of this match is incomplete.');
  return {result: 'verified'};
}

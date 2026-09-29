// dist/audit.mjs
import {actionFields, applyAction, canonical, digest, seedHex, sha256Hex, timeoutAction, unflipAction, versusGame, viewFor} from './protocol.mjs';

const PARTS = {you: 'Your cards or capacity', foe: 'Your opponent’s cards or capacity', table: 'The turn, stack or combat state'};
const same = (a, b) => canonical(actionFields(a)) === canonical(actionFields(b));

// Replays a finished match from the revealed seed and compares it with what this player actually saw.
export async function audit({seedCommit, hostSecret, guestSecret, hostFaction, log = [], digests = [], sent = {}}) {
  const unverified = reason => ({result: 'unverified', reason});
  const tampered = (turn, reason) => ({result: 'tampered', turn, reason});
  if (!hostSecret) return unverified('Your opponent left before revealing the match seed.');
  if (await sha256Hex(hostSecret) !== seedCommit) return tampered(1, 'The revealed seed does not match the one your opponent committed to.');
  if (!guestSecret || !digests[0] || !digests[log.length]) return unverified('Your saved record of this match is incomplete.');

  const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction);
  const compare = async (i, turn) => {
    const want = digests[i];
    if (!want) return null; // Not seen live (e.g. while reconnecting); later views still cover this state.
    const got = await digest(viewFor(game, 1));
    if (got.all === want.all) return null;
    const part = ['you', 'foe', 'table'].find(k => got[k] !== want[k]) ?? 'table';
    return tampered(turn, i === 0 && part === 'you' ? 'Your opening hand differs from a fair shuffle.' : `${PARTS[part]} differ from a fair replay.`);
  };

  let problem = await compare(0, 1);
  let lastSeq = 0;
  for (const [i, entry] of log.entries()) {
    if (problem) return problem;
    const turn = game.turn;
    if (entry.n !== i + 1) return unverified('Your saved record of this match is incomplete.');
    if (entry.timeout) {
      if (!same(entry, timeoutAction(game, entry.by))) return tampered(turn, 'A move was recorded as a timeout that is not the automatic timeout move.');
    } else if (entry.by === 1) {
      if (!(entry.seq > lastSeq) || !(sent[entry.seq] && same(unflipAction(sent[entry.seq]), entry))) {
        return tampered(turn, 'A move was recorded for you that you never made.');
      }
      lastSeq = entry.seq;
    }
    try { applyAction(game, entry.by, entry); }
    catch { return tampered(turn, 'Your opponent made a move the rules do not allow.'); }
    problem = await compare(i + 1, turn);
  }
  if (problem) return problem;
  if (digests.length > log.length + 1 || game.winner === null) return unverified('Your saved record of this match is incomplete.');
  return {result: 'verified'};
}

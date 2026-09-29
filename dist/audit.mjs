// dist/audit.mjs
import {actionFields, applyAction, canonical, digest, seedHex, sha256Hex, unflipAction, versusGame, viewFor} from './protocol.mjs';

const PARTS = {you: 'Your cards or capacity', foe: 'Your opponent’s cards or capacity', table: 'The turn, stack or combat state'};
const same = (a, b) => canonical(actionFields(a)) === canonical(actionFields(b));

// Replays a finished match from the revealed seed and compares it with what this player actually saw.
export async function audit({seedCommit, hostSecret, guestSecret, hostFaction, log = [], digests = [], sent = {}}) {
  const unverified = reason => ({result: 'unverified', reason});
  const tampered = (turn, reason) => ({result: 'tampered', turn, reason});
  if (!hostSecret) return unverified('Your opponent left before revealing the match seed.');
  if (!guestSecret || !digests[0] || !digests[log.length]) return unverified('Your saved record of this match is incomplete.');
  if (await sha256Hex(hostSecret) !== seedCommit) return tampered(1, 'The revealed seed does not match the one your opponent committed to.');

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
  for (const [i, entry] of log.entries()) {
    if (problem) return problem;
    const turn = game.turn;
    if (entry.n !== i + 1) return unverified('Your saved record of this match is incomplete.');
    if (entry.by === 1 && !entry.timeout && !(sent[entry.seq] && same(unflipAction(sent[entry.seq]), entry))) {
      return tampered(turn, 'A move was recorded for you that you never made.');
    }
    try { applyAction(game, entry.by, entry); }
    catch { return tampered(turn, 'Your opponent made a move the rules do not allow.'); }
    problem = await compare(i + 1, turn);
  }
  return problem ?? {result: 'verified'};
}

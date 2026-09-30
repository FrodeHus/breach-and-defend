// @ts-check
import {Game} from './engine.mjs';

const INTENTS = {
  mulligan: () => ({type: 'mulligan'}),
  keep: (bottom = []) => ({type: 'keep', bottom}),
  play: (p, uid, target = null) => ({type: 'play', uid, target}),
  pass: () => ({type: 'pass'}),
  attackers: (p, uids) => ({type: 'attackers', uids}),
  blockers: (p, assignments) => ({type: 'blockers', assignments}),
  discard: uids => ({type: 'discard', uids}),
  concede: () => ({type: 'concede'}),
};

// A player's seat in a versus match: a Game rebuilt from the host's latest view,
// whose rule queries work locally and whose moves are sent to the host as intents.
export class Seat {
  constructor(send, {seq = 0, now = Date.now} = {}) {
    this.send = send;
    this.seq = seq;
    this.now = now;
    this.pending = new Map();
    this.game = null;
    this.clock = null;
    /** @type {(game: Game, info: {mine: boolean}) => void} */
    this.onUpdate = () => {};
  }

  update({view, clock = null, ackSeq = null}) {
    const game = Game.fromJSON(view);
    for (const [name, intent] of Object.entries(INTENTS)) {
      Object.defineProperty(game, name, {
        value: (...args) => this.act(intent(...args)),
        enumerable: false,
        configurable: true,
      });
    }
    this.game = game;
    this.clock = clock && {...clock, at: this.now()};
    const mine = this.pending.get(ackSeq);
    this.pending.delete(ackSeq);
    this.onUpdate(game, {mine: !!mine});
    mine?.resolve();
  }

  reject(seq, message) {
    const pending = this.pending.get(seq);
    this.pending.delete(seq);
    pending?.reject(Error(message));
  }

  dropPending(message) {
    for (const seq of [...this.pending.keys()]) this.reject(seq, message);
  }

  act(action) {
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(seq, {resolve, reject}); // Before send: the host's seat answers synchronously.
      this.send(action, seq);
    });
  }
}

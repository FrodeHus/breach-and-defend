import {Game} from './engine.mjs';
import {actionFields, applyAction, seedHex, unflipAction, versusGame, viewFor} from './protocol.mjs';

// Host-side referee: every change to a versus match, from either player, goes through here.
export class Match {
  static async create({hostFaction, hostSecret, guestSecret, seedCommit}, options) {
    const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction);
    return new Match({hostFaction, hostSecret, guestSecret, seedCommit, game: game.toJSON()}, options);
  }
  static fromJSON(json, options) { return new Match(json, options); }

  constructor(state, {now = Date.now, schedule = setTimeout, cancel = clearTimeout} = {}) {
    const {hostFaction, hostSecret, guestSecret, seedCommit} = state;
    Object.assign(this, {hostFaction, hostSecret, guestSecret, seedCommit, now, schedule, cancel});
    this.game = Game.fromJSON(state.game);
    this.log = state.log ?? [];
    this.lastSeq = state.lastSeq ?? 0;
    this.pledged = state.pledged ?? [false, false];
    this.guestConnected = false;
    this.timer = null;
    this.onChange = () => {};
  }

  get started() { return this.pledged[0] && this.pledged[1]; }
  get ended() { return this.game.winner !== null; }

  pledge(p) {
    if (this.pledged[p]) return;
    this.pledged[p] = true;
    if (this.started) { this.retime(); this.onChange({}); }
  }

  connect(on) {
    this.guestConnected = on;
    this.retime();
  }

  submit(by, action, seq = null) {
    if (by === 1 && seq !== null && seq <= this.lastSeq) return {ok: true, duplicate: true};
    const error = !this.started ? 'Both players must take the pledge first.'
      : this.ended ? 'The match has ended.'
      : !this.guestConnected && action?.type !== 'concede' ? 'Your opponent is disconnected. The match is paused until they return.'
      : !action || typeof action !== 'object' ? 'Unknown action.'
      : null;
    if (error) return {ok: false, error};
    const result = this.apply(by, by === 1 ? unflipAction(action) : action, seq, false);
    if (result.ok && by === 1 && seq !== null) this.lastSeq = seq;
    return result;
  }

  // Applies atomically: an engine error restores the exact previous state.
  apply(by, action, seq, timeout) {
    const before = this.game.toJSON();
    try { applyAction(this.game, by, action); }
    catch (e) { this.game = Game.fromJSON(before); return {ok: false, error: e.message}; }
    const entry = {...actionFields(action), n: this.log.length + 1, by, seq, timeout};
    this.log.push(entry);
    this.retime(true);
    this.onChange({entry});
    return {ok: true, entry};
  }

  view(p) { return viewFor(this.game, p); }

  // Clock stubs; Task 6 replaces these three methods.
  retime() {}
  stop() {}
  clockFor() { return null; }

  toJSON() {
    const {hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged} = this;
    return structuredClone({v: 1, hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged, game: this.game.toJSON()});
  }
}

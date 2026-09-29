import {Game} from './engine.mjs';
import {actionFields, applyAction, seedHex, timeoutAction, unflipAction, versusGame, viewFor} from './protocol.mjs';

export const TURN_MS = 90_000, RESPONSE_MS = 20_000, OPENING_MS = 60_000;
const freshClock = () => ({turn: 1, turnLeft: TURN_MS, responseLeft: RESPONSE_MS, openingLeft: OPENING_MS, running: null});

// Host-side referee: every change to a versus match, from either player, goes through here.
export class Match {
  static async create({hostFaction, hostSecret, guestSecret, seedCommit}, options) {
    const game = versusGame(await seedHex(hostSecret, guestSecret), hostFaction);
    return new Match({hostFaction, hostSecret, guestSecret, seedCommit, game: game.toJSON()}, options);
  }
  static fromJSON(json, options) { return new Match(json, options); }

  constructor(state, {now = Date.now, schedule = (fn, ms) => setTimeout(fn, ms), cancel = h => clearTimeout(h)} = {}) {
    const {hostFaction, hostSecret, guestSecret, seedCommit} = state;
    Object.assign(this, {hostFaction, hostSecret, guestSecret, seedCommit, now, schedule, cancel});
    this.game = Game.fromJSON(state.game);
    this.log = state.log ?? [];
    this.lastSeq = state.lastSeq ?? 0;
    this.pledged = state.pledged ?? [false, false];
    this.guestConnected = false;
    this.timer = null;
    this.clock = state.clock ? {...state.clock, running: null} : freshClock();
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

  // Banks the time used so far, then starts whichever clock now applies.
  retime(fresh = false) {
    this.stop();
    const g = this.game, c = this.clock;
    if (!this.started || !this.guestConnected || this.ended) return;
    let kind = 'openingLeft';
    if (g.phase !== 'opening') {
      if (c.turn !== g.turn) Object.assign(c, {turn: g.turn, turnLeft: TURN_MS});
      kind = g.actor() === g.active ? 'turnLeft' : 'responseLeft';
      if (kind === 'responseLeft' && fresh) c.responseLeft = RESPONSE_MS;
    }
    c.running = {kind, since: this.now()};
    this.timer = this.schedule(() => this.expire(), c[kind]);
  }

  stop() {
    const c = this.clock, r = c.running;
    if (r) c[r.kind] = Math.max(0, c[r.kind] - (this.now() - r.since));
    c.running = null;
    this.cancel(this.timer);
    this.timer = null;
  }

  expire() {
    this.stop();
    const g = this.game;
    const late = g.phase === 'opening' ? [0, 1].filter(p => !g.kept[p]) : [g.actor()];
    for (const p of late) if (!this.ended) this.apply(p, timeoutAction(this.game, p), null, true);
  }

  clockFor(p) {
    const c = this.clock, r = c.running;
    if (!r) return {kind: null, owner: null, left: null, paused: this.started && !this.ended && !this.guestConnected};
    const actor = this.game.phase === 'opening' ? null : this.game.actor();
    return {kind: r.kind.replace('Left', ''), owner: actor === null ? null : p === 0 ? actor : 1 - actor, left: Math.max(0, c[r.kind] - (this.now() - r.since)), paused: false};
  }

  toJSON() {
    const {hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged} = this;
    const clock = {...this.clock, running: null}, r = this.clock.running;
    if (r) clock[r.kind] = Math.max(0, clock[r.kind] - (this.now() - r.since));
    return structuredClone({v: 1, hostFaction, hostSecret, guestSecret, seedCommit, log, lastSeq, pledged, clock, game: this.game.toJSON()});
  }
}

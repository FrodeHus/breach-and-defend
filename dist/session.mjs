// dist/session.mjs
import {Match} from './match.mjs';
import {Seat} from './remote.mjs';
import {audit} from './audit.mjs';
import {digest, randomHex, sha256Hex} from './protocol.mjs';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const newMatchId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('');
export const validMatchId = id => /^[a-z2-7]{16}$/.test(id ?? '');
const failure = code => Object.assign(Error(code), {code});
const other = faction => (faction === 'blue' ? 'red' : 'blue');
// Closing right after send can drop the queued message; give it a moment to flush.
const closeSoon = conn => { setTimeout(() => conn.close(), 100); };
const backoff = n => new Promise(r => setTimeout(r, Math.min(10_000, 1000 * 2 ** n)));

class Session {
  status = 'connecting';
  error = null;
  audit = null;
  closed = false;
  onStatus = () => {};
  set(status, extra = {}) { Object.assign(this, extra, {status}); this.onStatus(this); }
}

// The host owns the Match. Its own moves go straight to the referee; the guest's arrive over the network.
export class HostSession extends Session {
  role = 'host';

  static async create({net, store, hostFaction, matchId = newMatchId(), clock}) {
    const hostSecret = randomHex();
    const record = {hostFaction, hostSecret, seedCommit: await sha256Hex(hostSecret), guestToken: randomHex(), hostToken: randomHex(), joined: false, match: null, audit: null};
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  static async resume({net, store, matchId, clock}) {
    const record = store.get(`host:${matchId}`);
    if (!record) throw failure('unknown-match');
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  constructor({net, store, matchId, record, clock}) {
    super();
    Object.assign(this, {net, store, matchId, record, clockOptions: clock, conn: null, match: null, queue: Promise.resolve()});
    this.faction = record.hostFaction;
    this.audit = record.audit;
    this.seat = new Seat((action, seq) => {
      const result = this.match ? this.match.submit(0, action, seq) : {ok: false, error: 'The match has not started yet.'};
      if (!result.ok) this.seat.reject(seq, result.error);
    });
    if (record.match) this.attach(Match.fromJSON(record.match, clock));
  }

  async open() {
    this.save();
    this.listener = await this.net.listen(this.matchId, {onconnection: conn => this.connection(conn)});
    this.refresh();
    return this;
  }

  attach(match) {
    this.match = match;
    match.onChange = ({entry} = {}) => this.changed(entry ?? null);
    this.updateSeat();
  }

  updateSeat(ackSeq = null) {
    this.seat.update({view: this.match.view(0), clock: this.match.clockFor(0), ackSeq});
  }

  refresh() {
    if (this.closed || ['cancelled', 'error'].includes(this.status)) return;
    const m = this.match;
    this.set(!m ? 'waiting' : m.ended ? 'ended' : !m.pledged[0] ? 'pledge' : !m.started ? 'pledged' : m.guestConnected ? 'playing' : 'paused');
  }

  connection(conn) {
    conn.onmessage = msg => { this.queue = this.queue.then(() => this.fromGuest(conn, msg)).catch(() => {}); };
    conn.onclose = () => {
      if (this.closed || this.conn !== conn) return;
      this.conn = null;
      if (this.match) { this.match.connect(false); this.updateSeat(); this.save(); }
      this.refresh();
    };
  }

  send(msg) { this.conn?.send(msg); }

  async fromGuest(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') return this.hello(conn, msg);
    if (conn !== this.conn) return;
    switch (msg.type) {
      case 'seed': return this.seeded(msg.guestSecret);
      case 'pledge': this.match?.pledge(1); this.save(); return this.refresh();
      case 'intent': return this.intent(msg);
      case 'audit': this.record.audit = this.audit = msg.result ?? null; this.save(); return this.refresh();
      case 'leave': this.dispose(); return this.set('cancelled');
    }
  }

  hello(conn, {guestToken}) {
    const r = this.record;
    if (r.joined && guestToken !== r.guestToken) { conn.send({type: 'error', code: 'full'}); closeSoon(conn); return; }
    if (this.conn && this.conn !== conn) this.conn.close();
    this.conn = conn;
    if (!this.match) {
      r.joined = true;
      this.save();
      conn.send({type: 'welcome', guestToken: r.guestToken, hostToken: r.hostToken, seedCommit: r.seedCommit, hostFaction: r.hostFaction});
      return;
    }
    const m = this.match;
    m.connect(true);
    this.updateSeat();
    conn.send({...this.viewMessage(), type: 'resume', hostToken: r.hostToken, log: m.log, started: m.started, pledged: m.pledged[1], reveal: m.ended ? r.hostSecret : null});
    this.save();
    this.refresh();
  }

  async seeded(guestSecret) {
    if (this.match || !/^[0-9a-f]{32}$/.test(guestSecret ?? '')) return;
    const r = this.record;
    this.attach(await Match.create({hostFaction: r.hostFaction, hostSecret: r.hostSecret, guestSecret, seedCommit: r.seedCommit}, this.clockOptions));
    this.match.connect(!!this.conn);
    this.save();
    this.refresh();
  }

  intent({seq, action}) {
    if (!Number.isInteger(seq)) return;
    const result = this.match ? this.match.submit(1, action, seq) : {ok: false, error: 'The match has not started yet.'};
    if (!result.ok) this.send({type: 'reject', seq, error: result.error});
    else if (result.duplicate) this.send(this.viewMessage(null, seq));
  }

  changed(entry) {
    this.send(this.viewMessage(entry, entry?.by === 1 ? entry.seq : null));
    this.updateSeat(entry?.by === 0 ? entry.seq : null);
    if (this.match.ended) this.send({type: 'reveal', hostSecret: this.record.hostSecret});
    this.save();
    this.refresh();
  }

  viewMessage(entry = null, ackSeq = null) {
    return {type: 'view', entry, ackSeq, view: this.match.view(1), clock: this.match.clockFor(1)};
  }

  pledge() { this.match?.pledge(0); this.save(); this.refresh(); }

  leave() {
    if (this.match?.started && !this.match.ended) return this.seat.game.concede(0);
    const ended = !!this.match?.ended;
    if (!ended) this.send({type: 'leave'});
    this.dispose(true, !ended);
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true, flush = false) {
    if (this.closed) return;
    this.match?.stop();
    if (removeRecord) this.store.remove(`host:${this.matchId}`); else this.save();
    this.closed = true;
    this.listener?.close();
    if (flush && this.conn) closeSoon(this.conn); else this.conn?.close();
  }

  save() {
    if (this.closed) return;
    this.record.match = this.match?.toJSON() ?? null;
    this.store.set(`host:${this.matchId}`, this.record);
  }
}

// The guest never holds hidden state. It records what it saw so it can audit the host at the end.
export class GuestSession extends Session {
  role = 'guest';

  static async join({net, store, matchId, retry = backoff}) {
    const s = new GuestSession({net, store, matchId, retry});
    try { await s.connect(); }
    catch (e) {
      if (!s.record.guestToken) throw e;
      s.set('reconnecting');
      s.reconnect();
    }
    return s;
  }

  constructor({net, store, matchId, retry}) {
    super();
    Object.assign(this, {net, store, matchId, retry, conn: null, queue: Promise.resolve(), attempts: 0});
    this.record = store.get(`guest:${matchId}`) ?? {guestToken: null, hostToken: null, seedCommit: null, hostFaction: null, guestSecret: null, pledged: false, seq: 0, sent: {}, log: [], digests: [], hostSecret: null, audit: null};
    this.faction = this.record.hostFaction && other(this.record.hostFaction);
    this.audit = this.record.audit;
    this.seat = new Seat((action, seq) => {
      if (!this.conn) return this.seat.reject(seq, 'Reconnecting to your opponent…');
      this.record.sent[seq] = action;
      this.record.seq = seq;
      this.save();
      this.conn.send({type: 'intent', seq, action});
    }, {seq: this.record.seq});
  }

  async connect() {
    const conn = await this.net.dial(this.matchId);
    if (this.closed) return conn.close();
    this.conn = conn;
    this.attempts = 0;
    conn.onmessage = msg => { this.queue = this.queue.then(() => this.fromHost(msg)).catch(() => {}); };
    conn.onclose = () => this.lost(conn);
    conn.send({type: 'hello', guestToken: this.record.guestToken});
  }

  lost(conn) {
    if (this.closed || this.conn !== conn) return;
    this.conn = null;
    this.seat.dropPending('Connection lost. Reconnecting…');
    this.set('reconnecting');
    this.reconnect();
  }

  async reconnect() {
    while (!this.closed && !this.conn) {
      await this.retry(this.attempts++);
      try { await this.connect(); } catch { /* The host may be reloading; keep trying. */ }
    }
  }

  async fromHost(msg) {
    const r = this.record;
    switch (msg?.type) {
      case 'error':
        this.dispose(msg.code === 'full');
        return this.set('error', {error: msg.code});
      case 'welcome':
        if (r.hostToken && msg.hostToken !== r.hostToken) return this.impostor();
        Object.assign(r, {guestToken: msg.guestToken, hostToken: msg.hostToken, seedCommit: msg.seedCommit, hostFaction: msg.hostFaction});
        r.guestSecret ??= randomHex();
        this.faction = other(r.hostFaction);
        this.save();
        this.conn.send({type: 'seed', guestSecret: r.guestSecret});
        if (r.pledged) this.conn.send({type: 'pledge'});
        return this.set(r.pledged ? 'pledged' : 'pledge');
      case 'resume':
        if (msg.hostToken !== r.hostToken) return this.impostor();
        if (r.pledged && !msg.pledged && !msg.started) this.conn.send({type: 'pledge'});
        if (msg.started) {
          for (const entry of msg.log.slice(r.log.length)) r.log.push(entry);
          r.digests[r.log.length] ??= await digest(msg.view);
        }
        this.save();
        this.seat.update(msg);
        if (msg.reveal) return this.revealed(msg.reveal);
        return this.set(!msg.started ? (r.pledged ? 'pledged' : 'pledge') : 'playing');
      case 'view': {
        const {entry} = msg;
        if (entry) {
          // A missing message means the channel broke; reconnecting resends the whole log.
          if (entry.n !== r.log.length + 1) { this.conn?.close(); return; }
          r.log.push(entry);
          r.digests[entry.n] = await digest(msg.view);
        } else if (!r.log.length) r.digests[0] ??= await digest(msg.view);
        this.save();
        this.seat.update(msg);
        if (this.status !== 'ended') this.set('playing');
        return;
      }
      case 'reject': return this.seat.reject(msg.seq, msg.error);
      case 'reveal': return this.revealed(msg.hostSecret);
      case 'leave': this.dispose(); return this.set('cancelled');
    }
  }

  async revealed(hostSecret) {
    const r = this.record;
    if (!r.audit) {
      r.hostSecret = hostSecret;
      r.audit = await audit(r);
      this.save();
    }
    this.audit = r.audit;
    this.conn?.send({type: 'audit', result: r.audit});
    this.set('ended');
  }

  impostor() { this.dispose(false); this.set('error', {error: 'impostor'}); }

  pledge() {
    this.record.pledged = true;
    this.save();
    this.conn?.send({type: 'pledge'});
    this.set('pledged');
  }

  leave() {
    if (this.status === 'playing' && this.seat.game?.winner === null) return this.seat.game.concede(0);
    const ended = this.status === 'ended';
    if (!ended) this.conn?.send({type: 'leave'});
    this.dispose(true, !ended);
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true, flush = false) {
    if (this.closed) return;
    if (removeRecord) this.store.remove(`guest:${this.matchId}`); else this.save();
    this.closed = true;
    if (flush && this.conn) closeSoon(this.conn); else this.conn?.close();
  }

  save() { if (!this.closed) this.store.set(`guest:${this.matchId}`, this.record); }

  settled() { return this.queue; }
}

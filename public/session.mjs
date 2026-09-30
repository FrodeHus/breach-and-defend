// @ts-check
// public/session.mjs
import {Match} from './match.mjs';
import {Seat} from './remote.mjs';
import {audit} from './audit.mjs';
import {DEFAULT_POOL, poolReleased} from './cards.mjs';
import {
  bottomCommit,
  canonical,
  choiceCommit,
  digest,
  hostBottoms,
  hostChoices,
  randomHex,
  redactEntry,
  safeKeys,
  sanitizeView,
  sha256Hex,
} from './protocol.mjs';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export const newMatchId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => ALPHABET[b & 31]).join('');
export const validMatchId = id => /^[a-z2-7]{16}$/.test(id ?? '');
const failure = code => Object.assign(Error(code), {code});
const other = faction => (faction === 'blue' ? 'red' : 'blue');
// Sends a last message and stops using the connection. The receiver closes it; the timer is only a fallback.
function retire(conn, msg) {
  const prev = conn.onclose;
  const timer = setTimeout(() => conn.close(), 3000);
  /** @type {any} */ (timer).unref?.(); // Node only: tests must not wait on this fallback.
  conn.onmessage = () => {};
  conn.onclose = (...a) => {
    clearTimeout(timer);
    prev?.(...a);
  };
  conn.send(msg);
}
const backoff = n => new Promise(r => setTimeout(r, Math.min(10_000, 1000 * 2 ** n)));

class Session {
  status = 'connecting';
  error = null;
  audit = null;
  closed = false;
  /** @type {(session: Session) => void} */
  onStatus = () => {};
  final = false; // Set once a session has stepped aside for good; later status changes are ignored.
  set(status, extra = {}) {
    if (this.final) return;
    Object.assign(this, extra, {status});
    this.onStatus(this);
  }

  // Messages are handled (and, on the host, sent) through ordered promise chains. `pending` counts the jobs
  // queued on them that have not finished, so callers can tell when a session has nothing left in flight.
  pending = 0;
  /** @type {string[]} Names of the promise-chain fields that `enqueue` and `settled` use. */
  chains = [];
  enqueue(chain, job, onError) {
    this.pending++;
    this[chain] = this[chain]
      .then(job)
      .catch(onError)
      .finally(() => {
        this.pending--;
      });
  }
  // Resolves once every queued job has finished, including jobs queued by those jobs.
  async settled() {
    while (this.pending > 0) await Promise.all(this.chains.map(c => this[c]));
  }
}

// The host owns the Match. Its own moves go straight to the referee; the guest's arrive over the network.
export class HostSession extends Session {
  role = 'host';
  chains = ['queue', 'outbox'];

  // `random` exists so tests can fix the secrets (and with them the shuffles); the app never passes it.
  static async create({
    net,
    store,
    hostFaction,
    pool = DEFAULT_POOL,
    matchId = newMatchId(),
    clock,
    random = randomHex,
  }) {
    if (!poolReleased(pool)) throw Error(`Unknown card pool: ${pool}.`);
    const hostSecret = random();
    const record = {
      hostFaction,
      pool,
      hostSecret,
      seedCommit: await sha256Hex(hostSecret),
      guestToken: random(),
      hostToken: random(),
      joined: false,
      match: null,
      audit: null,
    };
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  static async resume({net, store, matchId, clock}) {
    const record = store.get(`host:${matchId}`);
    if (!record) throw failure('unknown-match');
    return new HostSession({net, store, matchId, record, clock}).open();
  }

  constructor({net, store, matchId, record, clock}) {
    super();
    this.net = net;
    this.store = store;
    this.matchId = matchId;
    this.record = record;
    this.clockOptions = clock;
    this.conn = null;
    this.match = null;
    this.queue = Promise.resolve();
    this.outbox = Promise.resolve();
    record.bottomCommits ??= {};
    record.choiceCommits ??= {};
    this.faction = record.hostFaction;
    // Records saved before card pools existed are First Breach matches.
    this.pool = record.pool ?? DEFAULT_POOL;
    this.audit = record.audit;
    this.seat = new Seat((action, seq) => {
      const result = this.match
        ? this.match.submit(0, action, seq)
        : {ok: false, error: 'The match has not started yet.'};
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
    match.onChange = change => this.changed(change?.entry ?? null);
    this.updateSeat();
  }

  updateSeat(ackSeq = null) {
    this.seat.update({view: this.match.view(0), clock: this.match.clockFor(0), ackSeq});
  }

  refresh() {
    if (this.closed || ['cancelled', 'error'].includes(this.status)) return;
    const m = this.match;
    this.set(
      !m
        ? 'waiting'
        : m.ended
          ? 'ended'
          : !m.pledged[0]
            ? 'pledge'
            : !m.started
              ? 'pledged'
              : m.guestConnected
                ? 'playing'
                : 'paused',
    );
  }

  connection(conn) {
    conn.onmessage = msg =>
      this.enqueue(
        'queue',
        () => this.fromGuest(conn, msg),
        () => {},
      );
    conn.onclose = () => {
      if (this.closed || this.conn !== conn) return;
      this.conn = null;
      if (this.match) {
        this.match.connect(false);
        this.updateSeat();
        this.save();
      }
      this.refresh();
    };
  }

  send(msg) {
    this.post(msg);
  }

  // Every message to the guest goes through one ordered queue: a host keep entry is redacted to a count plus a
  // hash commitment, and hashing is asynchronous. The message (its view in particular) is captured now; only
  // the redaction waits. Commitments are kept in the record, so a reloaded host sends the same ones.
  post(msg, conn = this.conn) {
    if (!conn) return;
    const {entry, log} = msg;
    this.afterSent(async () => {
      const out = {...msg};
      if (entry !== undefined) out.entry = await this.redact(entry);
      if (log !== undefined) out.log = await Promise.all(log.map(e => this.redact(e)));
      conn.send(out);
    });
  }

  // Runs `job` once every message queued before it has gone out, so a last word or a close never overtakes them.
  afterSent(job) {
    this.enqueue('outbox', job, e => console.error('Breach & Defend: could not send to the guest', e));
  }

  async redact(entry) {
    const out = redactEntry(entry);
    if (out?.bottomCount) {
      const commits = this.record.bottomCommits;
      commits[entry.n] ??= await bottomCommit(this.record.hostSecret, entry.n, entry.bottom);
      return {...out, bottomCommit: commits[entry.n]};
    }
    if (out?.secret && out.by === 0) {
      const commits = this.record.choiceCommits;
      commits[entry.n] ??= await choiceCommit(this.record.hostSecret, entry.n, entry.selection);
      return {...out, selectionCommit: commits[entry.n]};
    }
    return out;
  }

  async fromGuest(conn, msg) {
    if (this.closed || !msg || typeof msg !== 'object') return; // A disposed host only finishes sending.
    try {
      safeKeys(msg);
    } catch {
      return;
    } // The guest is untrusted too: no prototype keys or non-plain objects.
    if (msg.type === 'hello') return this.hello(conn, msg);
    if (conn !== this.conn) return;
    switch (msg.type) {
      case 'seed':
        return this.seeded(msg.guestSecret);
      case 'pledge':
        this.match?.pledge(1);
        this.save();
        return this.refresh();
      case 'intent':
        return this.intent(msg);
      case 'audit':
        this.record.audit = this.audit = msg.result ?? null;
        this.save();
        return this.refresh();
      case 'leave':
        if (this.match?.started && !this.match.ended) {
          this.match.submit(1, {type: 'concede'});
          return;
        }
        this.dispose();
        return this.set('cancelled');
    }
  }

  hello(conn, {guestToken, have}) {
    const r = this.record;
    if (r.joined && guestToken !== r.guestToken) {
      retire(conn, {type: 'error', code: 'full'});
      return;
    }
    // The same guest again while its old connection is still open: another tab, or a reload the host has not
    // noticed yet. The newest connection wins; the old one is told why, so it stops instead of reconnecting.
    if (this.conn && this.conn !== conn) {
      const old = this.conn;
      this.conn = null;
      if (r.joined) retire(old, {type: 'error', code: 'replaced'});
      else old.close();
    }
    this.conn = conn;
    if (!this.match) {
      conn.send({
        type: 'welcome',
        guestToken: r.guestToken,
        hostToken: r.hostToken,
        seedCommit: r.seedCommit,
        hostFaction: r.hostFaction,
        pool: this.pool,
      });
      return;
    }
    const m = this.match;
    m.connect(true);
    this.updateSeat();
    // Send only the log entries the guest lacks. A guest claiming more than the host has gets none and
    // decides for itself (see GuestSession 'resume'); a guest that sent no count gets the whole log.
    const from = Number.isInteger(have) && have > 0 ? Math.min(have, m.log.length) : 0;
    this.post(
      {
        ...this.viewMessage(),
        type: 'resume',
        hostToken: r.hostToken,
        from,
        log: m.log.slice(from),
        started: m.started,
        pledged: m.pledged[1],
        reveal: m.ended ? this.reveal() : null,
      },
      conn,
    );
    this.save();
    this.refresh();
  }

  async seeded(guestSecret) {
    if (this.match || !/^[0-9a-f]{32}$/.test(guestSecret ?? '')) return;
    const r = this.record;
    r.joined = true;
    this.attach(
      await Match.create(
        {hostFaction: r.hostFaction, pool: this.pool, hostSecret: r.hostSecret, guestSecret, seedCommit: r.seedCommit},
        this.clockOptions,
      ),
    );
    this.match.connect(!!this.conn);
    this.save();
    this.refresh();
  }

  intent({seq, action}) {
    if (!Number.isInteger(seq)) return;
    const result = this.match
      ? this.match.submit(1, action, seq)
      : {ok: false, error: 'The match has not started yet.'};
    if (!result.ok) this.send({type: 'reject', seq, error: result.error});
    else if (result.duplicate) this.send(this.viewMessage(null, seq));
  }

  changed(entry) {
    this.send(this.viewMessage(entry, entry?.by === 1 ? entry.seq : null));
    this.updateSeat(entry?.by === 0 ? entry.seq : null);
    if (this.match.ended) this.send({type: 'reveal', ...this.reveal()});
    this.save();
    this.refresh();
  }

  viewMessage(entry = null, ackSeq = null) {
    return {type: 'view', entry, ackSeq, view: this.match.view(1), clock: this.match.clockFor(1)};
  }

  // What the guest needs to audit: the seed, the host's mulligan bottoms it was only told the count of, and the
  // host's Probe answers it was only given commitments to (sent only when there were any, so a First Breach reveal
  // is exactly what it was before).
  reveal() {
    const choices = hostChoices(this.match.log);
    return {
      hostSecret: this.record.hostSecret,
      bottoms: hostBottoms(this.match.log),
      ...(Object.keys(choices).length ? {choices} : {}),
    };
  }

  pledge() {
    this.match?.pledge(0);
    this.save();
    this.refresh();
  }

  leave() {
    if (this.match?.started && !this.match.ended) return this.seat.game.concede(0);
    const ended = !!this.match?.ended;
    const conn = this.conn;
    if (!ended && conn) {
      this.conn = null;
      this.afterSent(() => retire(conn, {type: 'leave'}));
    }
    this.dispose();
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true) {
    if (this.closed) return;
    this.match?.stop();
    if (removeRecord) this.store.remove(`host:${this.matchId}`);
    else this.save();
    this.closed = true;
    this.listener?.close();
    // Let queued views (and the final reveal) reach the guest before the connection closes.
    const conn = this.conn;
    this.conn = null;
    if (conn) this.afterSent(() => conn.close());
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
  chains = ['queue'];

  static async join({net, store, matchId, retry = backoff, random = randomHex, now = Date.now}) {
    const s = new GuestSession({net, store, matchId, retry, random, now});
    try {
      await s.connect();
    } catch (e) {
      if (!s.record.guestToken) throw e;
      s.set('reconnecting');
      s.reconnect();
    }
    return s;
  }

  constructor({net, store, matchId, retry, random = randomHex, now = Date.now}) {
    super();
    this.now = now;
    this.net = net;
    this.store = store;
    this.matchId = matchId;
    this.retry = retry;
    this.random = random;
    this.conn = null;
    this.queue = Promise.resolve();
    this.attempts = 0;
    const saved = store.get(`guest:${matchId}`);
    this.record = saved ?? {
      guestToken: null,
      hostToken: null,
      seedCommit: null,
      hostFaction: null,
      pool: null,
      guestSecret: null,
      pledged: false,
      seq: 0,
      sent: {},
      log: [],
      digests: [],
      hostSecret: null,
      bottoms: null,
      audit: null,
    };
    // Each tab has its own owner id. The newest tab to open the match claims the shared record; an older tab
    // that finds someone else's id there (or a record ahead of its own) steps aside instead of playing on.
    this.owner = randomHex(8);
    this.record.owner = this.owner;
    // When the match started, when each entry arrived and when this guest was away, all by this browser's clock,
    // so the audit can check that a timeout recorded for this guest came after its clock had really run out.
    const timing = (this.record.timing ??= {startedAt: null, times: {}, gaps: []});
    // A reload: the host paused the clock when this tab went away. Counting from now errs toward the host.
    if (saved?.started && !saved.audit) timing.gapFrom ??= now();
    if (saved) store.set(`guest:${matchId}`, this.record);
    this.faction = this.record.hostFaction && other(this.record.hostFaction);
    this.pool = this.record.pool ?? DEFAULT_POOL;
    this.audit = this.record.audit;
    this.seat = new Seat(
      (action, seq) => {
        if (!this.conn) return this.seat.reject(seq, 'Reconnecting to your opponent…');
        this.record.sent[seq] = action;
        this.record.seq = seq;
        this.save();
        this.conn.send({type: 'intent', seq, action});
      },
      {seq: this.record.seq},
    );
  }

  async connect() {
    if (this.superseded()) return this.stepAside();
    const conn = await this.net.dial(this.matchId);
    if (this.closed) return conn.close();
    this.conn = conn;
    this.attempts = 0;
    conn.onmessage = msg => {
      const at = this.now(); // Arrival time, before any wait in the queue.
      this.enqueue(
        'queue',
        () => this.fromHost(msg, conn, at),
        e => this.failed(e),
      );
    };
    // A close is handled in turn with the messages that arrived before it, never ahead of them.
    conn.onclose = () => {
      const at = this.now();
      this.enqueue(
        'queue',
        () => this.lost(conn, at),
        e => this.failed(e),
      );
    };
    conn.send({type: 'hello', guestToken: this.record.guestToken, have: this.record.log.length});
  }

  lost(conn, at = this.now()) {
    if (this.closed || this.conn !== conn) return;
    this.conn = null;
    conn.onmessage = () => {}; // Late messages on a dead connection must not act on the session.
    if (this.status === 'ended') return; // Revealed and audited: nothing is left to reconnect for.
    this.record.timing.gapFrom ??= at;
    this.save();
    if (!this.record.guestToken) {
      this.dispose();
      return this.set('error', {error: 'no-connection'});
    }
    this.seat.dropPending('Connection lost. Reconnecting…');
    this.set('reconnecting');
    this.reconnect();
  }

  async reconnect() {
    while (!this.closed && !this.conn) {
      await this.retry(this.attempts++);
      try {
        await this.connect();
      } catch {
        /* The host may be reloading; keep trying. */
      }
    }
  }

  // A bug here must not leave the page silently stuck: stop the match, keeping the record so a reload resumes.
  failed(e) {
    console.error('Breach & Defend: versus message failed', e);
    if (this.closed) return;
    this.dispose(false);
    this.set('error', {error: 'internal'});
  }

  async fromHost(msg, conn = this.conn, at = this.now()) {
    if (this.closed || conn !== this.conn) return;
    const r = this.record,
      timing = r.timing;
    if (msg?.type === 'view' || msg?.type === 'resume') {
      // The host is untrusted: its view is rendered, so anything but the exact view shape stops the match.
      try {
        safeKeys(msg);
        sanitizeView(msg.view);
      } catch {
        return this.impostor();
      }
    }
    if (timing.gapFrom != null && ['welcome', 'resume', 'view'].includes(msg?.type)) {
      timing.gaps.push([timing.gapFrom, at]); // Back in touch: the host restarted the clock on reconnecting.
      delete timing.gapFrom;
    }
    switch (msg?.type) {
      case 'error':
        // Another tab of this browser now owns the match and its saved record: stop without touching either.
        if (msg.code === 'replaced') return this.stepAside();
        this.dispose(msg.code === 'full');
        return this.set('error', {error: msg.code});
      case 'welcome': {
        if (r.hostToken && msg.hostToken !== r.hostToken) return this.impostor();
        // A host from before card pools sends none: that is First Breach.
        const pool = msg.pool ?? DEFAULT_POOL;
        // The terms are fixed at the first welcome. A host that changed its seed commitment after learning this
        // guest's secret could choose the shuffle; one that changed the pool would play cards the guest never agreed to.
        if (r.seedCommit && (msg.seedCommit !== r.seedCommit || msg.hostFaction !== r.hostFaction))
          return this.impostor();
        if (r.pool && r.pool !== pool) return this.impostor();
        // A pool this build hasn't released may have different cards from the host's build.
        if (!poolReleased(pool)) {
          this.dispose(true);
          return this.set('error', {error: 'unknown-pool'});
        }
        Object.assign(r, {
          guestToken: msg.guestToken,
          hostToken: msg.hostToken,
          seedCommit: msg.seedCommit,
          hostFaction: msg.hostFaction,
          pool,
        });
        this.pool = pool;
        r.guestSecret ??= this.random();
        this.faction = other(r.hostFaction);
        this.save();
        this.conn.send({type: 'seed', guestSecret: r.guestSecret});
        if (r.pledged) this.conn.send({type: 'pledge'});
        return this.set(r.pledged ? 'pledged' : 'pledge');
      }
      case 'resume':
        if (msg.hostToken !== r.hostToken) return this.impostor();
        if (r.pledged && !msg.pledged && !msg.started) this.conn.send({type: 'pledge'});
        if (msg.started) {
          // The host resends the log from `from`, the count this guest reported (a count sent before an
          // in-flight view was recorded may be lower, so overlapping entries must match). A host whose log
          // skips entries, is shorter than what it already sent, or rewrites them has broken its own history:
          // the audit could never pass, so it is treated like an impostor.
          const from = msg.from ?? 0,
            have = r.log.length;
          if (
            !Number.isInteger(from) ||
            from < 0 ||
            from > have ||
            !Array.isArray(msg.log) ||
            from + msg.log.length < have
          )
            return this.impostor();
          if (msg.log.slice(0, have - from).some((e, i) => canonical(e) !== canonical(r.log[from + i])))
            return this.impostor();
          r.started = true;
          timing.startedAt ??= at;
          for (const entry of msg.log.slice(have - from)) {
            r.log.push(entry);
            timing.times[entry.n] = at; // Missed while away: the audit dates them to when the guest lost touch.
          }
          r.digests[r.log.length] ??= await digest(msg.view);
        }
        this.save();
        this.seat.update(msg);
        if (msg.reveal) return this.revealed(msg.reveal);
        return this.set(!msg.started ? (r.pledged ? 'pledged' : 'pledge') : 'playing');
      case 'view': {
        const {entry} = msg;
        r.started = true;
        timing.startedAt ??= at;
        if (entry) {
          // A missing message means the channel broke; reconnecting resends the entries this guest lacks.
          if (entry.n !== r.log.length + 1) {
            this.conn?.close();
            return;
          }
          r.log.push(entry);
          timing.times[entry.n] = at;
          r.digests[entry.n] = await digest(msg.view);
        } else if (!r.log.length) r.digests[0] ??= await digest(msg.view);
        this.save();
        this.seat.update(msg);
        if (this.status !== 'ended') this.set('playing');
        return;
      }
      case 'reject':
        return this.seat.reject(msg.seq, msg.error);
      case 'reveal':
        return this.revealed(msg);
      case 'leave':
        this.dispose();
        return this.set('cancelled');
    }
  }

  async revealed(reveal) {
    const r = this.record;
    if (!r.audit) {
      const secret = typeof reveal === 'string' ? reveal : reveal?.hostSecret; // A string: a host from before bottoms were redacted.
      r.hostSecret = typeof secret === 'string' ? secret : null;
      r.bottoms = reveal?.bottoms && typeof reveal.bottoms === 'object' ? reveal.bottoms : null;
      r.choices = reveal?.choices && typeof reveal.choices === 'object' ? reveal.choices : null;
      r.audit = await audit(r);
      this.save();
    }
    this.audit = r.audit;
    this.conn?.send({type: 'audit', result: r.audit});
    this.set('ended');
  }

  impostor() {
    this.dispose(false);
    this.set('error', {error: 'impostor'});
  }

  pledge() {
    this.record.pledged = true;
    this.save();
    this.conn?.send({type: 'pledge'});
    this.set('pledged');
  }

  leave() {
    const started = this.record.started && this.status !== 'ended';
    if (started && this.conn && this.seat.game?.winner === null) return this.seat.game.concede(0);
    const ended = this.status === 'ended';
    const conn = this.conn;
    if (!ended && !started && conn) {
      this.conn = null;
      retire(conn, {type: 'leave'});
    }
    this.dispose();
    if (!ended) this.set('cancelled');
  }

  dispose(removeRecord = true) {
    if (this.closed) return;
    if (this.superseded()) return this.stepAside();
    if (removeRecord) this.store.remove(`guest:${this.matchId}`);
    else this.save();
    this.closed = true;
    this.conn?.close();
  }

  // True when another tab now owns this match's saved record.
  superseded() {
    const stored = this.store.get(`guest:${this.matchId}`);
    if (!stored) return false;
    const r = this.record;
    return stored.owner !== this.owner || (stored.log?.length ?? 0) > r.log.length || (stored.seq ?? 0) > r.seq;
  }

  // Terminal: the other tab has the match and its record, so this one neither saves, removes nor reconnects.
  stepAside() {
    if (this.final) return;
    this.set('error', {error: 'replaced'});
    this.final = true;
    this.closed = true;
    this.seat.dropPending('This match is open in another tab or window.');
    this.conn?.close();
  }

  save() {
    if (this.closed) return;
    if (this.superseded()) return this.stepAside();
    this.store.set(`guest:${this.matchId}`, this.record);
  }
}

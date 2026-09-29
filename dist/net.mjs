// Peer-to-peer transport over PeerJS. PeerJS loads only when a versus match starts.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
const PEERJS_SRI = 'sha384-x0YgkOr/3UOZP2CRDxGW9e0Q+2Qjyr3uJrm4xU32Y7ZCNAo7Cc7bjhrZMi/dwczu';
const CONNECT_MS = 20_000, ID_RETRY_MS = 3_000, ID_WAIT_MS = 30_000;

export const peerId = matchId => `bnd-${matchId}`;
export const netError = code => Object.assign(Error(code), {code});

let loading = null;
export function loadPeer() {
  if (globalThis.Peer) return Promise.resolve(globalThis.Peer);
  return (loading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), {src: PEERJS_URL, integrity: PEERJS_SRI, crossOrigin: 'anonymous'});
    script.onload = () => resolve(globalThis.Peer);
    script.onerror = () => { loading = null; script.remove(); reject(netError('server')); };
    document.head.append(script);
  }));
}

// PeerJS 1.5.5's JSON channel refuses any single message of 16,300 bytes or more (it errors instead of
// chunking), and a late-game view or resume is bigger than that. So large messages go out as frames:
// the message's JSON cut into pieces of at most FRAME_CHARS UTF-16 units. Each unit is at most 3 bytes of
// UTF-8, or 2 once JSON-escaped, so a frame stays near 12 KB, well under the limit.
export const FRAME_CHARS = 4000;
const FRAME = '__frame';

export function toFrames(msg, id, size = FRAME_CHARS) {
  if (!(size >= 2)) throw RangeError('Frame size must be at least 2.'); // Smaller could never advance past a surrogate pair.
  const json = JSON.stringify(msg);
  if (json.length <= size) return [msg];
  const parts = [];
  for (let at = 0; at < json.length;) {
    let end = Math.min(json.length, at + size);
    // Never split a surrogate pair across frames.
    if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
    parts.push(json.slice(at, end));
    at = end;
  }
  return parts.map((part, i) => ({type: FRAME, id, i, n: parts.length, part}));
}

// Returns a receiver: pass it each incoming message; it returns the message to deliver, or undefined while a
// framed message is still incomplete. Frames of a message arrive in order on the reliable channel; a frame
// out of sequence discards the partial message rather than delivering a corrupted one.
export function fromFrames() {
  let id = null, parts = [];
  return msg => {
    if (msg?.type !== FRAME) return msg;
    if (msg.i === 0) { id = msg.id; parts = []; }
    if (msg.id !== id || msg.i !== parts.length) { id = null; parts = []; return undefined; }
    parts.push(msg.part);
    if (parts.length < msg.n) return undefined;
    const json = parts.join('');
    id = null; parts = [];
    return JSON.parse(json);
  };
}

export function wrap(conn, onClosed = () => {}) {
  let closed = false, sent = 0;
  const receive = fromFrames();
  const c = {
    send: msg => { if (conn.open) for (const f of toFrames(msg, ++sent)) conn.send(f); },
    close: () => conn.close(),
    onmessage() {},
    onclose() {},
  };
  const done = () => { if (closed) return; closed = true; onClosed(); c.onclose(); };
  conn.on('data', data => {
    let msg;
    try { msg = receive(data); } catch { return conn.close(); }
    if (msg !== undefined) c.onmessage(msg);
  });
  conn.on('close', done);
  // Close on error too, so the other end hears about it and reconnects instead of waiting on a dead channel.
  conn.on('error', () => { try { conn.close(); } catch {} done(); });
  return c;
}

export async function listen(matchId, {onconnection}) {
  const Peer = await loadPeer(), started = Date.now();
  for (;;) {
    try { return await register(Peer, matchId, onconnection); }
    catch (e) {
      // A reloaded host tab can briefly find its own old id still registered.
      if (e.code !== 'id-taken' || Date.now() - started > ID_WAIT_MS) throw e;
      await new Promise(r => setTimeout(r, ID_RETRY_MS));
    }
  }
}

function register(Peer, matchId, onconnection) {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerId(matchId));
    let open = false;
    peer.on('open', () => { open = true; resolve({close: () => peer.destroy()}); });
    peer.on('connection', conn => conn.on('open', () => onconnection(wrap(conn))));
    peer.on('disconnected', () => { if (open && !peer.destroyed) peer.reconnect(); });
    peer.on('error', e => {
      if (open) return;
      peer.destroy();
      reject(netError(e.type === 'unavailable-id' ? 'id-taken' : 'server'));
    });
  });
}

export async function dial(matchId) {
  const Peer = await loadPeer();
  return new Promise((resolve, reject) => {
    const peer = new Peer();
    let settled = false;
    const fail = code => { if (settled) return; settled = true; clearTimeout(timer); peer.destroy(); reject(netError(code)); };
    const timer = setTimeout(() => fail('no-connection'), CONNECT_MS);
    peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'host-offline' : ['network', 'server-error', 'socket-error'].includes(e.type) ? 'server' : 'no-connection'));
    peer.on('open', () => {
      const conn = peer.connect(peerId(matchId), {reliable: true, serialization: 'json'});
      conn.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(wrap(conn, () => peer.destroy()));
      });
    });
  });
}

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

function wrap(conn, onClosed = () => {}) {
  let closed = false;
  const c = {send: msg => { if (conn.open) conn.send(msg); }, close: () => conn.close(), onmessage() {}, onclose() {}};
  const done = () => { if (closed) return; closed = true; onClosed(); c.onclose(); };
  conn.on('data', msg => c.onmessage(msg));
  conn.on('close', done);
  conn.on('error', done);
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

// In-memory stand-in for public/net.mjs with the same listen/dial/connection contract. Messages go through
// net.mjs's own framing, so the session tests exercise it.
import {toFrames, fromFrames} from '../../public/net.mjs';

// PeerJS 1.5.5's JSON channel refuses a single message of 16,300 bytes or more: it emits an error that
// closes the sender's end while the receiver hears nothing. The fake enforces a slightly lower limit.
export const MESSAGE_LIMIT = 16_000;
export function fakeNet({framing = true} = {}) {
  const hosts = new Map(),
    live = new Set(),
    tooBig = [];
  let inFlight = 0; // Deliveries (frames, closes, new connections) queued but not yet run.
  const later = fn => {
    inFlight++;
    queueMicrotask(() => {
      inFlight--;
      fn();
    });
  };
  const fail = code => Object.assign(Error(code), {code});
  function end() {
    let sent = 0;
    const receive = framing ? fromFrames() : m => m;
    const c = {
      open: true,
      deliver(frame) {
        const msg = receive(frame);
        if (msg !== undefined) c.onmessage(msg);
      },
      onmessage() {},
      onclose() {},
      send(msg) {
        if (!c.open) return;
        for (const frame of framing ? toFrames(msg, ++sent) : [msg]) {
          const json = JSON.stringify(frame);
          if (Buffer.byteLength(json) >= MESSAGE_LIMIT) {
            tooBig.push(Buffer.byteLength(json));
            c.open = false;
            live.delete(c);
            later(() => c.onclose());
            return;
          }
          const copy = JSON.parse(json);
          later(() => {
            if (c.peer.open) c.peer.deliver(copy);
          });
        }
      },
      close() {
        const ends = [c, c.peer].filter(e => e.open);
        if (!c.open) return;
        for (const e of ends) {
          e.open = false;
          live.delete(e);
        }
        later(() => {
          for (const e of ends) e.onclose();
        });
      },
    };
    return c;
  }
  return {
    tooBig,
    idle: () => inFlight === 0,
    async listen(matchId, {onconnection}) {
      if (hosts.has(matchId)) throw fail('id-taken');
      hosts.set(matchId, onconnection);
      return {
        close: () => {
          if (hosts.get(matchId) === onconnection) hosts.delete(matchId);
        },
      };
    },
    async dial(matchId) {
      const onconnection = hosts.get(matchId);
      if (!onconnection) throw fail('host-offline');
      const guest = end(),
        host = end();
      guest.peer = host;
      host.peer = guest;
      live.add(guest);
      live.add(host);
      later(() => onconnection(host));
      return guest;
    },
    dropAll() {
      for (const c of [...live]) c.close();
    },
  };
}

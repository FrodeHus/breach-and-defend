// In-memory stand-in for dist/net.mjs with the same listen/dial/connection contract.
export function fakeNet() {
  const hosts = new Map(), live = new Set();
  const fail = code => Object.assign(Error(code), {code});
  function end() {
    const c = {
      open: true,
      onmessage() {},
      onclose() {},
      send(msg) {
        if (!c.open) return;
        const copy = JSON.parse(JSON.stringify(msg));
        queueMicrotask(() => { if (c.peer.open) c.peer.onmessage(copy); });
      },
      close() {
        if (!c.open) return;
        c.open = c.peer.open = false;
        live.delete(c); live.delete(c.peer);
        queueMicrotask(() => { c.onclose(); c.peer.onclose(); });
      },
    };
    return c;
  }
  return {
    async listen(matchId, {onconnection}) {
      if (hosts.has(matchId)) throw fail('id-taken');
      hosts.set(matchId, onconnection);
      return {close: () => { if (hosts.get(matchId) === onconnection) hosts.delete(matchId); }};
    },
    async dial(matchId) {
      const onconnection = hosts.get(matchId);
      if (!onconnection) throw fail('host-offline');
      const guest = end(), host = end();
      guest.peer = host; host.peer = guest;
      live.add(guest); live.add(host);
      queueMicrotask(() => onconnection(host));
      return guest;
    },
    dropAll() { for (const c of [...live]) c.close(); },
  };
}

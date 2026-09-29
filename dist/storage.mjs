const PREFIX = 'bnd:', WEEK = 7 * 24 * 60 * 60 * 1000;
const safe = fn => { try { return fn(); } catch { return undefined; } };

// localStorage that never throws: private mode, blocked storage or a full quota fall back to memory.
export function createStore(backend, now = Date.now) {
  if (backend === undefined) backend = safe(() => globalThis.localStorage);
  const available = !!safe(() => { backend.setItem(PREFIX + 'probe', '1'); backend.removeItem(PREFIX + 'probe'); return true; });
  const memory = new Map();
  const parse = raw => { try { return raw ? JSON.parse(raw).value : null; } catch { return null; } };
  return {
    available,
    get(key) {
      return parse(memory.get(key) ?? (available ? safe(() => backend.getItem(PREFIX + key)) : null));
    },
    set(key, value) {
      const raw = JSON.stringify({savedAt: now(), value});
      if (available && safe(() => (backend.setItem(PREFIX + key, raw), true))) memory.delete(key);
      else memory.set(key, raw);
    },
    remove(key) {
      memory.delete(key);
      if (available) safe(() => backend.removeItem(PREFIX + key));
    },
    prune() {
      if (!available) return;
      safe(() => {
        for (let i = backend.length - 1; i >= 0; i--) {
          const key = backend.key(i);
          if (!key?.startsWith(PREFIX)) continue;
          let old = true;
          try { old = now() - JSON.parse(backend.getItem(key)).savedAt > WEEK; } catch {}
          if (old) backend.removeItem(key);
        }
      });
    },
  };
}

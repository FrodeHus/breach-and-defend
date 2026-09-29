import {Match} from '../../dist/match.mjs';

// Deterministic stand-in for Date.now/setTimeout/clearTimeout.
export function fakeTime() {
  let t = 0;
  const timers = new Set();
  return {
    now: () => t,
    schedule(fn, ms) { const h = {fn, at: t + Math.max(0, ms)}; timers.add(h); return h; },
    cancel(h) { timers.delete(h); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(h => h.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.delete(due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

let seq = 1000;
export const act = (m, p, action) => m.submit(p, action, p === 1 ? ++seq : null);

export async function newMatch(time = fakeTime()) {
  const m = await Match.create({hostFaction: 'blue', hostSecret: 'a'.repeat(32), guestSecret: 'b'.repeat(32), seedCommit: 'c'.repeat(64)}, time);
  m.connect(true);
  return m;
}
export async function startedMatch(time) {
  const m = await newMatch(time);
  m.pledge(0); m.pledge(1);
  return m;
}
export async function openedMatch(time) {
  const m = await startedMatch(time);
  act(m, 0, {type: 'keep'}); act(m, 1, {type: 'keep'});
  return m;
}

export function memoryBackend() {
  const map = new Map();
  return {
    map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

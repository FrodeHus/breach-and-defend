// Pure motion math for the 3D stand-ins: no DOM, no three.js, so Node can test it.
export const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = t => Math.max(0, Math.min(1, t));

// The camera looks straight down from `distance`, chosen so the plane z = 0 maps 1:1 to CSS pixels.
export const cameraDistance = (height, fov = 30) => height / 2 / Math.tan((fov * Math.PI) / 360);
export function toWorld(x, y, z, view) {
  const f = (view.distance - z) / view.distance;
  return {x: (x - view.width / 2) * f, y: (view.height / 2 - y) * f, z};
}
export function toScreen(p, view) {
  const f = view.distance / (view.distance - p.z);
  return {x: view.width / 2 + p.x * f, y: view.height / 2 - p.y * f};
}

// Flight between two card centres: lifts, tilts toward the viewer, and wobbles as it lands.
export function arc(from, to, t, {height = 150, tilt = 0.45} = {}) {
  t = clamp01(t);
  const p = ease(t),
    s = Math.sin(Math.PI * p),
    dir = to.y < from.y ? 1 : -1,
    land = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI * 2) * ((1 - t) / 0.2) * 0.07 : 0;
  return {
    x: lerp(from.x, to.x, p),
    y: lerp(from.y, to.y, p),
    z: s * height,
    rx: tilt * s * dir + land,
    ry: 0,
    rz: lerp(from.rz || 0, to.rz || 0, p) + 0.18 * s,
  };
}
// Half a turn about the vertical axis, lifting the card clear of the table mid-way.
export function flip(t, from = 0) {
  t = clamp01(t);
  return {ry: from + Math.PI * ease(t), z: Math.sin(Math.PI * t) * 70};
}
// Attack keyframes [t, k, z, rx]: wind up, strike at IMPACT, spring home.
export const IMPACT = 0.56;
const LUNGE = [
  [0, 0, 0, 0],
  [0.42, -0.1, 45, -0.35],
  [IMPACT, 1, 6, 0.45],
  [1, 0, 0, 0],
];
export function lungeKeys(t) {
  t = clamp01(t);
  let i = 0;
  while (i < LUNGE.length - 2 && LUNGE[i + 1][0] < t) i++;
  const a = LUNGE[i],
    b = LUNGE[i + 1],
    q = ease((t - a[0]) / (b[0] - a[0]));
  return {k: lerp(a[1], b[1], q), z: lerp(a[2], b[2], q), rx: lerp(a[3], b[3], q)};
}
// Knock-back strength over time (seconds): a sharp hit, then a damped wobble.
export const knock = t => (t < 0.06 ? t / 0.06 : Math.exp(-(t - 0.06) * 6) * Math.cos((t - 0.06) * 20));
// Many simultaneous hits share one pool; new bursts get whatever room is left.
export const MAX_PARTICLES = 400;
export const budget = (live, wanted) => Math.max(0, Math.min(wanted, MAX_PARTICLES - live));

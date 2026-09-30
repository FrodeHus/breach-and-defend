// One see-through WebGL canvas over the page. While a card moves, a lit 3D stand-in takes its place;
// the DOM card is only hidden meanwhile and is always shown again. Loaded lazily; the game never needs it.
import {cameraDistance, toWorld} from './stage3d-curves.mjs';

export const T = 4; // card thickness, px
let THREE = null,
  renderer = null,
  scene = null,
  camera = null,
  sun = null,
  floor = null,
  canvas = null,
  starting = null,
  failed = false,
  running = false,
  last = 0,
  view = {width: 1, height: 1, distance: 1};
const updaters = new Set(),
  shapes = new Map();

export const ready = () => !!renderer && !failed;
export const three = () => THREE;
export const center = r => ({x: r.left + r.width / 2, y: r.top + r.height / 2});
export function fail(err) {
  if (!failed) console.warn('3D card motion is off:', err);
  failed = true;
  updaters.clear();
  if (canvas) canvas.hidden = true;
}
export function resetStage() {
  starting = null;
  failed = false;
  renderer = null;
  updaters.clear();
}
export function init({load = () => import('./vendor/three.module.min.js'), reduced, doc = globalThis.document} = {}) {
  starting ??= (async () => {
    if (reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try {
      THREE = await load();
      canvas = doc.createElement('canvas');
      canvas.className = 'stage3d';
      canvas.setAttribute('aria-hidden', 'true');
      renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        fail(new Error('WebGL context lost'));
      });
      doc.body.append(canvas);
      build();
      addEventListener('resize', resize);
      return true;
    } catch (err) {
      renderer = null;
      fail(err);
      return false;
    }
  })();
  return starting;
}
function build() {
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 10, 10000);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow, {radius: 14, blurSamples: 20, bias: -0.0005});
  scene.add(sun, sun.target);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({opacity: 0.32}));
  floor.receiveShadow = true;
  scene.add(floor);
  resize();
}
function resize() {
  const width = innerWidth,
    height = innerHeight;
  view = {width, height, distance: cameraDistance(height)};
  camera.aspect = width / height;
  camera.far = view.distance * 4;
  camera.position.set(0, 0, view.distance);
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  floor.scale.set(width * 2, height * 2, 1);
  sun.position.set(-0.3 * width, 0.45 * height, view.distance);
  Object.assign(sun.shadow.camera, {
    left: -width,
    right: width,
    top: height,
    bottom: -height,
    near: 10,
    far: view.distance * 3,
  });
  sun.shadow.camera.updateProjectionMatrix();
}
// Runs update(dt) every frame until it returns false; the loop and rendering stop when nothing is left.
export function frame(update) {
  updaters.add(update);
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const u of [...updaters]) {
    try {
      if (u(dt) === false) updaters.delete(u);
    } catch (err) {
      fail(err);
    }
  }
  if (failed) return void (running = false);
  renderer.render(scene, camera);
  if (updaters.size) requestAnimationFrame(tick);
  else running = false;
}
// Positions an object from a screen-space pose (CSS px, radians); z is height above the table.
export function place(obj, {x, y, z = 0, rx = 0, ry = 0, rz = 0}) {
  const p = toWorld(x, y, z, view);
  obj.position.set(p.x, p.y, p.z + T / 2);
  obj.rotation.set(rx, ry, -rz);
}
export const world = (x, y, z = 0) => toWorld(x, y, z, view);
// Hides the DOM cards while fn animates their stand-ins, and always shows them again, even on error or overrun.
export async function standIn(els, fn, ms, {schedule = setTimeout, cancel = clearTimeout} = {}) {
  const list = els.filter(Boolean),
    ctl = {aborted: false};
  let timer;
  for (const el of list) el.style.visibility = 'hidden';
  try {
    return await Promise.race([Promise.resolve().then(() => fn(ctl)), new Promise(r => (timer = schedule(r, ms)))]);
  } finally {
    cancel(timer);
    ctl.aborted = true;
    for (const el of list) el.style.visibility = '';
  }
}
function geometry(w, h, r) {
  const key = `${Math.round(w)}x${Math.round(h)}x${r}`;
  if (shapes.has(key)) return shapes.get(key);
  const s = new THREE.Shape(),
    x = w / 2,
    y = h / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  const bevel = 0.8,
    body = new THREE.ExtrudeGeometry(s, {
      depth: T - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.6,
      bevelSegments: 3,
      curveSegments: 10,
    });
  body.translate(0, 0, -(T - 2 * bevel) / 2);
  const face = new THREE.ShapeGeometry(s, 10),
    pos = face.attributes.position,
    uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / w, (pos.getY(i) + y) / h);
  const g = {body, face};
  shapes.set(key, g);
  return g;
}
export function texture(source) {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// A card-shaped slab sized to a DOM rect. `next` is a second front face that mix(t) fades in (hand look → tile look).
export function slab(rect, {front, next = null, back, edge = 0x1d3a44, radius = 8}) {
  const {body, face} = geometry(rect.width, rect.height, radius),
    group = new THREE.Group();
  group.rotation.order = 'ZXY';
  const shell = new THREE.Mesh(body, new THREE.MeshStandardMaterial({color: edge, roughness: 0.55, metalness: 0.25}));
  shell.castShadow = true;
  const skin = src =>
    new THREE.Mesh(
      face,
      new THREE.MeshPhysicalMaterial({
        map: texture(src),
        roughness: 0.42,
        clearcoat: 0.6,
        clearcoatRoughness: 0.3,
        transparent: true,
      }),
    );
  const a = skin(front),
    b = next ? skin(next) : null,
    rear = skin(back);
  a.position.z = T / 2 + 0.05;
  rear.rotation.y = Math.PI;
  rear.position.z = -T / 2 - 0.05;
  group.add(shell, a, rear);
  if (b) {
    b.position.z = T / 2 + 0.1;
    b.material.opacity = 0;
    group.add(b);
  }
  scene.add(group);
  return {
    group,
    a,
    b,
    mix(t) {
      if (b) b.material.opacity = t;
    },
    dispose() {
      scene.remove(group);
      for (const m of [shell, a, b, rear])
        if (m) {
          m.material.map?.dispose();
          m.material.dispose();
        }
    },
  };
}
export const add = obj => scene.add(obj);
export const remove = obj => scene.remove(obj);

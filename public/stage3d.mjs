// One see-through WebGL canvas over the page. While a card moves, a lit 3D stand-in takes its place;
// the DOM card is only hidden meanwhile and is always shown again. Loaded lazily; the game never needs it.
import {
  arc,
  budget,
  cameraDistance,
  clamp01,
  ease,
  IMPACT,
  knock,
  lerp,
  lungeKeys,
  MAX_PARTICLES,
  toWorld,
} from './stage3d-curves.mjs';

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
  floor.material.depthWrite = false; // else the floor hides the half of a tilted card that dips below z = 0
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
  if (failed) return;
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
  try {
    renderer.render(scene, camera);
  } catch (err) {
    fail(err);
    running = false;
    return;
  }
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
// Flies a stand-in between two rects, cross-fading from one face to the other; the slab is sized to `to`.
export function fly({els, from, to, faces, flip = null, duration = 620}) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(to, {front: faces.from, next: faces.to, back: faces.back}),
          a = {...center(from), rz: from.rz || 0},
          b = center(to),
          sx = from.width / to.width,
          sy = from.height / to.height;
        let t = 0;
        const done = () => {
          s.dispose();
          resolve();
          return false;
        };
        frame(dt => {
          if (ctl.aborted) return done();
          t = Math.min(1, t + (dt * 1000) / duration);
          const pose = arc(a, b, t),
            k = ease(t);
          if (flip) pose.ry = flip === 'up' ? Math.PI * (1 - k) : Math.PI * k;
          place(s.group, pose);
          s.group.scale.set(lerp(sx, 1, k), lerp(sy, 1, k), 1);
          s.mix(clamp01((t - 0.25) / 0.4));
          if (t >= 1) return done();
        });
      }),
    duration + 400,
  );
}
const FX = {blue: ['#71dfd2', '#3fb8c9', '#eed7a1', '#ffffff'], red: ['#fb827b', '#ff5a50', '#eed7a1', '#ffffff']};
const rnd = (a, b) => a + Math.random() * (b - a);
const shards = [],
  sparks = [];
let pool = null,
  glyphTex = null;
// One shared instanced pool per particle kind keeps many simultaneous bursts to two draw calls.
function particles() {
  if (pool) return pool;
  const mesh = (geo, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    m.count = 0;
    m.frustumCulled = false;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < MAX_PARTICLES; i++) m.setColorAt(i, white);
    scene.add(m);
    return m;
  };
  pool = {
    shard: mesh(
      new THREE.BoxGeometry(3.5, 3.5, 3.5),
      new THREE.MeshStandardMaterial({roughness: 0.35, metalness: 0.15}),
    ),
    spark: mesh(new THREE.BoxGeometry(1.4, 1.4, 1), new THREE.MeshBasicMaterial()),
    m: new THREE.Object3D(),
    col: new THREE.Color(),
    aim: new THREE.Vector3(),
    light: new THREE.PointLight(0xffffff, 0, 500, 1),
    running: false,
  };
  pool.shard.castShadow = true;
  scene.add(pool.light);
  return pool;
}
function stepParticles(dt) {
  const {shard, spark, m, col, aim} = pool;
  for (const list of [shards, sparks])
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
  shards.forEach((p, i) => {
    p.vz -= 520 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    if (p.z < 2) {
      p.z = 2;
      p.vz *= -0.35;
      p.vx *= 0.7;
      p.vy *= 0.7;
      p.vr *= 0.6;
    }
    p.r += p.vr * dt;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(p.r, p.r * 0.7, p.r * 0.3);
    m.scale.setScalar(p.s * Math.min(1, (1 - p.t / p.life) * 3));
    m.updateMatrix();
    shard.setMatrixAt(i, m.matrix);
    shard.setColorAt(i, col.set(p.c));
  });
  sparks.forEach((p, i) => {
    const d = Math.pow(0.03, dt);
    p.vx *= d;
    p.vy *= d;
    p.vz *= d;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const v = Math.hypot(p.vx, p.vy, p.vz),
      f = 1 - p.t / p.life;
    m.position.set(p.x, p.y, p.z);
    m.rotation.set(0, 0, 0);
    m.lookAt(aim.set(p.x + p.vx, p.y + p.vy, p.z + p.vz));
    m.scale.set(f, f, Math.max(1, v * 0.06) * f);
    m.updateMatrix();
    spark.setMatrixAt(i, m.matrix);
    spark.setColorAt(i, col.set(p.c));
  });
  for (const [mesh, list] of [
    [shard, shards],
    [spark, sparks],
  ]) {
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  return (pool.running = shards.length + sparks.length > 0);
}
function startParticles() {
  if (pool.running) return;
  pool.running = true;
  frame(stepParticles);
}
// Shards chipped off a card's face, thrown away from `origin`.
function chip(rect, origin, pal, wanted, lift = 1) {
  const c = world(origin.x, origin.y),
    hw = rect.width / 2,
    hh = rect.height / 2,
    mid = center(rect);
  for (let i = 0, n = budget(shards.length, wanted); i < n; i++) {
    const w = world(mid.x + rnd(-hw, hw) * 0.9, mid.y + rnd(-hh, hh) * 0.9);
    shards.push({
      x: w.x,
      y: w.y,
      z: T + 2,
      vx: (w.x - c.x) * rnd(1.2, 2.6) + rnd(-40, 40),
      vy: (w.y - c.y) * rnd(0.8, 1.8) + rnd(30, 110),
      vz: rnd(140, 380) * lift,
      r: rnd(0, 6),
      vr: rnd(-14, 14),
      s: rnd(0.6, 1.4),
      c: pal[i % 3],
      life: rnd(1, 1.7),
      t: 0,
    });
  }
}
function spray(origin, pal, wanted) {
  const c = world(origin.x, origin.y);
  for (let i = 0, n = budget(sparks.length, wanted); i < n; i++) {
    const a = rnd(0, Math.PI * 2),
      v = rnd(180, 380);
    sparks.push({
      x: c.x,
      y: c.y,
      z: 8,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      vz: rnd(30, 280),
      c: i % 4 ? pal[i % 3] : '#ffffff',
      life: rnd(0.25, 0.6),
      t: 0,
    });
  }
}
// A thin shockwave ring with a dark rim so it reads on the light board.
function ring(origin, color) {
  const c = world(origin.x, origin.y),
    glow = new THREE.Mesh(
      new THREE.RingGeometry(0.965, 1, 96),
      new THREE.MeshBasicMaterial({color, transparent: true, depthWrite: false}),
    ),
    rim = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.02, 96),
      new THREE.MeshBasicMaterial({color: 0x0c1115, transparent: true, depthWrite: false}),
    );
  glow.position.set(c.x, c.y, 1.5);
  rim.position.set(c.x, c.y, 1);
  scene.add(rim, glow);
  let t = 0;
  frame(dt => {
    const u = (t += dt) / 0.5;
    if (u >= 1) {
      for (const m of [glow, rim]) {
        scene.remove(m);
        m.geometry.dispose();
        m.material.dispose();
      }
      return false;
    }
    const r = 14 + (1 - Math.pow(1 - u, 3)) * 80;
    glow.scale.set(r, r * 0.85, 1);
    rim.scale.set(r, r * 0.85, 1);
    glow.material.opacity = 1 - u;
    rim.material.opacity = 0.35 * (1 - u);
  });
}
function glyphs(rect, pal) {
  glyphTex ??= ['0', '1'].map(ch => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = "700 52px 'Barlow Condensed', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#0c1115';
    g.strokeText(ch, 32, 34);
    g.fillStyle = '#fff';
    g.fillText(ch, 32, 34);
    return texture(c);
  });
  const mid = center(rect),
    list = Array.from({length: 8}, (_, i) => {
      const s = new THREE.Sprite(
          new THREE.SpriteMaterial({map: glyphTex[i % 2], color: pal[i % 2], transparent: true, depthWrite: false}),
        ),
        w = world(mid.x + rnd(-0.35, 0.35) * rect.width, mid.y + rnd(-0.3, 0.3) * rect.height);
      s.scale.set(15, 15, 1);
      scene.add(s);
      return {s, x: w.x, y: w.y, z: rnd(20, 70), vx: rnd(-30, 30), vy: rnd(30, 80), life: rnd(0.6, 1), t: 0};
    });
  frame(dt => {
    for (const g of list) {
      g.t += dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.s.position.set(g.x, g.y, g.z);
      g.s.material.opacity = Math.max(0, 1 - g.t / g.life) * (Math.random() < 0.2 ? 0.25 : 1);
    }
    if (list.some(g => g.t < g.life)) return;
    for (const g of list) {
      scene.remove(g.s);
      g.s.material.dispose();
    }
    return false;
  });
}
// One reused light: adding and removing lights would make three.js recompile every material mid-animation.
function flash(origin, color) {
  const c = world(origin.x, origin.y),
    light = pool.light;
  light.color.set(color);
  light.position.set(c.x, c.y, 70);
  let t = 0;
  frame(dt => {
    light.intensity = 700 * Math.exp(-(t += dt) * 12);
    if (t < 0.5) return;
    light.intensity = 0;
    return false;
  });
}
// The floating "-N" stays HTML so it is crisp; it is decorative (the tile's own P/T carries the information).
function floatDamage(rect, amount) {
  const d = document.createElement('div');
  d.className = 'damage-float';
  d.textContent = `-${amount}`;
  d.setAttribute('aria-hidden', 'true');
  d.style.left = `${rect.left + rect.width * 0.72}px`;
  d.style.top = `${rect.top + rect.height * 0.15}px`;
  document.body.append(d);
  d.animate(
    [
      {transform: 'translateY(8px) scale(.6)', opacity: 0},
      {transform: 'translateY(-6px) scale(1.15)', opacity: 1, offset: 0.2},
      {transform: 'translateY(-34px) scale(1)', opacity: 0},
    ],
    {duration: 1000, easing: 'ease-out', fill: 'forwards'},
  );
  setTimeout(() => d.remove(), 1100);
}
function knockBack(rect, {els, faces}, color) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(rect, {front: faces.to, back: faces.back}),
          c = center(rect);
        s.a.material.emissive = new THREE.Color(color);
        let t = 0;
        frame(dt => {
          t += dt;
          if (ctl.aborted || t >= 0.45) {
            s.dispose();
            resolve();
            return false;
          }
          const k = knock(t * 2);
          place(s.group, {
            x: c.x + (t < 0.1 ? rnd(-2.5, 2.5) : 0),
            y: c.y - 8 * k,
            z: 14 * Math.max(k, 0),
            rx: -0.4 * k,
            rz: 0.07 * k,
          });
          s.a.material.emissiveIntensity = 0.55 * Math.exp(-t * 28);
        });
      }),
    900,
  );
}
// Damage landing on a card or player panel, in the attacker's colours.
export function burst({rect, faction, amount = 0, knock: struck = null}) {
  const pal = FX[faction] || FX.blue,
    mid = center(rect),
    origin = {x: mid.x, y: mid.y + rect.height * 0.35};
  particles();
  chip(rect, origin, pal, 50);
  spray(origin, pal, 70);
  startParticles();
  ring(origin, pal[0]);
  glyphs(rect, pal);
  flash(origin, pal[0]);
  if (amount) floatDamage(rect, amount);
  return struck ? knockBack(rect, struck, pal[0]) : new Promise(r => setTimeout(r, 360));
}
// Attack: wind up, strike toward the target (onImpact fires at the strike), spring home.
export function lunge({els, from, to, faces, onImpact, duration = 790}) {
  return standIn(
    els,
    ctl =>
      new Promise(resolve => {
        const s = slab(from, {front: faces.from, back: faces.back}),
          a = center(from),
          b = center(to),
          tip = {x: lerp(a.x, b.x, 0.6), y: lerp(a.y, b.y, 0.6)},
          dir = b.y < a.y ? 1 : -1;
        let t = 0,
          hit = false;
        frame(dt => {
          if (!ctl.aborted) {
            t = Math.min(1, t + (dt * 1000) / duration);
            const k = lungeKeys(t);
            place(s.group, {x: lerp(a.x, tip.x, k.k), y: lerp(a.y, tip.y, k.k), z: k.z, rx: k.rx * dir});
            if (!hit && t >= IMPACT) {
              hit = true;
              onImpact?.();
            }
            if (t < 1) return;
          }
          s.dispose();
          resolve();
          return false;
        });
      }),
    duration + 400,
  );
}

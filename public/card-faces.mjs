// Canvas faces for the 3D stand-ins: the compact hand card, the battlefield tile and the card back.
// Drawn from card data; colours are read from the page's own CSS through a hidden probe card, so theme changes carry over.
import {BY_ID, SETS} from './cards.mjs';

const images = new Map(),
  cache = new Map(),
  palettes = new Map(),
  SCALE = 2,
  CACHE_LIMIT = 120;
export const faceKey = (id, kind, w, h, extra = '') => `${id}|${kind}|${Math.round(w)}x${Math.round(h)}|${extra}`;
export function wrap(text, width, measure) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
const decode = src => {
  const i = new Image();
  i.src = src;
  return i.decode().then(() => i);
};
// The decoded image, or null when it is not ready within ms: the face is then drawn without art rather than waiting.
export function art(url, ms = 400, {load = decode, schedule = setTimeout} = {}) {
  if (!images.has(url))
    images.set(
      url,
      load(url).catch(() => null),
    );
  return Promise.race([images.get(url), new Promise(r => schedule(() => r(null), ms))]);
}
function palette(faction) {
  if (palettes.has(faction)) return palettes.get(faction);
  const probe = document.createElement('div');
  probe.className = `card ${faction}`;
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden';
  probe.innerHTML =
    '<div class="card-top"><span class="card-title">x</span><span class="cost">1</span></div><div class="card-bottom"><span>x</span><span class="stats">1/1</span></div>';
  document.body.append(probe);
  const css = sel => getComputedStyle(sel ? probe.querySelector(sel) : probe);
  const p = {
    bg: css().backgroundColor,
    border: css().borderTopColor,
    title: css('.card-title').color,
    muted: css('.card-bottom').color,
    costBg: css('.cost').backgroundColor,
    costLine: css('.cost').borderTopColor,
    stat: css('.stats').color,
    statBg: css('.stats').backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue(`--${faction}`).trim() || css().borderTopColor,
  };
  probe.remove();
  palettes.set(faction, p);
  return p;
}
function surface(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * SCALE);
  c.height = Math.round(h * SCALE);
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  return {c, g};
}
function cover(g, img, x, y, w, h, py = 0.3) {
  const s = Math.max(w / img.width, h / img.height);
  g.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) * py, img.width * s, img.height * s);
}
function frame(g, w, h, r, color, width = 2) {
  g.beginPath();
  g.roundRect(width / 2, width / 2, w - width, h - width, r);
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
}
function badge(g, text, hurt, right, bottom, size, p) {
  g.font = `700 ${size}px 'DM Sans', sans-serif`;
  const [pow, tough] = text.split('/'),
    w = g.measureText(text).width + size * 0.8,
    h = size * 1.35;
  g.beginPath();
  g.roundRect(right - w, bottom - h, w, h, 4);
  g.fillStyle = p.statBg === 'rgba(0, 0, 0, 0)' ? '#f7fafc' : p.statBg;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = p.stat;
  g.stroke();
  const x = right - w + size * 0.4,
    y = bottom - h * 0.28;
  g.fillStyle = p.stat;
  g.fillText(`${pow}/`, x, y);
  g.fillStyle = hurt ? '#c94350' : p.stat;
  g.fillText(tough, x + g.measureText(`${pow}/`).width, y);
}
function hand(d, w, h, img, p) {
  const {c, g} = surface(w, h),
    pad = w * 0.06,
    fs = Math.max(9, w * 0.085);
  g.beginPath();
  g.roundRect(0, 0, w, h, 7);
  g.fillStyle = p.bg;
  g.fill();
  frame(g, w, h, 7, p.accent);
  g.fillStyle = p.title;
  g.font = `700 ${fs}px 'Barlow Condensed', sans-serif`;
  wrap(d.name, w - pad * 2 - fs * 1.6, t => g.measureText(t).width)
    .slice(0, 2)
    .forEach((line, i) => g.fillText(line, pad, pad + fs * (i + 1)));
  const r = fs * 0.72,
    cx = w - pad - r,
    cy = pad + r;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = p.costBg === 'rgba(0, 0, 0, 0)' ? p.bg : p.costBg;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = p.costLine;
  g.stroke();
  g.fillStyle = p.title;
  g.font = `600 ${fs * 0.75}px 'DM Sans', sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(d.type === 'Infrastructure' ? '◇' : String(d.cost), cx, cy + 0.5);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  const top = pad + fs * 2.3,
    artH = h * 0.52;
  g.save();
  g.beginPath();
  g.roundRect(pad, top, w - pad * 2, artH, 4);
  g.clip();
  if (img) cover(g, img, pad, top, w - pad * 2, artH, 0.5);
  else {
    g.fillStyle = p.border;
    g.fill();
  }
  g.restore();
  const fb = Math.max(8, w * 0.065);
  g.font = `500 ${fb}px 'DM Sans', sans-serif`;
  g.fillStyle = p.muted;
  g.fillText(`${d.faction.toUpperCase()} / ${SETS[d.set]?.code ?? ''}`, pad, h - pad);
  if (d.type === 'Unit') badge(g, `${d.power}/${d.toughness}`, false, w - pad, h - pad * 0.6, fb * 1.25, p);
  return c;
}
function tile(d, w, h, img, p, stats) {
  const {c, g} = surface(w, h);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, h, 10);
  g.clip();
  g.fillStyle = '#203b4c';
  g.fillRect(0, 0, w, h);
  if (img) cover(g, img, 0, 0, w, h);
  const fs = Math.max(9, w * 0.13);
  g.fillStyle = '#0d1a22c7';
  g.fillRect(0, 0, w, fs * 1.55);
  g.fillStyle = '#fff';
  g.font = `600 ${fs}px 'Barlow Condensed', sans-serif`;
  g.fillText(wrap(d.name, w * 0.9, t => g.measureText(t).width)[0] ?? '', w * 0.07, fs * 1.15);
  g.restore();
  frame(g, w, h, 10, p.accent);
  if (d.type === 'Unit') {
    const s = stats || {power: d.power, toughness: d.toughness, damage: 0};
    badge(
      g,
      `${s.power}/${Math.max(0, s.toughness - (s.damage || 0))}`,
      (s.damage || 0) > 0,
      w - 4,
      h - 4,
      Math.max(9, w * 0.12),
      {
        ...p,
        stat: '#182b3a',
        statBg: '#f7fafc',
      },
    );
  }
  return c;
}
function back(faction, w, h, img, p) {
  const {c, g} = surface(w, h);
  g.save();
  g.beginPath();
  g.roundRect(0, 0, w, h, 8);
  g.clip();
  g.fillStyle = '#192d35';
  g.fillRect(0, 0, w, h);
  if (img) cover(g, img, 0, 0, w, h, 0.5);
  g.restore();
  frame(g, w, h, 8, p.accent);
  return c;
}
function cached(key, draw) {
  if (cache.has(key)) return cache.get(key);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  const c = draw();
  cache.set(key, c);
  return c;
}
let sized = false;
export async function faces({id, faction, from = 'hand', to = 'tile', width, height, stats = null}) {
  if (!sized) {
    sized = true;
    addEventListener('resize', () => cache.clear());
  }
  const d = BY_ID[id],
    side = d?.faction || faction,
    p = palette(side),
    [backImg, img] = await Promise.all([art(`art/${side}-card-back.png`), d ? art(`art/${d.art}.webp`) : null]),
    rear = cached(faceKey(side, 'back', width, height, backImg ? '' : 'plain'), () =>
      back(side, width, height, backImg, p),
    );
  if (!d) return {from: rear, to: rear, back: rear};
  const state = stats ? `${stats.power}/${stats.toughness}/${stats.damage || 0}` : '',
    draw = kind =>
      cached(faceKey(id, kind, width, height, `${kind === 'tile' ? state : ''}${img ? '' : '|noart'}`), () =>
        kind === 'tile' ? tile(d, width, height, img, p, stats) : hand(d, width, height, img, p),
      );
  return {from: draw(from), to: draw(to), back: rear};
}

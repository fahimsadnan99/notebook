import { fontFamily } from "./palette.js";
import { shownText } from "./links.js";

export const LINE_H = 1.3;
export const STICKY_PAD = 14;

// Full CSS font string for a text/sticky object (or any {font,bold,italic,size}).
export const fontSpec = (o, size = o.size) =>
  `${o.italic ? "italic " : ""}${o.bold ? 700 : 400} ${size}px ${fontFamily(o.font)}`;

let mctx = null;
const ctx2d = () => mctx || (mctx = document.createElement("canvas").getContext("2d"));
let bcache = new WeakMap();
export const resetGeometryCache = () => { bcache = new WeakMap(); };

export function measureWidth(text, spec) {
  const c = ctx2d();
  c.font = spec;
  return c.measureText(text).width;
}

export function wrapText(text, maxW, spec) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (para === "") { out.push(""); continue; }
    let line = "";
    for (const word of para.split(" ")) {
      const test = line ? line + " " + word : word;
      if (measureWidth(test, spec) <= maxW) { line = test; continue; }
      if (line) { out.push(line); line = ""; }
      if (measureWidth(word, spec) <= maxW) { line = word; continue; }
      let chunk = ""; // very long word: break by characters
      for (const ch of word) {
        if (measureWidth(chunk + ch, spec) > maxW && chunk) { out.push(chunk); chunk = ch; } else chunk += ch;
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

export function norm(o) {
  return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
}

export function bounds(o) {
  let b = bcache.get(o);
  if (b) return b;
  if (o.type === "pen") {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of o.points) {
      if (p[0] < x1) x1 = p[0]; if (p[0] > x2) x2 = p[0];
      if (p[1] < y1) y1 = p[1]; if (p[1] > y2) y2 = p[1];
    }
    b = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  } else if (o.type === "text") {
    let w = 8;
    const spec = fontSpec(o);
    const lines = shownText(o.text).split("\n");
    for (const l of lines) w = Math.max(w, measureWidth(l, spec));
    b = { x: o.x, y: o.y, w, h: lines.length * o.size * LINE_H };
  } else b = norm(o);
  bcache.set(o, b);
  return b;
}

export function unionBounds(list) {
  if (!list.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of list) {
    const b = bounds(o);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const intersects = (a, b) => a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const inflate = (b, n) => ({ x: b.x - n, y: b.y - n, w: b.w + 2 * n, h: b.h + 2 * n });

export function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function polygonOf(o) {
  const b = norm(o);
  if (o.type === "triangle") return [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  if (o.type === "diamond") return [[b.x + b.w / 2, b.y], [b.x + b.w, b.y + b.h / 2], [b.x + b.w / 2, b.y + b.h], [b.x, b.y + b.h / 2]];
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
}

export function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(px, py, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    d = Math.min(d, distSeg(px, py, a[0], a[1], b[0], b[1]));
  }
  return d;
}

export function hitObject(o, px, py, tol) {
  const b = bounds(o);
  const pad = tol + (o.width || 0) / 2;
  if (px < b.x - pad || px > b.x + b.w + pad || py < b.y - pad || py > b.y + b.h + pad) return false;
  switch (o.type) {
    case "pen": {
      const pts = o.points;
      if (pts.length === 1) return Math.hypot(px - pts[0][0], py - pts[0][1]) <= pad;
      for (let i = 1; i < pts.length; i++) {
        if (distSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= pad) return true;
      }
      return false;
    }
    case "line":
    case "arrow":
      return distSeg(px, py, o.x, o.y, o.x + o.w, o.y + o.h) <= pad;
    case "section": {
      const bb = norm(o);
      if (px >= bb.x && px <= bb.x + bb.w && py >= bb.y && py <= bb.y + Math.min(36, bb.h)) return true;
      const poly = polygonOf({ ...o, type: "rect" });
      return distToPoly(px, py, poly) <= pad;
    }
    case "rect":
    case "triangle":
    case "diamond": {
      const poly = polygonOf(o);
      if (o.fill && pointInPoly(px, py, poly)) return true;
      return distToPoly(px, py, poly) <= pad;
    }
    case "ellipse": {
      const rx = Math.max(b.w / 2, 1), ry = Math.max(b.h / 2, 1);
      const v = Math.hypot((px - (b.x + rx)) / rx, (py - (b.y + ry)) / ry);
      if (o.fill && v <= 1) return true;
      return Math.abs(v - 1) * Math.min(rx, ry) <= pad;
    }
    default:
      return true; // text, sticky, image: whole box
  }
}

export function translateObject(o, dx, dy) {
  if (o.type === "pen") return { ...o, points: o.points.map((p) => [p[0] + dx, p[1] + dy, ...p.slice(2)]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

export function scaleObject(o, ob, nb) {
  const sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
  if (o.type === "pen") {
    return { ...o, points: o.points.map((p) => [nb.x + (p[0] - ob.x) * sx, nb.y + (p[1] - ob.y) * sy, ...p.slice(2)]) };
  }
  const n = { ...o, x: nb.x + (o.x - ob.x) * sx, y: nb.y + (o.y - ob.y) * sy };
  if (o.type === "text") n.size = Math.max(8, o.size * ((sx + sy) / 2));
  else { n.w = o.w * sx; n.h = o.h * sy; }
  return n;
}

// Connectors: a line/arrow can be attached to shapes (o.from / o.to = object id). Its ends then sit on
// the edges of those shapes and follow them when they move.
export const BINDABLE = new Set(["rect", "ellipse", "triangle", "diamond", "sticky", "text", "image"]);
function edgePoint(o, b, tx, ty, pad) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const rx = b.w / 2 + pad, ry = b.h / 2 + pad;
  const t = o.type === "ellipse"
    ? 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2)
    : Math.min(dx ? rx / Math.abs(dx) : Infinity, dy ? ry / Math.abs(dy) : Infinity);
  return { x: cx + dx * Math.min(t, 1), y: cy + dy * Math.min(t, 1) };
}
export function connect(o, byId) {
  const A = o.from && byId.get(o.from), B = o.to && byId.get(o.to);
  if (!A && !B) return o.from || o.to ? { ...o, from: undefined, to: undefined } : o;
  const ab = A && bounds(A), bb = B && bounds(B);
  let a = { x: o.x, y: o.y }, b = { x: o.x + o.w, y: o.y + o.h };
  if (ab) a = { x: ab.x + ab.w / 2, y: ab.y + ab.h / 2 };
  if (bb) b = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
  const pad = 6;
  const a2 = ab ? edgePoint(A, ab, b.x, b.y, pad) : a, b2 = bb ? edgePoint(B, bb, a.x, a.y, pad) : b;
  const n = { ...o, x: a2.x, y: a2.y, w: b2.x - a2.x, h: b2.y - a2.y };
  if (!A) delete n.from;
  if (!B) delete n.to;
  return n;
}
// Re-place every attached connector (cheap: only lines/arrows with from/to are touched).
export function relink(objects) {
  if (!objects.some((o) => o.from || o.to)) return objects;
  const byId = new Map(objects.map((o) => [o.id, o]));
  return objects.map((o) => (o.from || o.to ? connect(o, byId) : o));
}

// Ramer-Douglas-Peucker (iterative): fewer points => smaller saves
export function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > eps) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Scratch-out: a quick back-and-forth zigzag over writing erases it (like crossing out on paper).
// Returns true for a stroke that reverses direction many times along its long side.
export function isScribble(pts, zoom = 1) {
  if (pts.length < 12) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (i) len += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
  }
  const w = x1 - x0, h = y1 - y0, long = Math.max(w, h);
  // Letters such as M, W, ম or ষ go up and down a few times too, so a scratch-out has to be wider and
  // go back and forth more often than any letter does.
  if (long * zoom < 36 || len < long * 4.5) return false;
  const ax = w >= h ? 0 : 1, th = long * 0.2;
  // A scratch-out moves mostly straight back and forth; circles and spirals curve (about 64%).
  let along = 0;
  for (let i = 1; i < pts.length; i++) along += Math.abs(pts[i][ax] - pts[i - 1][ax]);
  if (along < len * 0.8) return false;
  let lo = pts[0][ax], hi = lo, dir = 0, turns = 0; // dir: 1 rising, -1 falling, 0 not known yet
  for (const p of pts) {
    const v = p[ax];
    if (v > hi) hi = v;
    if (v < lo) lo = v;
    if (dir >= 0 && hi - v > th) { if (dir > 0) turns++; dir = -1; lo = v; }
    else if (dir <= 0 && v - lo > th) { if (dir < 0) turns++; dir = 1; hi = v; }
  }
  return turns >= 5;
}

// What a scratch-out stroke covers: strokes with most of their points under it, and other objects mostly under it.
export function scribbleTargets(objects, pts, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const box = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  const inBox = (x, y) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
  return objects.filter((o) => {
    if (o.locked || o.type === "section" || o.type === "image") return false;
    if (o.type === "pen") {
      let n = 0;
      for (const p of o.points) if (inBox(p[0], p[1])) n++;
      return n >= o.points.length * 0.5;
    }
    const b = bounds(o);
    const ix = Math.max(0, Math.min(b.x + b.w, box.x + box.w) - Math.max(b.x, box.x));
    const iy = Math.max(0, Math.min(b.y + b.h, box.y + box.h) - Math.max(b.y, box.y));
    return b.w * b.h > 0 && (ix * iy) / (b.w * b.h) >= 0.6;
  });
}

// Lasso select: is the object inside the loop? Strokes need most of their points inside,
// other objects need their center inside.
export function insideLasso(o, loop) {
  if (o.type === "pen") {
    let n = 0;
    for (const p of o.points) if (pointInPoly(p[0], p[1], loop)) n++;
    return n >= o.points.length * 0.6;
  }
  const b = bounds(o);
  return pointInPoly(b.x + b.w / 2, b.y + b.h / 2, loop);
}

// Handwriting beautifier: resample the stroke at an even spacing, then smooth out
// hand shake with a small weighted moving average. The endpoints stay where they were.
export function beautifyStroke(pts, step) {
  if (pts.length < 3) return pts;
  const hasP = pts[0].length > 2; // stylus pressure travels along
  const even = [pts[0]];
  let [px, py] = pts[0], pp = hasP ? pts[0][2] : 0, carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i], p = hasP ? pts[i][2] : 0;
    let seg = Math.hypot(x - px, y - py), d = step - carry;
    while (seg > 0 && d <= seg) {
      const t = d / seg;
      px += (x - px) * t; py += (y - py) * t; pp += (p - pp) * t;
      even.push(hasP ? [px, py, pp] : [px, py]);
      seg = Math.hypot(x - px, y - py); d = step;
    }
    carry = step - d + seg;
    px = x; py = y; pp = p;
  }
  const last = pts[pts.length - 1];
  even.push(last);
  if (even.length < 5) return even;
  const W = [1, 2, 3, 4, 3, 2, 1];
  let cur = even;
  for (let pass = 0; pass < 2; pass++) {
    const out = cur.map((p, i) => {
      if (i === 0 || i === cur.length - 1) return p;
      let sx = 0, sy = 0, sp = 0, sw = 0;
      for (let k = -3; k <= 3; k++) {
        const q = cur[i + k];
        if (!q) continue;
        const w = W[k + 3];
        sx += q[0] * w; sy += q[1] * w; sp += (q[2] || 0) * w; sw += w;
      }
      return hasP ? [sx / sw, sy / sw, sp / sw] : [sx / sw, sy / sw];
    });
    cur = out;
  }
  return cur;
}

// Italic handwriting: lean a pen stroke right (dir 1) or straighten it back (dir -1).
// The shear pivots on the stroke's lowest point, which a shear never moves, so it is exactly reversible.
export const SLANT = Math.tan((12 * Math.PI) / 180);
export function slantStroke(o, dir) {
  let bottom = -Infinity;
  for (const p of o.points) bottom = Math.max(bottom, p[1]);
  const k = SLANT * dir;
  return { ...o, points: o.points.map((p) => [Math.round((p[0] + k * (bottom - p[1])) * 10) / 10, p[1], ...p.slice(2)]) };
}

// "Hold still at the end of a stroke" shape snapping.
// Returns { type, x, y, w, h } (line: w/h are signed) or null if the stroke is not a clean shape.
export function recognizeShape(pts) {
  if (pts.length < 6) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of pts) {
    x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]);
    x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]);
  }
  const w = x2 - x1, h = y2 - y1, diag = Math.hypot(w, h);
  if (diag < 24) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);

  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, distSeg(p[0], p[1], first[0], first[1], last[0], last[1]));
  if (gap > diag * 0.5 && maxDev < diag * 0.07) {
    return { type: "line", x: first[0], y: first[1], w: last[0] - first[0], h: last[1] - first[1] };
  }
  if (gap > diag * 0.3) return null; // not a closed shape

  let v = rdp(pts, diag * 0.09);
  if (v.length > 2 && Math.hypot(v[0][0] - v[v.length - 1][0], v[0][1] - v[v.length - 1][1]) < diag * 0.3) v = v.slice(0, -1);
  const box = { x: x1, y: y1, w, h };
  if (v.length === 3) return { type: "triangle", ...box };
  if (v.length === 4) {
    let corners = 0;
    for (const p of v) {
      const nx = (p[0] - x1) / (w || 1), ny = (p[1] - y1) / (h || 1);
      if ((nx < 0.22 || nx > 0.78) && (ny < 0.22 || ny > 0.78)) corners++;
    }
    return { type: corners >= 3 ? "rect" : "diamond", ...box };
  }
  if (v.length >= 5) return { type: "ellipse", ...box };
  return null;
}

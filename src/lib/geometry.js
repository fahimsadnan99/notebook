import { fontFamily } from "./palette.js";

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
    const lines = o.text.split("\n");
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

function pointInPoly(px, py, pts) {
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
  if (o.type === "pen") return { ...o, points: o.points.map((p) => [p[0] + dx, p[1] + dy]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}

export function scaleObject(o, ob, nb) {
  const sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
  if (o.type === "pen") {
    return { ...o, points: o.points.map((p) => [nb.x + (p[0] - ob.x) * sx, nb.y + (p[1] - ob.y) * sy]) };
  }
  const n = { ...o, x: nb.x + (o.x - ob.x) * sx, y: nb.y + (o.y - ob.y) * sy };
  if (o.type === "text") n.size = Math.max(8, o.size * ((sx + sy) / 2));
  else { n.w = o.w * sx; n.h = o.h * sy; }
  return n;
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

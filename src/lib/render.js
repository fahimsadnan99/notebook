import { resolveColor, mix, isDarkColor, FX2_EFFECTS } from "./palette.js";
import { norm, polygonOf, wrapText, fontSpec, LINE_H, STICKY_PAD } from "./geometry.js";

/* ------------------------------------------------------------ images/fonts */
const imgCache = new Map();
function getImage(src, onLoad) {
  let e = imgCache.get(src);
  if (!e) {
    const img = new Image();
    e = { img, loaded: false };
    img.onload = () => { e.loaded = true; onLoad && onLoad(); };
    img.src = src;
    imgCache.set(src, e);
  }
  return e.loaded ? e.img : null;
}

const fontRequested = new Set();
// Canvas cannot use a web font until it is loaded: ask for it, then redraw.
function ensureFont(spec, cb) {
  if (typeof document === "undefined" || !document.fonts || fontRequested.has(spec)) return;
  fontRequested.add(spec);
  document.fonts.load(spec, "Aa অআ").then(() => cb && cb()).catch(() => {});
}

/* -------------------------------------------------------------- background */
export function pageIsDark(paper, theme) {
  return paper ? isDarkColor(paper) : theme === "dark";
}

export const A4 = { w: 794, h: 1123, gap: 40 };
export const sheetBox = (n) => ({ x: 0, y: 0, w: A4.w, h: n * A4.h + (n - 1) * A4.gap });

function drawPattern(ctx, w, h, view, bg, base, dark, gap) {
  if (bg === "plain") return;
  const z = view.zoom;
  const ruled = bg === "lines" || bg === "ruled";
  let s = (gap || (ruled ? 34 : 28)) * z;
  while (s < 12) s *= 2;
  const ox = ((view.x % s) + s) % s, oy = ((view.y % s) + s) % s;
  const ink = dark ? "#ffffff" : "#000000";
  if (bg === "dots") {
    ctx.fillStyle = mix(base, ink, 0.24);
    const r = Math.max(0.9, 1.15 * Math.min(z, 1.6));
    for (let x = ox; x < w; x += s) for (let y = oy; y < h; y += s) ctx.fillRect(x - r, y - r, r * 2, r * 2);
    return;
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = ruled ? mix(base, "#3b82f6", dark ? 0.3 : 0.25) : mix(base, ink, dark ? 0.1 : 0.09);
  ctx.beginPath();
  if (bg === "grid") for (let x = ox; x < w; x += s) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
  for (let y = oy; y < h; y += s) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
  ctx.stroke();
  if (bg === "ruled") {
    const mx = Math.round(view.x + 100 * z) + 0.5;
    if (mx > -2 && mx < w + 2) {
      ctx.strokeStyle = "rgba(239,68,68,.5)";
      ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, h); ctx.stroke();
    }
  }
}

// sheets > 0 draws that many A4 sheets (794x1123) on a darker desk instead of an endless page.
export function drawBackground(ctx, w, h, view, bg, theme, paper, gap, sheets) {
  const dark = pageIsDark(paper, theme);
  const base = paper || (dark ? "#0e1015" : "#f8f9fc");
  if (!sheets) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    drawPattern(ctx, w, h, view, bg, base, dark, gap);
    return;
  }
  const z = view.zoom;
  ctx.fillStyle = dark ? mix(base, "#000000", 0.55) : "#d5d9e6";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < sheets; i++) {
    const x = view.x, y = view.y + i * (A4.h + A4.gap) * z, sw = A4.w * z, sh = A4.h * z;
    if (x > w || x + sw < 0 || y > h || y + sh < 0) continue;
    ctx.save();
    ctx.shadowColor = "rgba(10,14,30,.28)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, sw, sh);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, sw, sh); ctx.clip();
    drawPattern(ctx, w, h, view, bg, base, dark, gap);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ shapes */
function dashOf(o) {
  const w = o.width || 2;
  if (o.dash === "dashed") return [w * 3 + 6, w * 2 + 5];
  if (o.dash === "dotted") return [0.1, w * 2 + 4];
  return [];
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function shapePath(ctx, o) {
  const b = norm(o);
  ctx.beginPath();
  if (o.type === "rect") roundRectPath(ctx, b.x, b.y, b.w, b.h, Math.max(0, Math.min(10, b.w / 4, b.h / 4)));
  else if (o.type === "ellipse") ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  else {
    const p = polygonOf(o);
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
  }
}

/* -------------------------------------------------------------------- text */
// Draw wrapped/aligned lines with optional effects. (x, y) is the top-left of the block, W its width.
function drawTextLines(ctx, o, lines, x, y, W, size, spec, theme, px, fx) {
  ctx.font = spec;
  ctx.textBaseline = "top";
  const color = resolveColor(o.stroke, theme);
  const color2 = resolveColor(o.fx2 || "#ec4899", theme);
  const lws = lines.map((l) => ctx.measureText(l).width);
  const xs = lws.map((lw) => (o.align === "center" ? (W - lw) / 2 : o.align === "right" ? W - lw : 0));
  const off = ((LINE_H - 1) * size) / 2;

  if (fx && o.hlBg) {
    ctx.fillStyle = resolveColor(o.hlBg, theme);
    lines.forEach((l, i) => {
      if (!l) return;
      ctx.beginPath();
      roundRectPath(ctx, x + xs[i] - 6, y + i * size * LINE_H, lws[i] + 12, size * LINE_H, size * 0.2);
      ctx.fill();
    });
  }

  const paint = (dx = 0, dy = 0, stroke = false) => {
    lines.forEach((l, i) => {
      const lx = x + xs[i] + dx, ly = y + off + i * size * LINE_H + dy;
      if (stroke) ctx.strokeText(l, lx, ly); else ctx.fillText(l, lx, ly);
    });
  };

  const effect = fx ? o.effect || "none" : "none";
  ctx.fillStyle = color;
  switch (effect) {
    case "shadow":
      ctx.fillStyle = "rgba(0,0,0,.32)";
      paint(size * 0.06, size * 0.07);
      ctx.fillStyle = color;
      paint();
      break;
    case "glow":
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = size * 0.5 * px;
      paint(); paint();
      ctx.restore();
      break;
    case "neon": {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = size * 0.9 * px; paint(); paint();
      ctx.shadowBlur = size * 0.3 * px; paint();
      ctx.restore();
      ctx.fillStyle = mix(color.startsWith("#") ? color : "#22d3ee", "#ffffff", 0.8);
      paint();
      break;
    }
    case "outline":
      ctx.lineWidth = Math.max(2, size / 9);
      ctx.lineJoin = "round";
      ctx.strokeStyle = color2;
      paint(0, 0, true);
      ctx.fillStyle = color;
      paint();
      break;
    case "gradient": {
      const g = ctx.createLinearGradient(x, y, x + Math.max(W, 1), y + lines.length * size * LINE_H);
      g.addColorStop(0, color); g.addColorStop(1, color2);
      ctx.fillStyle = g;
      paint();
      break;
    }
    case "3d":
      ctx.fillStyle = color2;
      for (let k = 7; k >= 1; k--) paint(k * size * 0.022, k * size * 0.022);
      ctx.fillStyle = color;
      paint();
      break;
    default:
      paint();
  }

  if (o.underline || o.strike) {
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, size / 15); ctx.setLineDash([]);
    lines.forEach((l, i) => {
      if (!l) return;
      const lx = x + xs[i], base = y + off + i * size * LINE_H;
      if (o.underline) { ctx.beginPath(); ctx.moveTo(lx, base + size * 1.0); ctx.lineTo(lx + lws[i], base + size * 1.0); ctx.stroke(); }
      if (o.strike) { ctx.beginPath(); ctx.moveTo(lx, base + size * 0.55); ctx.lineTo(lx + lws[i], base + size * 0.55); ctx.stroke(); }
    });
  }
}

/* ------------------------------------------------------------------ object */
export function drawObject(ctx, o, theme, opts = {}) {
  const px = opts.pxScale || 1;
  ctx.save();
  ctx.globalAlpha = (o.opacity ?? 1) * (o.hl ? 0.45 : 1) * (opts.alpha ?? 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const stroke = resolveColor(o.stroke, theme);
  const fill = o.fill ? resolveColor(o.fill, theme) : null;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = o.width || 1;
  ctx.setLineDash(dashOf(o));

  switch (o.type) {
    case "pen": {
      const pts = o.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], o.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last[0], last[1]);
        ctx.stroke();
      }
      break;
    }
    case "line":
    case "arrow": {
      const x2 = o.x + o.w, y2 = o.y + o.h;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (o.type === "arrow") {
        ctx.setLineDash([]);
        const ang = Math.atan2(o.h, o.w), hl = Math.max(14, o.width * 4.5);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - hl * Math.cos(ang + side * 0.45), y2 - hl * Math.sin(ang + side * 0.45));
          ctx.stroke();
        }
      }
      break;
    }
    case "rect":
    case "ellipse":
    case "triangle":
    case "diamond":
      shapePath(ctx, o);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      ctx.stroke();
      break;
    case "section": {
      const b = norm(o);
      const col = fill || "#6366f1";
      const head = Math.min(36, b.h);
      ctx.setLineDash([]);
      ctx.beginPath();
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 14);
      ctx.fillStyle = mix(theme === "dark" ? "#0e1015" : "#ffffff", col, 0.1);
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha *= 0.9;
      ctx.stroke();
      ctx.globalAlpha = o.opacity ?? 1;
      ctx.save();
      ctx.beginPath(); roundRectPath(ctx, b.x, b.y, b.w, b.h, 14); ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(b.x, b.y, b.w, head);
      ctx.restore();
      ctx.fillStyle = isDarkColor(col) ? "#ffffff" : "#111827";
      ctx.font = "700 16px Inter, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      let t = o.title || "Section";
      const maxW = b.w - 28;
      while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
      ctx.fillText(t, b.x + 14, b.y + head / 2 + 1);
      break;
    }
    case "text": {
      ctx.setLineDash([]);
      const spec = fontSpec(o);
      ensureFont(spec, opts.onFont);
      ctx.font = spec;
      const lines = o.text.split("\n");
      const W = Math.max(8, ...lines.map((l) => ctx.measureText(l).width));
      drawTextLines(ctx, o, lines, o.x, o.y, W, o.size, spec, theme, px, true);
      break;
    }
    case "sticky": {
      const b = norm(o);
      ctx.setLineDash([]);
      ctx.save();
      ctx.shadowColor = "rgba(15,23,42,.25)";
      ctx.shadowBlur = 16 * px;
      ctx.shadowOffsetY = 6 * px;
      ctx.fillStyle = fill || "#fef08a";
      ctx.beginPath();
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.restore();
      const spec = fontSpec(o);
      ensureFont(spec, opts.onFont);
      const inner = b.w - 2 * STICKY_PAD;
      const lines = wrapText(o.text, inner, spec);
      const textObj = { ...o, stroke: o.stroke === "auto" ? "#1e293b" : o.stroke, effect: "none", hlBg: null };
      drawTextLines(ctx, textObj, lines, b.x + STICKY_PAD, b.y + STICKY_PAD, inner, o.size, spec, theme, px, false);
      break;
    }
    case "image": {
      const b = norm(o);
      const img = getImage(o.src, opts.onImage);
      if (img) {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, b.x, b.y, b.w, b.h, 6);
        ctx.clip();
        ctx.drawImage(img, b.x, b.y, b.w, b.h);
        ctx.restore();
      } else {
        ctx.fillStyle = theme === "dark" ? "#1e2433" : "#e5e7eb";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      break;
    }
    default:
  }
  ctx.restore();
}

export { FX2_EFFECTS };

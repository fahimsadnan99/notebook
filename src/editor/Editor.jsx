import React, { forwardRef, useEffect, useImperativeHandle, useReducer, useRef } from "react";
import { Square as StopIcon, Magnet, ChevronLeft, ChevronRight, ListTree, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Keyboard, X, Mic, Sparkles, ExternalLink, Unlink, Link2 } from "lucide-react";
import { createPortal } from "react-dom";
import Toolbar, { TOOLS } from "./Toolbar.jsx";
import PropsPanel from "./PropsPanel.jsx";
import PageSettings from "./PageSettings.jsx";
import { DEFAULT_STYLE, resolveColor, fontFamily, isDarkColor } from "../lib/palette.js";
import {
  bounds, unionBounds, intersects, inflate, hitObject, translateObject, scaleObject, rdp, norm, recognizeShape, beautifyStroke, slantStroke, insideLasso, isScribble, scribbleTargets, BINDABLE, connect, relink,
  wrapText, measureWidth, resetGeometryCache, fontSpec, LINE_H, STICKY_PAD,
} from "../lib/geometry.js";
import { drawBackground, drawObject, A4, sheetBox } from "../lib/render.js";
import { fileToDataUrl, loadImage, scaleImage } from "../lib/imaging.js";
import { makePdf } from "../lib/pdf.js";
import { solveLines } from "../lib/mathsolve.js";
import { saveAudio, deleteAudio } from "../lib/audioStore.js";
import LecturePanel from "./LecturePanel.jsx";
import OutlinePanel from "./OutlinePanel.jsx";
import { diffObjects, applyChanges } from "../lib/collab.js";
import Menu from "../components/Menu.jsx";
import { runTextAI, TEXT_ACTIONS } from "../lib/ai.js";
import { urlsIn, hrefOf, linkAt, linkLabel, makeLink, removeLink, shownText, URL_ONLY } from "../lib/links.js";

const MIN_ZOOM = 0.1, MAX_ZOOM = 8;
const FILLABLE = new Set(["rect", "ellipse", "triangle", "diamond", "sticky", "section"]);
const STROKED = new Set(["pen", "line", "arrow", "rect", "ellipse", "triangle", "diamond"]);
// Web links inside text boxes and sticky notes (see lib/links.js).
const linksIn = (o) => (TEXTY.has(o.type) && o.text ? urlsIn(o.text) : []);
const openLink = (u) => window.open(hrefOf(u), "_blank", "noopener,noreferrer");
// What someone typed into the link box -> an address, or null.
const cleanUrl = (u) => { u = (u || "").trim(); if (!u) return null; if (!/^(https?:|mailto:)/i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u)) u = "https://" + u; return URL_ONLY.test(u) || /^mailto:\S+$/i.test(u) ? u : null; };
const CLOSED = new Set(["rect", "ellipse", "triangle", "diamond"]); // shapes that may drop their outline
const DASHABLE = new Set(["line", "arrow", "rect", "ellipse", "triangle", "diamond"]);
const TEXTY = new Set(["text", "sticky"]);
const TEXT_KEYS = new Set(["font", "bold", "italic", "underline", "strike", "align"]);
const TEXT_ONLY_KEYS = new Set(["effect", "fx2", "hlBg"]);
const TOOL_KEYS = { q: "lasso", v: "select", h: "hand", p: "pen", m: "marker", l: "line", a: "arrow", r: "rect", o: "ellipse", t: "text", s: "sticky", e: "eraser", n: "section" };
const TOOL_TYPE = { pen: "pen", marker: "pen", line: "line", arrow: "arrow", rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", text: "text", sticky: "sticky", section: "section" };
const RESIZE_CURSOR = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const SHORTCUTS = [
  ["V Q H P M", "Select, Lasso, Pan, Pen, Highlighter"], ["L A R O", "Line, Arrow, Rect, Circle"],
  ["T S N E I", "Text, Sticky note, Section, Eraser, Image"], ["Space + drag", "Pan the canvas"], ["Ctrl + wheel / pinch", "Zoom"],
  ["Hold pen still", "Snap stroke to a perfect shape"], ["Zigzag over writing", "Scratch it out (erase)"], ["Type 12 × 4 =", "Get the answer in a text box"], ["Stylus eraser end", "Erase (fingers pan while a stylus is in use)"], ["Ctrl + K", "Command palette"], ["F", "Focus mode"], ["Shift + F", "Full screen"],
  ["Ctrl + Z / Y", "Undo / Redo"], ["Ctrl + C / X / V", "Copy / Cut / Paste (also images)"], ["Ctrl + D", "Duplicate"],
  ["Ctrl + A", "Select all"], ["Delete", "Delete selection"], ["Arrow keys", "Nudge (Shift = faster)"],
  ["[ and ]", "Send to back / bring to front"], ["Shift + 1", "Zoom to fit"], ["Ctrl + 0", "Reset zoom"], ["Double-click", "Edit text / add text"],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round1 = (n) => Math.round(n * 10) / 10;
const prOf = (e) => (e.pressure > 0 ? Math.min(1, e.pressure) : 0.5); // stylus pressure (0.5 when the device reports none)
const newId = () => "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hlW = (v) => v * 3 + 6;
const unHl = (w) => Math.max(1, Math.round((w - 6) / 3));
const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
const textFields = (src) => ({
  font: src.font || "inter", bold: !!src.bold, italic: !!src.italic, underline: !!src.underline, strike: !!src.strike, align: src.align || "left",
});
function wrapPlain(text, n = 38) {
  const out = []; let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out.join("\n");
}

const Editor = forwardRef(function Editor({ initial, theme, onChange, onToast, onOpenCover, toolbarSlot, readOnly, present, onExitPresent, room }, ref) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null); // the text box being typed in
  const secFileRef = useRef(null);
  const [, tick] = useReducer((x) => x + 1, 0);
  const ui = () => tick();

  const holder = useRef(null);
  if (!holder.current) {
    holder.current = {
      objects: initial.objects || [],
      view: initial.view ? { x: initial.view.x, y: initial.view.y, zoom: initial.view.zoom } : { x: 0, y: 0, zoom: 1 },
      savedW: initial.view?.w || 0,
      bg: initial.bg || "dots", paper: initial.paper || null, gap: initial.gap || null, sheets: initial.sheets || 0,
      tool: "pen",
      style: { ...DEFAULT_STYLE },
      selection: [], preview: null, drag: null, marquee: null, erasing: null, editing: null, editKey: 0,
      undo: [], redo: [], pointers: new Map(), space: false, showHelp: false,
      lastCoalesce: null, lastCoalesceAt: 0, size: { w: 1, h: 1 }, dpr: 1, raf: 0, uiDirty: false,
      penSeen: false, penId: null, penUpAt: 0, ptype: new Map(), dragBy: null, lasso: null,
      recs: initial.recs || [], lecture: null, playback: null, seek: null, marks: initial.marks || [], outline: false,
      snap: (() => { try { return localStorage.getItem("nb-snap") === "1"; } catch { return false; } })(), guides: null,
      snapT: 0, rec: null, listening: false, recText: "", recInterim: "", aiBusy: false,
    };
  }
  const s = holder.current;
  s.theme = theme; s.onChange = onChange; s.toast = onToast;
  s.readOnly = !!readOnly || !!present; // read mode (also while presenting): look, scroll and zoom only – nothing can be changed by accident
  const blocked = () => { if (!s.readOnly) return false; s.toast && s.toast("Read mode is on – tap “Enable editing” to change this page.", "info"); return true; };
  const rtheme = () => (s.paper ? (isDarkColor(s.paper) ? "dark" : "light") : s.theme);

  /* ---------------------------------------------------------------- core */
  // The saved view also remembers the screen width it was made on (w), so another screen can scale it to fit.
  const savedView = () => ({ ...s.view, w: Math.round(s.size.w) });
  function syncRoom() {
    if (!s.room || !s.synced) return;
    const d = diffObjects(s.synced, s.objects);
    if (d.sets.length || d.dels.length) { s.room.write(d, s.objects); s.synced = s.objects; }
  }
  function notify() { syncRoom(); s.onChange && s.onChange({ objects: s.objects, view: savedView(), bg: s.bg, paper: s.paper, gap: s.gap, sheets: s.sheets, recs: s.recs, marks: s.marks }); }
  function requestDraw() {
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => { s.raf = 0; draw(); if (s.uiDirty) { s.uiDirty = false; ui(); } });
  }
  function viewChanged() { s.uiDirty = true; notify(); requestDraw(); }
  const onFontLoaded = () => { resetGeometryCache(); requestDraw(); };

  function commit(next, opts = {}) {
    const now = Date.now();
    if (!(opts.coalesce && s.lastCoalesce === opts.coalesce && now - s.lastCoalesceAt < 900)) {
      s.undo.push(s.objects);
      if (s.undo.length > 200) s.undo.shift();
    }
    s.lastCoalesce = opts.coalesce || null; s.lastCoalesceAt = now;
    s.redo = []; s.objects = relink(next); // attached arrows follow their shapes
    notify(); requestDraw(); ui();
  }
  // The shape a connector end would attach to (topmost, under the point).
  function bindTarget(p, skipId) {
    const tol = 8 / s.view.zoom;
    for (let i = s.objects.length - 1; i >= 0; i--) {
      const o = s.objects[i];
      if (o.id === skipId || o.locked || !BINDABLE.has(o.type)) continue;
      const b = inflate(bounds(o), tol);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return o;
    }
    return null;
  }
  function setSectionTitle(t) {
    const id = s.selection[0];
    commit(s.objects.map((o) => (o.id === id ? { ...o, title: t } : o)), { coalesce: "title" + id });
  }
  function addImageToSection(file) {
    const sec = s.objects.find((o) => o.id === s.selection[0]);
    if (!file || !sec) return;
    const b = bounds(sec), head = 36, pad = 14;
    const fit = { w: b.w - pad * 2, h: b.h - head - pad * 2 };
    insertImage(file, { x: b.x + b.w / 2, y: b.y + head + pad + fit.h / 2 }, fit);
  }
  function pruneSelection() {
    const ids = new Set(s.objects.map((o) => o.id));
    s.selection = s.selection.filter((id) => ids.has(id));
  }
  function undo() {
    commitEdit();
    if (!s.undo.length) return;
    s.redo.push(s.objects); s.objects = s.undo.pop(); s.lastCoalesce = null;
    pruneSelection(); notify(); requestDraw(); ui();
  }
  function redo() {
    commitEdit();
    if (!s.redo.length) return;
    s.undo.push(s.objects); s.objects = s.redo.pop(); s.lastCoalesce = null;
    pruneSelection(); notify(); requestDraw(); ui();
  }
  function setPage(patch) {
    const wasSheets = s.sheets;
    Object.assign(s, patch);
    if ("sheets" in patch && patch.sheets && !wasSheets) fitSheets();
    notify(); requestDraw(); ui();
  }
  // A4 pages always fill the screen width (100%), keeping the same spot at the top of the screen.
  function fitSheets() {
    const { w } = s.size, m = w < 600 ? 8 : 24;
    const z = clamp((w - m * 2) / A4.w, MIN_ZOOM, MAX_ZOOM);
    const top = -s.view.y / s.view.zoom; // world y currently at the top edge
    s.view = { zoom: z, x: (w - A4.w * z) / 2, y: top <= 0 ? m * 2 : -top * z };
  }

  // Any screen size: keep the same part of the page across the full width of the new screen.
  function scaleViewToWidth(fromW, toW) {
    const v = s.view, z = clamp(v.zoom * (toW / fromW), MIN_ZOOM, MAX_ZOOM);
    s.view = { zoom: z, x: (v.x / v.zoom) * z, y: (v.y / v.zoom) * z };
  }
  // Pages saved before screen widths were remembered: shrink so the writing fits the width (never above 100%).
  function fitContentWidth() {
    const box = unionBounds(s.objects);
    if (!box) return;
    const { w } = s.size, m = w < 600 ? 12 : 32;
    const left = Math.min(box.x, -s.view.x / s.view.zoom), right = box.x + box.w;
    const z = clamp(Math.min(1, (w - m * 2) / Math.max(right - left, 1)), MIN_ZOOM, 1);
    if (z >= s.view.zoom && right * s.view.zoom + s.view.x <= w) return; // already fits
    const top = -s.view.y / s.view.zoom;
    s.view = { zoom: z, x: m - left * z, y: -top * z };
  }
  function fitToScreen(prevW) {
    if (s.sheets) return fitSheets();
    if (prevW > 1) return scaleViewToWidth(prevW, s.size.w);          // window resized / phone rotated
    if (s.savedW) { if (Math.abs(s.savedW - s.size.w) > 2) scaleViewToWidth(s.savedW, s.size.w); return; }
    fitContentWidth();                                                 // older page, first open
  }

  /* ------------------------------------------------------ presentation */
  // Slides = the page's Sections (top to bottom, left to right); else the A4 sheets; else the whole page.
  function computeSlides() {
    const secs = s.objects.filter((o) => o.type === "section").map((o) => norm(o));
    if (secs.length) return secs.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y));
    if (s.sheets) return Array.from({ length: s.sheets }, (_, i) => ({ x: 0, y: i * (A4.h + A4.gap), w: A4.w, h: A4.h }));
    const u = unionBounds(s.objects);
    return u ? [u] : [];
  }
  function viewFor(box) {
    const b = inflate(box, Math.max(box.w, box.h) * 0.04), { w, h } = s.size;
    const z = clamp(Math.min(w / b.w, h / b.h), MIN_ZOOM, MAX_ZOOM);
    return { zoom: z, x: w / 2 - (b.x + b.w / 2) * z, y: h / 2 - (b.y + b.h / 2) * z };
  }
  function goSlide(i, animate = true) {
    const P = s.present;
    if (!P || !P.slides.length) return;
    P.i = clamp(i, 0, P.slides.length - 1);
    const to = viewFor(P.slides[P.i]), from = { ...s.view }, t0 = performance.now(), dur = animate ? 420 : 0;
    cancelAnimationFrame(P.anim);
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      // zoom in log space so the move feels even
      const z = Math.exp(Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e);
      const cx = (s.size.w / 2 - from.x) / from.zoom + ((s.size.w / 2 - to.x) / to.zoom - (s.size.w / 2 - from.x) / from.zoom) * e;
      const cy = (s.size.h / 2 - from.y) / from.zoom + ((s.size.h / 2 - to.y) / to.zoom - (s.size.h / 2 - from.y) / from.zoom) * e;
      s.view = { zoom: z, x: s.size.w / 2 - cx * z, y: s.size.h / 2 - cy * z };
      requestDraw();
      if (k < 1) P.anim = requestAnimationFrame(step);
    };
    P.anim = requestAnimationFrame(step);
    ui();
  }
  // Outline: section titles, headings (big or bold text) and bookmarks, in reading order.
  function outlineItems() {
    const items = [];
    for (const o of s.objects) {
      if (o.type === "section") items.push({ kind: "section", id: o.id, label: o.title || "Section", box: norm(o) });
      else if (o.type === "text" && (o.size >= 30 || (o.bold && o.size >= 22)) && (o.text || "").trim())
        items.push({ kind: "heading", id: o.id, label: shownText(o.text).trim().split("\n")[0].slice(0, 60), box: bounds(o) });
    }
    for (const m of s.marks) items.push({ kind: "mark", id: m.id, label: m.name, box: m.box });
    return items.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  }
  function flyTo(to) {
    const from = { ...s.view }, t0 = performance.now();
    cancelAnimationFrame(s.flyAnim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 380), e = 1 - Math.pow(1 - k, 3);
      s.view = { zoom: from.zoom + (to.zoom - from.zoom) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      requestDraw();
      if (k < 1) s.flyAnim = requestAnimationFrame(step); else viewChanged();
    };
    s.flyAnim = requestAnimationFrame(step);
  }
  function goOutline(it) {
    if (it.kind === "mark") return flyTo(viewFor(it.box));
    // headings/sections: keep the zoom (unless it is too far out), put the item near the top-left
    const z = Math.max(s.view.zoom, Math.min(1, s.size.w / (it.box.w + 80)));
    flyTo({ zoom: z, x: 40 - it.box.x * z, y: 40 - it.box.y * z });
  }
  function addMark(name) {
    const tl = toWorld({ x: 0, y: 0 }), br = toWorld({ x: s.size.w, y: s.size.h });
    s.marks = [...s.marks, { id: newId(), name, box: { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y } }];
    notify(); ui();
  }
  function showControls() {
    if (!s.present) return;
    s.present.idle = false; ui();
    clearTimeout(s.present.idleT);
    s.present.idleT = setTimeout(() => { if (s.present) { s.present.idle = true; ui(); } }, 2500);
  }

  // Snap to grid + alignment guides (toggle in the zoom bar; hold Alt to move freely).
  const gridSize = () => s.gap || (s.bg === "lines" || s.bg === "ruled" ? 34 : 28);
  const snapOn = (e) => s.snap && !(e && e.altKey);
  const toGrid = (v) => Math.round(v / gridSize()) * gridSize();
  function snapMove(box, dx, dy, ids) {
    const tol = 6 / s.view.zoom, guides = [];
    const xs = [box.x, box.x + box.w / 2, box.x + box.w], ys = [box.y, box.y + box.h / 2, box.y + box.h];
    let bx = null, by = null;
    for (const o of s.objects) {
      if (ids.has(o.id) || o.locked) continue;
      const b = bounds(o);
      for (const tx of [b.x, b.x + b.w / 2, b.x + b.w]) for (const sx of xs) {
        const d = tx - (sx + dx);
        if (Math.abs(d) <= tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, v: tx };
      }
      for (const ty of [b.y, b.y + b.h / 2, b.y + b.h]) for (const sy of ys) {
        const d = ty - (sy + dy);
        if (Math.abs(d) <= tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, v: ty };
      }
    }
    if (bx) { dx += bx.d; guides.push({ x: bx.v }); } else dx = toGrid(box.x + dx) - box.x;
    if (by) { dy += by.d; guides.push({ y: by.v }); } else dy = toGrid(box.y + dy) - box.y;
    s.guides = guides;
    return [dx, dy];
  }

  function screenPos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const toWorld = (p) => ({ x: (p.x - s.view.x) / s.view.zoom, y: (p.y - s.view.y) / s.view.zoom });
  function zoomAt(sx, sy, factor) {
    const z = s.view.zoom, nz = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
    const wx = (sx - s.view.x) / z, wy = (sy - s.view.y) / z;
    s.view = { x: sx - wx * nz, y: sy - wy * nz, zoom: nz };
    viewChanged();
  }
  function zoomCenter(factor) { zoomAt(s.size.w / 2, s.size.h / 2, factor); }
  function resetView() { s.view = { x: 0, y: 0, zoom: 1 }; viewChanged(); }
  function fitView() {
    if (s.sheets) { fitSheets(); viewChanged(); return; }
    const box = unionBounds(s.objects);
    if (!box) return resetView();
    const pad = 80, { w, h } = s.size;
    const z = clamp(Math.min((w - pad * 2) / Math.max(box.w, 1), (h - pad * 2) / Math.max(box.h, 1)), MIN_ZOOM, 2);
    s.view = { zoom: z, x: w / 2 - (box.x + box.w / 2) * z, y: h / 2 - (box.y + box.h / 2) * z };
    viewChanged();
  }
  function viewCenterWorld() { return toWorld({ x: s.size.w / 2, y: s.size.h / 2 }); }

  function setTool(t) {
    commitEdit();
    s.tool = t;
    if (t !== "select" && t !== "hand") s.selection = [];
    s.preview = null;
    requestDraw(); ui();
  }

  /* ----------------------------------------------------------- selection */
  const selectedObjs = () => { const set = new Set(s.selection); return s.objects.filter((o) => set.has(o.id)); };
  const selBox = () => (s.selection.length ? unionBounds(selectedObjs()) : null);
  function handlesFor(box) {
    const z = s.view.zoom, pad = 6;
    const X = box.x * z + s.view.x - pad, Y = box.y * z + s.view.y - pad, W = box.w * z + pad * 2, H = box.h * z + pad * 2;
    return [
      { id: "nw", x: X, y: Y }, { id: "n", x: X + W / 2, y: Y }, { id: "ne", x: X + W, y: Y },
      { id: "e", x: X + W, y: Y + H / 2 }, { id: "se", x: X + W, y: Y + H }, { id: "s", x: X + W / 2, y: Y + H },
      { id: "sw", x: X, y: Y + H }, { id: "w", x: X, y: Y + H / 2 },
    ];
  }
  function hitHandle(pos) {
    if (s.tool !== "select") return null;
    const box = selBox();
    if (!box) return null;
    for (const h of handlesFor(box)) if (Math.abs(pos.x - h.x) <= 8 && Math.abs(pos.y - h.y) <= 8) return h.id;
    return null;
  }
  function hitTest(px, py) {
    const tol = 7 / s.view.zoom;
    for (let i = s.objects.length - 1; i >= 0; i--) if (!s.objects[i].locked && hitObject(s.objects[i], px, py, tol)) return s.objects[i];
    return null;
  }

  /* ------------------------------------------------------------- drawing */
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = s.size, dpr = s.dpr, { x: vx, y: vy, zoom: z } = s.view, theme = rtheme();
    const opts = { onImage: requestDraw, onFont: onFontLoaded, pxScale: dpr * z };
    // While a stroke is being drawn nothing else on the page changes, so the finished page is kept as a
    // picture and each frame only adds the new ink. Busy pages then write as smoothly as empty ones.
    const live = !!(s.drag && s.drag.type === "draw" && s.preview);
    const sc = s.scene;
    if (live && sc && sc.objs === s.objects && sc.vx === vx && sc.vy === vy && sc.z === z && sc.cw === canvas.width && sc.ch === canvas.height && sc.theme === theme) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sc.canvas, 0, 0);
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBackground(ctx, w, h, s.view, s.bg, theme, s.paper, s.gap, s.sheets);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * vx, dpr * vy);
      const vis = { x: -vx / z, y: -vy / z, w: w / z, h: h / z };
      const editingId = s.editing && s.editing.id;
      for (const o of s.objects) {
        if (o.id === editingId) continue;
        if (!intersects(inflate(bounds(o), (o.width || 0) + 12 + (o.size || 0) * 0.3), vis)) continue;
        const later = s.playback && o.rec && o.rec.id === s.playback.id && o.rec.ms > s.playback.ms;
        drawObject(ctx, o, theme, { ...opts, alpha: s.erasing && s.erasing.has(o.id) ? 0.2 : later ? 0.13 : 1 });
      }
      if (live) {
        const cv = (sc && sc.canvas) || document.createElement("canvas");
        if (cv.width !== canvas.width || cv.height !== canvas.height) { cv.width = canvas.width; cv.height = canvas.height; }
        const cx = cv.getContext("2d");
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); cx.drawImage(canvas, 0, 0);
        s.scene = { canvas: cv, objs: s.objects, vx, vy, z, cw: canvas.width, ch: canvas.height, theme };
      } else if (sc) sc.objs = null; // stale once the stroke is done
    }
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * vx, dpr * vy);
    if (s.preview) drawObject(ctx, s.preview, theme, opts);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.marquee) {
      const m = s.marquee;
      const x = Math.min(m.x1, m.x2) * z + vx, y = Math.min(m.y1, m.y2) * z + vy;
      const mw = Math.abs(m.x2 - m.x1) * z, mh = Math.abs(m.y2 - m.y1) * z;
      ctx.fillStyle = "rgba(99,102,241,.10)"; ctx.strokeStyle = "rgba(99,102,241,.85)"; ctx.lineWidth = 1;
      ctx.fillRect(x, y, mw, mh); ctx.strokeRect(x + 0.5, y + 0.5, mw, mh);
    }
    if (s.bindHover) {
      const t = s.objects.find((o) => o.id === s.bindHover);
      if (t) {
        const b = bounds(t), pad = 6;
        ctx.save(); ctx.strokeStyle = "#22c55e"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.strokeRect(b.x * z + vx - pad, b.y * z + vy - pad, b.w * z + pad * 2, b.h * z + pad * 2);
        ctx.restore();
      }
    }
    if (s.guides && s.guides.length) {
      ctx.save(); ctx.strokeStyle = "#ec4899"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      for (const g of s.guides) {
        ctx.beginPath();
        if (g.x !== undefined) { const gx = Math.round(g.x * z + vx) + 0.5; ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
        else { const gy = Math.round(g.y * z + vy) + 0.5; ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
        ctx.stroke();
      }
      ctx.restore();
    }
    if (s.lasso && s.lasso.length > 1) {
      ctx.beginPath();
      s.lasso.forEach(([lx, ly], i) => (i ? ctx.lineTo(lx * z + vx, ly * z + vy) : ctx.moveTo(lx * z + vx, ly * z + vy)));
      ctx.closePath();
      ctx.fillStyle = "rgba(99,102,241,.08)"; ctx.fill();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(99,102,241,.9)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    }
    const box = s.tool === "select" || s.tool === "hand" ? selBox() : null;
    if (box) {
      const pad = 6, acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#6366f1";
      const x = box.x * z + vx - pad, y = box.y * z + vy - pad, bw = box.w * z + pad * 2, bh = box.h * z + pad * 2;
      ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, 6); else ctx.rect(x, y, bw, bh); ctx.stroke();
      ctx.setLineDash([]);
      if (s.tool === "select" && !(s.drag && s.drag.type === "move")) {
        for (const hd of handlesFor(box)) {
          ctx.beginPath(); ctx.arc(hd.x, hd.y, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = "#fff"; ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 4; ctx.fill();
          ctx.shadowBlur = 0; ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }
  }

  /* ---------------------------------------------------- text / sticky edit */
  function fitSticky(o) {
    const lines = wrapText(shownText(o.text), o.w - 2 * STICKY_PAD, fontSpec(o));
    const need = lines.length * o.size * LINE_H + 2 * STICKY_PAD;
    return need > o.h ? { ...o, h: need } : o;
  }
  function startEdit(obj, spec) {
    commitEdit();
    if (obj) {
      s.editing = {
        key: ++s.editKey, id: obj.id, kind: obj.type, x: obj.x, y: obj.y, w: obj.w, h: obj.h, size: obj.size, stroke: obj.stroke,
        fill: obj.fill, value: obj.text, effect: obj.effect, fx2: obj.fx2, hlBg: obj.hlBg, ...textFields(obj),
      };
      s.selection = [obj.id];
    } else {
      const st = s.style;
      s.editing = spec.kind === "sticky"
        ? { key: ++s.editKey, id: null, kind: "sticky", x: spec.x - 100, y: spec.y - 100, w: 200, h: 200, size: Math.round(st.fontSize * 0.8), stroke: st.stroke, fill: st.fill || "#fef08a", value: "", ...textFields(st) }
        : { key: ++s.editKey, id: null, kind: "text", x: spec.x, y: spec.y, size: st.fontSize, stroke: st.stroke, value: "", effect: st.effect, fx2: st.fx2, hlBg: st.hlBg, ...textFields(st) };
    }
    requestDraw(); ui();
  }
  function commitEdit() {
    const ed = s.editing;
    if (!ed) return;
    s.editing = null;
    let text = ed.value.replace(/\s+$/, "");
    if (s.style.math !== false) text = solveLines(text); // "25 × 4 =" gets its answer
    if (ed.id) {
      const o = s.objects.find((x) => x.id === ed.id);
      s.lastEditId = ed.id;
      if (o) {
        if (!text && ed.kind === "text") commit(s.objects.filter((x) => x.id !== ed.id));
        else if (text !== o.text) {
          let n = { ...o, text };
          if (n.type === "sticky") n = fitSticky(n);
          commit(s.objects.map((x) => (x.id === ed.id ? n : x)));
        }
      }
    } else if (text || ed.kind === "sticky") {
      let o = ed.kind === "sticky"
        ? { id: newId(), type: "sticky", x: ed.x, y: ed.y, w: ed.w, h: ed.h, text, size: ed.size, stroke: ed.stroke, fill: ed.fill, opacity: s.style.opacity, ...textFields(ed) }
        : { id: newId(), type: "text", x: ed.x, y: ed.y, text, size: ed.size, stroke: ed.stroke, opacity: s.style.opacity, effect: ed.effect || "none", fx2: ed.fx2, hlBg: ed.hlBg || null, ...textFields(ed) };
      if (o.type === "sticky") o = fitSticky(o);
      if (s.lecture) o.rec = { id: s.lecture.id, ms: Date.now() - s.lecture.start };
      s.lastEditId = o.id;
      commit([...s.objects, o]);
    }
    requestDraw(); ui();
  }

  /* ---------------------------------------------------------------- links */
  const linkHit = (p) => { const o = hitTest(p.x, p.y); const url = o && TEXTY.has(o.type) ? linkAt(o, p.x, p.y) : null; return url ? { url, o } : null; };
  // "Add link": words picked while typing get the link; otherwise the whole selected note does.
  function addLink() {
    if (blocked()) return;
    let range = null, ids;
    if (s.editing) {
      const ta = taRef.current, v = s.editing.value;
      const a = ta ? ta.selectionStart : v.length, b = ta ? ta.selectionEnd : v.length;
      commitEdit();
      const o = s.objects.find((x) => x.id === s.lastEditId);
      if (!o) { s.toast && s.toast("Type something first, then add a link to it.", "info"); return; }
      if (a !== b && v.slice(a, b).trim()) range = { a, b, str: v.slice(a, b) };
      ids = [o.id];
    } else ids = selectedObjs().filter((o) => TEXTY.has(o.type) && o.text).map((o) => o.id);
    if (!ids.length) { s.toast && s.toast("Select a text or note first (or pick some words while typing).", "info"); return; }
    const one = s.objects.find((o) => o.id === ids[0]);
    s.selection = ids; s.linkPop = null;
    s.linkBox = { ids, range, label: range ? range.str : shownText(one.text).split("\n")[0].slice(0, 40) };
    requestDraw(); ui();
  }
  function applyLink(input) {
    const box = s.linkBox, url = cleanUrl(input);
    if (!box) return;
    if (!url) { s.toast && s.toast("That does not look like a web address (e.g. youtube.com).", "error"); return; }
    s.linkBox = null;
    const ids = new Set(box.ids);
    commit(s.objects.map((o) => {
      if (!ids.has(o.id)) return o;
      let text = o.text, r = box.range;
      if (r) {
        const at = text.slice(r.a, r.b) === r.str ? r.a : text.indexOf(r.str);
        if (at >= 0) text = text.slice(0, at) + makeLink(r.str, url) + text.slice(at + r.str.length);
        else text = makeLink(shownText(text), url);
      } else text = makeLink(shownText(text), url);
      const n = { ...o, text };
      return n.type === "sticky" ? fitSticky(n) : n;
    }));
    s.toast && s.toast(`Linked to ${linkLabel(url)} – click the blue words to open it.`, "success");
    requestDraw(); ui();
  }
  function unlink(url) {
    if (blocked()) return;
    const ids = new Set(s.linkPop ? [s.linkPop.id] : s.selection);
    s.linkPop = null;
    commit(s.objects.map((o) => (ids.has(o.id) && TEXTY.has(o.type) && o.text ? { ...o, text: removeLink(o.text, url) } : o)));
    requestDraw(); ui();
  }
  // Typing: Ctrl+K adds a link; pasting an address over picked words links them.
  function onEditPaste(e) {
    const url = (e.clipboardData.getData("text/plain") || "").trim(), ta = e.target;
    if (!URL_ONLY.test(url) || ta.selectionStart === ta.selectionEnd) return;
    e.preventDefault();
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd, ins = makeLink(v.slice(a, b), url);
    s.editing.value = v.slice(0, a) + ins + v.slice(b); ui();
    requestAnimationFrame(() => { try { ta.setSelectionRange(a + ins.length, a + ins.length); } catch { /* ignore */ } });
  }

  /* ---------------------------------------------------------- operations */
  function deleteSelection() {
    if (!s.selection.length) return;
    const ids = new Set(s.selection);
    s.selection = [];
    commit(s.objects.filter((o) => !ids.has(o.id)));
  }
  function cloneObjs(list, dx, dy) {
    return list.map((o) => ({ ...translateObject(o, dx, dy), id: newId() }));
  }
  function duplicateSelection() {
    const sel = selectedObjs();
    if (!sel.length) return;
    const copies = cloneObjs(sel, 24, 24);
    s.selection = copies.map((o) => o.id);
    commit([...s.objects, ...copies]);
  }
  function arrange(front) {
    if (!s.selection.length) return;
    const ids = new Set(s.selection);
    const sel = s.objects.filter((o) => ids.has(o.id)), rest = s.objects.filter((o) => !ids.has(o.id));
    commit(front ? [...rest, ...sel] : [...sel, ...rest]);
  }
  // "clear-ink": every pen/highlighter stroke; "clear-all": everything on the page. Locked items stay. Undo brings it back.
  function clearPage(kind) {
    if (blocked()) return;
    const ink = kind === "clear-ink";
    const gone = s.objects.filter((o) => !o.locked && (!ink || o.type === "pen"));
    if (!gone.length) { s.toast && s.toast(ink ? "There are no drawings on this page." : "This page is already empty.", "info"); return; }
    if (!confirm(ink ? `Delete all ${gone.length} drawing${gone.length === 1 ? "" : "s"} on this page?` : `Clear the whole page (${gone.length} item${gone.length === 1 ? "" : "s"})?`)) return;
    commitEdit();
    const ids = new Set(gone.map((o) => o.id));
    s.selection = [];
    commit(s.objects.filter((o) => !ids.has(o.id)));
    requestDraw(); ui();
    s.toast && s.toast(`${ink ? "Drawings deleted" : "Page cleared"} – press Ctrl + Z (Undo) to bring ${gone.length === 1 ? "it" : "them"} back.`, "success");
  }
  function selectAll() { s.tool = "select"; s.selection = s.objects.filter((o) => !o.locked).map((o) => o.id); requestDraw(); ui(); }
  function nudge(dx, dy) {
    if (!s.selection.length) return;
    const ids = new Set(s.selection);
    commit(s.objects.map((o) => (ids.has(o.id) ? translateObject(o, dx, dy) : o)), { coalesce: "nudge" });
  }

  // Quick colors: shapes, notes and sections get the color as fill; everything else as ink/stroke.
  const takesFill = (type) => CLOSED.has(type) || type === "sticky" || type === "section";
  function quickTarget() {
    const sel = selectedObjs();
    if (sel.length) return sel.every((o) => takesFill(o.type)) ? "fill" : "ink";
    return takesFill(TOOL_TYPE[s.tool]) ? "fill" : "ink";
  }
  function quickColor(c) {
    const sel = selectedObjs();
    if (sel.length) {
      const ids = new Set(s.selection);
      commit(s.objects.map((o) => {
        if (!ids.has(o.id) || o.type === "image") return o;
        return takesFill(o.type) ? { ...o, fill: c } : { ...o, stroke: c };
      }), { coalesce: "style" });
    }
    if (quickTarget() === "fill") s.style = { ...s.style, fill: c };
    else s.style = { ...s.style, stroke: c };
    requestDraw(); ui();
  }

  function applyStyle(patch) {
    // "No outline" is remembered as a flag so pens, lines and text never lose their color.
    if ("stroke" in patch) {
      const { stroke, ...rest } = patch;
      s.style = stroke === null ? { ...s.style, ...rest, noOutline: true } : { ...s.style, ...patch, noOutline: false };
    } else s.style = { ...s.style, ...patch };
    if (s.selection.length) {
      const ids = new Set(s.selection);
      commit(s.objects.map((o) => {
        if (!ids.has(o.id)) return o;
        const n = { ...o };
        for (const [k, v] of Object.entries(patch)) {
          if (k === "fontSize") { if (TEXTY.has(o.type)) n.size = v; }
          else if (TEXT_KEYS.has(k)) { if (TEXTY.has(o.type)) n[k] = v; }
          else if (TEXT_ONLY_KEYS.has(k)) { if (o.type === "text") n[k] = v; }
          else if (k === "fill") { if (FILLABLE.has(o.type)) n.fill = o.type === "sticky" ? v || o.fill : v; }
          else if (k === "width") { if (STROKED.has(o.type)) n.width = o.hl ? hlW(v) : v; }
          else if (k === "dash") { if (DASHABLE.has(o.type)) n.dash = v; }
          else if (k === "stroke") { if (o.type !== "image" && (v !== null || CLOSED.has(o.type))) n.stroke = v; }
          else if (k === "inkBold") { if (o.type === "pen" && !o.hl) { if (v) n.bold = true; else delete n.bold; } }
          else if (k === "inkItalic") {
            if (o.type === "pen" && !o.hl && v !== !!o.italic) {
              Object.assign(n, slantStroke(o, v ? 1 : -1));
              if (v) n.italic = true; else delete n.italic;
            }
          }
          else if (k === "beautify") { if (o.type === "pen" && !o.hl) { if (v === "ink") n.ink = true; else delete n.ink; } }
          else n[k] = v;
        }
        // Never leave a shape with neither outline nor fill (it would be invisible).
        if (CLOSED.has(n.type) && !n.stroke && !n.fill) {
          if ("stroke" in patch) n.fill = o.stroke || "auto"; else n.stroke = "auto";
        }
        if (n.type === "sticky") return fitSticky(n);
        return n;
      }), { coalesce: "style" });
    } else ui();
  }

  /* -------------------------------------------------------------- images */
  function placeImage(src, w, h, at, fit) {
    const dk = fit ? Math.min(1, fit.w / w, fit.h / h) : Math.min(1, 420 / Math.max(w, h)), dw = w * dk, dh = h * dk;
    const p = at || viewCenterWorld();
    const o = { id: newId(), type: "image", x: p.x - dw / 2, y: p.y - dh / 2, w: dw, h: dh, src, opacity: 1 };
    s.tool = "select"; s.selection = [o.id];
    commit([...s.objects, o]);
    if (src.length > 500000) s.toast && s.toast("Large image: pages over ~1 MB can't be saved. Use smaller images.", "error");
  }
  async function insertImage(file, at, fit) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const img = await loadImage(await fileToDataUrl(file));
      const jpeg = file.type === "image/jpeg";
      const r = scaleImage(img, { maxSide: jpeg ? 1000 : 800, type: jpeg ? "image/jpeg" : "image/png", quality: 0.8 });
      placeImage(r.src, r.w, r.h, at, fit);
    } catch { s.toast && s.toast("Could not read that image.", "error"); }
  }

  /* ------------------------------------------------------ AI: text + voice */
  async function aiText(action) {
    const sel = selectedObjs().filter((o) => TEXTY.has(o.type));
    if (!sel.length) { s.toast && s.toast("Select a text or sticky note first, then try again.", "info"); return; }
    s.aiBusy = true; ui();
    try {
      const out = await Promise.all(sel.map((o) => runTextAI(action, o.text)));
      const map = new Map(sel.map((o, i) => [o.id, out[i]]));
      commit(s.objects.map((o) => {
        if (!map.has(o.id)) return o;
        const n = { ...o, text: map.get(o.id) };
        return n.type === "sticky" ? fitSticky(n) : n;
      }));
      s.toast && s.toast(`${TEXT_ACTIONS[action].label}: done ✨`, "success");
    } catch (e) {
      console.error(e);
      s.toast && s.toast("The AI service could not answer right now. Check your internet and try again.", "error");
    }
    s.aiBusy = false; ui();
  }

  function dictate(lang) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { s.toast && s.toast("Voice typing needs Chrome, Edge or Safari.", "error"); return; }
    if (s.rec) { s.rec.stop(); return; }
    const rec = new SR();
    rec.lang = lang || "en-US"; rec.continuous = true; rec.interimResults = true;
    s.recText = ""; s.recInterim = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) s.recText += t + " "; else interim += t;
      }
      s.recInterim = interim; ui();
    };
    rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") s.toast && s.toast("Voice typing error: " + e.error, "error"); };
    rec.onend = () => {
      const text = (s.recText + s.recInterim).trim();
      s.rec = null; s.listening = false; s.recInterim = ""; s.recText = "";
      if (text) {
        const p = viewCenterWorld(), st = s.style;
        const o = { id: newId(), type: "text", x: p.x - 160, y: p.y - 40, text: wrapPlain(text), size: st.fontSize, stroke: st.stroke, opacity: 1, effect: st.effect, fx2: st.fx2, hlBg: st.hlBg, ...textFields(st) };
        s.tool = "select"; s.selection = [o.id];
        commit([...s.objects, o]);
      }
      ui();
    };
    try { rec.start(); s.rec = rec; s.listening = true; ui(); } catch { s.toast && s.toast("Could not start the microphone.", "error"); }
  }

  /* ------------------------------------------------------- lecture audio */
  // Record the lecture; every stroke written meanwhile remembers its moment (o.rec = { id, ms }).
  async function startLecture(lang) {
    if (s.lecture) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { s.toast && s.toast("Recording needs Chrome, Edge, Firefox or Safari.", "error"); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { s.toast && s.toast("Microphone permission was denied.", "error"); return; }
    const L = { id: "rec" + newId(), lang, start: Date.now(), chunks: [], transcript: [], interim: "", segStart: null, stream };
    L.mr = new MediaRecorder(stream);
    L.mr.ondataavailable = (e) => { if (e.data.size) L.chunks.push(e.data); };
    L.mr.start(1000);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const sr = new SR();
      sr.lang = lang; sr.continuous = true; sr.interimResults = true;
      sr.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript.trim();
          if (L.segStart === null) L.segStart = Date.now() - L.start;
          if (e.results[i].isFinal) { if (text) L.transcript.push({ ms: L.segStart, text }); L.segStart = null; }
          else interim += text + " ";
        }
        L.interim = interim.trim(); ui();
      };
      sr.onend = () => { if (s.lecture === L) { try { sr.start(); } catch { /* restarts after silence */ } } };
      try { sr.start(); L.sr = sr; } catch { /* captions are optional */ }
    }
    L.timer = setInterval(ui, 1000);
    s.lecture = L; ui();
  }
  function stopLecture() {
    const L = s.lecture;
    if (!L) return Promise.resolve();
    s.lecture = null; clearInterval(L.timer);
    if (L.sr) { L.sr.onend = null; try { L.sr.stop(); } catch { /* ignore */ } }
    return new Promise((res) => {
      L.mr.onstop = async () => {
        L.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(L.chunks, { type: L.mr.mimeType || "audio/webm" });
        try { await saveAudio(L.id, blob); } catch { s.toast && s.toast("Could not keep the audio on this device (storage full?).", "error"); }
        if (L.interim) L.transcript.push({ ms: L.segStart ?? Date.now() - L.start, text: L.interim });
        s.recs = [...s.recs, { id: L.id, title: `Recording ${s.recs.length + 1}`, at: L.start, dur: Date.now() - L.start, lang: L.lang, transcript: L.transcript }];
        notify(); ui();
        s.toast && s.toast("Recording saved. Tap the headphones to play it with your notes.", "success");
        res();
      };
      try { L.mr.stop(); } catch { res(); }
    });
  }
  function playFrom(o) {
    s.seek = { id: o.rec.id, ms: Math.max(0, o.rec.ms - 1500), n: Date.now() };
    ui();
  }
  function deleteRecording(id) {
    s.recs = s.recs.filter((r) => r.id !== id);
    if (s.playback && s.playback.id === id) s.playback = null;
    deleteAudio(id).catch(() => {});
    notify(); requestDraw(); ui();
  }

  /* -------------------------------------------------------------- export */
  function exportPNG() {
    const box = s.sheets ? sheetBox(s.sheets) : unionBounds(s.objects);
    if (!box) { s.toast && s.toast("This page is empty – draw something first.", "info"); return Promise.resolve(null); }
    const pad = s.sheets ? 0 : 48;
    const scale = Math.min(2, 4096 / Math.max(box.w + pad * 2, box.h + pad * 2));
    const W = Math.ceil((box.w + pad * 2) * scale), H = Math.ceil((box.h + pad * 2) * scale);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const view = { x: (pad - box.x) * scale, y: (pad - box.y) * scale, zoom: scale };
    const theme = rtheme();
    drawBackground(ctx, W, H, view, s.bg, theme, s.paper, s.gap);
    ctx.setTransform(scale, 0, 0, scale, view.x, view.y);
    for (const o of s.objects) drawObject(ctx, o, theme, { pxScale: scale });
    return new Promise((res) => c.toBlob(res, "image/png"));
  }
  // PDF: every A4 sheet becomes one page; a free canvas page becomes one page fitted to the content.
  async function exportPDF() {
    const boxes = s.sheets
      ? Array.from({ length: s.sheets }, (_, i) => ({ x: 0, y: i * (A4.h + A4.gap), w: A4.w, h: A4.h }))
      : [unionBounds(s.objects)].filter(Boolean).map((b) => inflate(b, 48));
    if (!boxes.length) { s.toast && s.toast("This page is empty – draw something first.", "info"); return null; }
    const theme = rtheme(), pages = [];
    for (const box of boxes) {
      const scale = Math.min(2.5, 3000 / Math.max(box.w, box.h));
      const W = Math.ceil(box.w * scale), H = Math.ceil(box.h * scale);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      const view = { x: -box.x * scale, y: -box.y * scale, zoom: scale };
      drawBackground(ctx, W, H, view, s.bg, theme, s.paper, s.gap);
      ctx.setTransform(scale, 0, 0, scale, view.x, view.y);
      for (const o of s.objects) drawObject(ctx, o, theme, { pxScale: scale });
      const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
      pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H });
    }
    return makePdf(pages);
  }
  useImperativeHandle(ref, () => ({
    exportPNG, exportPDF, fit: fitView, clearPage,
    aiText: (a) => { if (!blocked()) aiText(a); },
    dictate: (l) => { if (!blocked()) dictate(l); },
    addCards: (cards) => {
      if (blocked()) return;
      const c = viewCenterWorld(), W = 230, gap = 20, cols = Math.min(3, cards.length);
      const x0 = c.x - (cols * (W + gap)) / 2;
      const notes = cards.map((cd, i) => fitSticky({
        id: newId(), type: "sticky", x: x0 + (i % cols) * (W + gap), y: c.y - 120 + Math.floor(i / cols) * (W + gap), w: W, h: W,
        text: `Q: ${cd.q}\n\nA: ${cd.a}`, size: 16, stroke: "auto", fill: ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8"][i % 4], opacity: 1, ...textFields(s.style),
      }));
      s.tool = "select"; s.selection = notes.map((o) => o.id);
      commit([...s.objects, ...notes]); requestDraw(); ui();
    },
    setTool: (t) => { if (!blocked()) setTool(t); },
    toggleHelp: () => { s.showHelp = !s.showHelp; ui(); },
    insertImageDataUrl: (src, w, h) => { if (!blocked()) placeImage(src, w, h); },
    hasTextSelection: () => selectedObjs().some((o) => TEXTY.has(o.type)),
    isRecording: () => !!s.lecture,
    stopRecording: () => stopLecture(),
    getData: () => ({ recs: s.recs, marks: s.marks, objects: s.objects, view: savedView(), bg: s.bg, paper: s.paper, gap: s.gap, sheets: s.sheets }),
  }));

  /* ------------------------------------------------------------- pointers */
  function clearSnap() { clearTimeout(s.snapT); s.snapT = 0; }
  function armSnap() {
    clearSnap();
    const o = s.preview;
    if (!o || o.type !== "pen" || o.hl || o.points.length < 8) return;
    // Only big strokes turn into shapes: a short pause inside a letter must never change the writing.
    const b = bounds({ type: "pen", points: o.points });
    if (Math.hypot(b.w, b.h) * s.view.zoom < 90) return;
    s.snapT = setTimeout(() => {
      const cur = s.preview;
      if (!cur || cur.type !== "pen" || !s.drag || s.drag.type !== "draw") return;
      const sh = recognizeShape(cur.points);
      if (!sh) return;
      s.preview = {
        id: cur.id, type: sh.type, x: sh.x, y: sh.y, w: sh.w, h: sh.h, stroke: cur.stroke, width: cur.width,
        dash: "solid", opacity: cur.opacity, fill: sh.type === "line" ? null : s.style.fill,
      };
      s.drag = { ...s.drag, snapped: true };
      requestDraw();
    }, 650);
  }

  function onPointerDown(e) {
    if (e.button === 2) return;
    if (s.present) { s.present.tap = { x: e.clientX, y: e.clientY }; showControls(); return; }
    // Palm rejection: once a stylus is used, touches made while it is writing are ignored.
    if (e.pointerType === "pen") {
      // The pen came down again before the last stroke was closed (fast writing, a lost "up" on iPad):
      // keep that stroke instead of letting the new one replace it.
      if (s.drag && s.drag.type === "draw" && s.dragBy === "pen" && s.lastPen) onPointerUp(s.lastPen);
      s.lastPen = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, pointerType: "pen" };
      s.penSeen = true; s.penId = e.pointerId;
      // A palm that touched down just before the pen: forget it and undo whatever it did (pan, stray ink),
      // so the pen and the palm are never taken for a two-finger pinch.
      if (s.drag && s.dragBy === "touch") {
        if (s.drag.view0) { s.view = s.drag.view0; viewChanged(); }
        s.drag = null; s.preview = null; s.marquee = null; s.lasso = null; clearSnap();
      }
      for (const id of [...s.pointers.keys()]) if (s.ptype.get(id) !== "pen") s.pointers.delete(id);
    } else if (e.pointerType === "touch" && s.penSeen) {
      if (s.penId !== null) return; // the pen is writing: every touch now is the hand resting on the screen
      if (Date.now() - s.penUpAt < 450) return; // the palm often lands right as the pen lifts
      if ((e.width || 0) > 44 || (e.height || 0) > 44) return; // a wide contact is a palm, not a fingertip
    }
    const eraserEnd = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) !== 0);
    commitEdit();
    const canvas = canvasRef.current;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const pos = screenPos(e);
    s.pointers.set(e.pointerId, pos);
    s.ptype.set(e.pointerId, e.pointerType);
    s.dragBy = e.pointerType;

    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      clearSnap();
      s.preview = null; s.marquee = null; s.lasso = null;
      s.drag = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: { ...s.view } };
      requestDraw(); ui();
      return;
    }
    if (s.pointers.size > 2) return;

    if (s.linkPop) { s.linkPop = null; ui(); }
    s.linkTap = null;
    if (e.button === 0 && !s.editing) {
      const lk = linkHit(toWorld(pos));
      if (lk && (e.ctrlKey || e.metaKey)) { s.pointers.delete(e.pointerId); openLink(lk.url); return; } // Ctrl+click opens a link with any tool
      if (lk && !e.shiftKey && (s.readOnly || s.tool === "select")) s.linkTap = { url: lk.url, id: lk.o.id, x: pos.x, y: pos.y, ro: s.readOnly };
    }
    // With a stylus around, a single finger pans instead of drawing.
    const fingerPan = e.pointerType === "touch" && s.penSeen && s.tool !== "select";
    if (e.button === 1 || s.space || s.tool === "hand" || fingerPan || s.readOnly) {
      s.drag = { type: "pan", start: pos, view0: { ...s.view } };
      ui();
      return;
    }
    if (e.button !== 0 && !eraserEnd) return;

    const p = toWorld(pos), t = eraserEnd ? "eraser" : s.tool, st = s.style;

    if (t === "lasso") {
      s.selection = [];
      s.lasso = [[p.x, p.y]];
      s.drag = { type: "lasso" };
      requestDraw(); ui();
      return;
    }

    if (t === "select") {
      const hh = hitHandle(pos);
      if (hh) {
        const box = selBox();
        const edgeX = hh.includes("w") ? box.x : hh.includes("e") ? box.x + box.w : null;
        const edgeY = hh.includes("n") ? box.y : hh.includes("s") ? box.y + box.h : null;
        const sel = selectedObjs();
        s.drag = {
          type: "resize", handle: hh, box, start: s.objects, ids: new Set(s.selection), moved: false,
          gx: edgeX === null ? 0 : p.x - edgeX, gy: edgeY === null ? 0 : p.y - edgeY,
          lock: sel.every((o) => o.type === "text" || o.type === "image"),
        };
        ui();
        return;
      }
      const obj = hitTest(p.x, p.y);
      if (obj && s.playback && obj.rec && s.recs.some((r) => r.id === obj.rec.id)) { playFrom(obj); } // player open: tap ink to hear it
      if (obj) {
        if (e.shiftKey) {
          s.selection = s.selection.includes(obj.id) ? s.selection.filter((id) => id !== obj.id) : [...s.selection, obj.id];
          requestDraw(); ui();
          return;
        }
        if (!s.selection.includes(obj.id)) s.selection = [obj.id];
        if (e.altKey) {
          const copies = cloneObjs(selectedObjs(), 0, 0);
          s.selection = copies.map((o) => o.id);
          commit([...s.objects, ...copies]);
        }
        const ids = new Set(s.selection);
        for (const sec of s.objects) {
          if (sec.type !== "section" || !ids.has(sec.id)) continue;
          const sb = bounds(sec);
          for (const c of s.objects) {
            if (c.type === "section" || ids.has(c.id)) continue;
            const cb = bounds(c);
            if (cb.x >= sb.x && cb.y >= sb.y && cb.x + cb.w <= sb.x + sb.w && cb.y + cb.h <= sb.y + sb.h) ids.add(c.id);
          }
        }
        s.drag = { type: "move", start: p, objs: s.objects, ids, moved: false };
      } else {
        const base = e.shiftKey ? [...s.selection] : [];
        s.selection = base;
        s.drag = { type: "marquee", base };
        s.marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      }
      requestDraw(); ui();
      return;
    }

    if (t === "eraser") {
      s.erasing = new Set();
      s.drag = { type: "erase" };
      eraseAt(p);
      return;
    }
    if (t === "text") {
      e.preventDefault();
      const hit = hitTest(p.x, p.y);
      if (hit && hit.type === "text") startEdit(hit);
      else startEdit(null, { kind: "text", x: p.x, y: p.y });
      return;
    }
    if (t === "sticky") {
      e.preventDefault();
      startEdit(null, { kind: "sticky", x: p.x, y: p.y });
      return;
    }
    if (t === "pen" || t === "marker") {
      const hl = t === "marker";
      const pretty = !hl && st.beautify !== "off";
      const usePr = !hl && e.pointerType === "pen" && st.pressure !== false; // stylus pressure -> line width
      s.preview = {
        id: newId(), type: "pen", points: [usePr ? [p.x, p.y, prOf(e)] : [p.x, p.y]], stroke: st.stroke,
        width: hl ? hlW(st.width) : st.width, opacity: st.opacity, dash: "solid", ...(hl ? { hl: true } : {}),
        ...(pretty && st.beautify === "ink" ? { ink: true } : {}), ...(usePr ? { pr: true } : {}),
      };
      // A stylus is already steady, so its ink follows the tip closely; mouse and fingers get more smoothing.
      s.drag = { type: "draw", pretty, raw: [p.x, p.y], follow: e.pointerType === "pen" ? 0.72 : 0.45 };
      if (s.lecture) s.preview.rec = { id: s.lecture.id, ms: Date.now() - s.lecture.start };
    } else {
      const fillNew = t === "line" || t === "arrow" ? null : t === "section" ? st.fill || "#6366f1" : st.fill;
      const o = { id: newId(), type: t, x: p.x, y: p.y, w: 0, h: 0, stroke: CLOSED.has(t) && st.noOutline && fillNew ? null : st.stroke, width: st.width, dash: st.dash, opacity: st.opacity, fill: t === "line" || t === "arrow" ? null : t === "section" ? st.fill || "#6366f1" : st.fill };
      if (s.lecture) o.rec = { id: s.lecture.id, ms: Date.now() - s.lecture.start };
      if (t === "line" || t === "arrow") { const tg = bindTarget(p); if (tg) o.from = tg.id; }
      else if (snapOn(e)) { o.x = toGrid(o.x); o.y = toGrid(o.y); }
      s.preview = o;
      s.drag = { type: "draw", start: { x: o.x, y: o.y } };
    }
    s.selection = [];
    requestDraw(); ui();
  }

  function eraseAt(p) {
    const o = hitTest(p.x, p.y);
    if (o && !s.erasing.has(o.id)) { s.erasing.add(o.id); requestDraw(); }
  }

  function updateHoverCursor(pos) {
    const c = canvasRef.current;
    if (!c) return;
    if (s.readOnly || s.tool === "select") {
      const lk = linkHit(toWorld(pos));
      if (lk) { c.style.cursor = "pointer"; c.title = hrefOf(lk.url) + (s.readOnly ? "" : "  (click to open)"); return; }
      c.title = "";
    }
    if (s.readOnly) { c.style.cursor = ""; return; }
    if (s.tool !== "select") return;
    const hh = hitHandle(pos);
    if (hh) { c.style.cursor = RESIZE_CURSOR[hh]; return; }
    const p = toWorld(pos);
    c.style.cursor = hitTest(p.x, p.y) ? "move" : "default";
  }

  function onPointerMove(e) {
    if (e.pointerType === "pen") s.lastPen = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, pointerType: "pen" };
    const pos = screenPos(e);
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, pos);
    const d = s.drag;
    if (!d) { updateHoverCursor(pos); return; }
    if (!s.pointers.has(e.pointerId)) return;

    if (d.type === "pinch") {
      if (s.pointers.size < 2) return;
      const [a, b] = [...s.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1, c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nz = clamp(d.view0.zoom * (dist / d.d0), MIN_ZOOM, MAX_ZOOM);
      const wx = (d.c0.x - d.view0.x) / d.view0.zoom, wy = (d.c0.y - d.view0.y) / d.view0.zoom;
      s.view = { zoom: nz, x: c.x - wx * nz, y: c.y - wy * nz };
      viewChanged();
      return;
    }
    if (d.type === "pan") {
      s.view = { ...d.view0, x: d.view0.x + (pos.x - d.start.x), y: d.view0.y + (pos.y - d.start.y) };
      viewChanged();
      return;
    }
    const p = toWorld(pos);

    if (d.type === "draw") {
      const o = s.preview;
      if (!o || d.snapped) return;
      if (o.type === "pen") {
        const evs = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e.nativeEvent];
        const r = canvasRef.current.getBoundingClientRect();
        let added = false;
        for (const ev of (evs.length ? evs : [e.nativeEvent])) {
          let q = toWorld({ x: ev.clientX - r.left, y: ev.clientY - r.top });
          const last = o.points[o.points.length - 1], pv = o.pr ? prOf(ev) : null;
          if (d.pretty) {
            // Stabilizer: the ink follows the pointer a little behind, which irons out hand shake.
            d.raw = o.pr ? [q.x, q.y, pv] : [q.x, q.y];
            q = { x: last[0] + (q.x - last[0]) * d.follow, y: last[1] + (q.y - last[1]) * d.follow };
          }
          if (Math.hypot(q.x - last[0], q.y - last[1]) * s.view.zoom > 0.8) { o.points.push(o.pr ? [q.x, q.y, pv] : [q.x, q.y]); added = true; }
        }
        if (added) armSnap();
      } else {
        let w = p.x - d.start.x, h = p.y - d.start.y;
        if (snapOn(e)) { w = toGrid(p.x) - d.start.x; h = toGrid(p.y) - d.start.y; }
        if (e.shiftKey) {
          if (o.type === "line" || o.type === "arrow") {
            const len = Math.hypot(w, h), ang = Math.round(Math.atan2(h, w) / (Math.PI / 12)) * (Math.PI / 12);
            w = Math.cos(ang) * len; h = Math.sin(ang) * len;
          } else {
            const m = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m;
          }
        }
        if (o.type === "line" || o.type === "arrow") {
          const tg = bindTarget(p, o.from);
          s.bindHover = tg ? tg.id : null;
          const base = { ...o, x: d.start.x, y: d.start.y, w, h, to: tg ? tg.id : undefined };
          s.preview = base.from || base.to ? connect(base, new Map(s.objects.map((x) => [x.id, x]))) : base;
        } else s.preview = { ...o, w, h };
      }
      requestDraw();
    } else if (d.type === "move") {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * s.view.zoom < 3) return;
      d.moved = true;
      if (snapOn(e)) {
        d.box0 = d.box0 || unionBounds(d.objs.filter((o) => d.ids.has(o.id)));
        if (d.box0) [dx, dy] = snapMove(d.box0, dx, dy, d.ids);
      } else s.guides = null;
      s.objects = relink(d.objs.map((o) => {
        if (!d.ids.has(o.id)) return o;
        const m = translateObject(o, dx, dy);
        if (m.from && !d.ids.has(m.from)) delete m.from;
        if (m.to && !d.ids.has(m.to)) delete m.to;
        return m;
      }));
      requestDraw();
    } else if (d.type === "resize") {
      const { box, handle } = d;
      let x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h;
      let px = p.x - d.gx, py = p.y - d.gy;
      const MIN = 6;
      if (snapOn(e)) { px = toGrid(px); py = toGrid(py); }
      if (handle.includes("w")) x1 = Math.min(px, x2 - MIN);
      if (handle.includes("e")) x2 = Math.max(px, x1 + MIN);
      if (handle.includes("n")) y1 = Math.min(py, y2 - MIN);
      if (handle.includes("s")) y2 = Math.max(py, y1 + MIN);
      if ((e.shiftKey || d.lock) && handle.length === 2 && box.w && box.h) {
        const k = Math.max((x2 - x1) / box.w, (y2 - y1) / box.h);
        const nw = box.w * k, nh = box.h * k;
        if (handle.includes("w")) x1 = x2 - nw; else x2 = x1 + nw;
        if (handle.includes("n")) y1 = y2 - nh; else y2 = y1 + nh;
      }
      const nb = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      d.moved = true;
      s.objects = relink(d.start.map((o) => (d.ids.has(o.id) ? scaleObject(o, box, nb) : o)));
      requestDraw();
    } else if (d.type === "marquee") {
      s.marquee = { ...s.marquee, x2: p.x, y2: p.y };
      const m = s.marquee, r = { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) };
      const hit = s.objects.filter((o) => !o.locked && intersects(bounds(o), r)).map((o) => o.id);
      s.selection = [...new Set([...d.base, ...hit])];
      requestDraw();
    } else if (d.type === "erase") {
      eraseAt(p);
    } else if (d.type === "lasso") {
      const last = s.lasso[s.lasso.length - 1];
      if (Math.hypot(p.x - last[0], p.y - last[1]) * s.view.zoom > 3) { s.lasso.push([p.x, p.y]); requestDraw(); }
    }
  }

  function onPointerUp(e) {
    if (s.present) {
      const t = s.present.tap; s.present.tap = null;
      if (t && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 8) {
        const r = canvasRef.current.getBoundingClientRect();
        goSlide(s.present.i + (e.clientX - r.left < r.width * 0.25 ? -1 : 1));
      }
      return;
    }
    s.guides = null; s.bindHover = null;
    if (e.pointerId === s.penId) { s.penId = null; s.penUpAt = Date.now(); }
    s.ptype.delete(e.pointerId);
    if (!s.pointers.delete(e.pointerId)) return;
    const tap = s.linkTap; s.linkTap = null;
    if (tap) {
      const up = screenPos(e);
      if (Math.hypot(up.x - tap.x, up.y - tap.y) < 6) {
        if (tap.ro) openLink(tap.url);
        else { const o = s.objects.find((x) => x.id === tap.id); s.linkPop = { url: tap.url, id: tap.id, x: up.x, y: up.y, named: !!o && removeLink(o.text, tap.url) !== o.text }; }
        ui();
      }
    }
    const d = s.drag;
    if (!d) return;
    clearSnap();
    if (d.type === "pinch") { if (s.pointers.size < 2) s.drag = null; ui(); return; }
    s.drag = null;

    if (d.type === "draw") {
      const o = s.preview;
      s.preview = null;
      if (o) {
        if (o.type === "pen") {
          let raw = o.points;
          if (!o.hl && s.style.scratch !== false && isScribble(raw, s.view.zoom)) {
            const hit = scribbleTargets(s.objects, raw, (o.width || 3) * 2);
            if (hit.length) {
              const ids = new Set(hit.map((x) => x.id));
              commit(s.objects.filter((x) => !ids.has(x.id)));
              s.toast && s.toast(`Scribbled out ${hit.length} item${hit.length === 1 ? "" : "s"} – Ctrl+Z to undo`, "info");
              requestDraw(); ui();
              return;
            }
          }
          if (d.pretty) {
            const last = raw[raw.length - 1];
            if (d.raw && Math.hypot(d.raw[0] - last[0], d.raw[1] - last[1]) > 0) raw = [...raw, d.raw];
            raw = beautifyStroke(raw, 2 / s.view.zoom);
          }
          const pts = rdp(raw.map((q) => (q.length > 2 ? [round1(q[0]), round1(q[1]), Math.round(q[2] * 100) / 100] : [round1(q[0]), round1(q[1])])), (d.pretty ? 0.3 : 0.45) / s.view.zoom);
          let stroke = { ...o, points: pts };
          if (!o.hl && s.style.inkBold) stroke.bold = true;
          if (!o.hl && s.style.inkItalic) stroke = { ...slantStroke(stroke, 1), italic: true };
          commit([...s.objects, stroke]);
        } else if (o.type === "section") {
          if (Math.hypot(o.w, o.h) * s.view.zoom >= 20) {
            const sec = { ...o, ...norm(o), title: "Section", fill: o.fill || "#6366f1" };
            s.tool = "select"; s.selection = [sec.id];
            commit([sec, ...s.objects]);
          }
        } else if (Math.hypot(o.w, o.h) * s.view.zoom >= 5) {
          commit([...s.objects, ["line", "arrow"].includes(o.type) ? o : { ...o, ...norm(o) }]);
        }
      }
    } else if (d.type === "move" || d.type === "resize") {
      if (d.moved) {
        const before = d.type === "move" ? d.objs : d.start;
        s.undo.push(before); s.redo = []; s.lastCoalesce = null;
        notify();
      }
    } else if (d.type === "marquee") {
      s.marquee = null;
    } else if (d.type === "lasso") {
      const loop = s.lasso; s.lasso = null;
      if (loop.length > 2) s.selection = s.objects.filter((o) => !o.locked && insideLasso(o, loop)).map((o) => o.id);
      // Switch to Select so the picked strokes can be moved, resized or restyled right away.
      if (s.selection.length) s.tool = "select";
    } else if (d.type === "erase") {
      const ids = s.erasing; s.erasing = null;
      if (ids && ids.size) commit(s.objects.filter((o) => !ids.has(o.id)));
    }
    requestDraw(); ui();
  }

  function onDoubleClick(e) {
    if (s.readOnly || s.tool !== "select") return;
    const p = toWorld(screenPos(e)), o = hitTest(p.x, p.y);
    if (o && TEXTY.has(o.type)) startEdit(o);
    else if (!o) startEdit(null, { kind: "text", x: p.x, y: p.y });
  }

  /* ---------------------------------------------------------- global events */
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      const prevW = s.size.w, widthChanged = Math.abs(r.width - prevW) > 0.5;
      s.dpr = dpr; s.size = { w: r.width, h: r.height };
      if (s.present) requestAnimationFrame(() => s.present && goSlide(s.present.i, false)); // keep the slide filling the screen
      else if (widthChanged && r.width > 1) fitToScreen(prevW);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
      draw(); ui();
    });
    ro.observe(wrap);
    const beforeUnload = (e) => { if (s.lecture) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);

    const onWheel = (e) => {
      e.preventDefault();
      const pos = screenPos(e);
      const dx = e.deltaX || 0, dy = e.deltaY || 0;
      if (e.ctrlKey || e.metaKey) zoomAt(pos.x, pos.y, Math.exp(-clamp(dy, -60, 60) * 0.0075));
      else {
        const horiz = e.shiftKey && !dx;
        s.view = { ...s.view, x: s.view.x - (horiz ? dy : dx), y: s.view.y - (horiz ? 0 : dy) };
        viewChanged();
      }
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    // iPad/iPhone: a pen held down (or a long press) would otherwise start the browser's own text
    // selection, "Copy" bubble, magnifier, double-tap zoom or page pinch. The canvas handles all of it itself.
    const noNative = (e) => { if (e.cancelable) e.preventDefault(); };
    canvas.addEventListener("touchstart", noNative, { passive: false });
    canvas.addEventListener("touchmove", noNative, { passive: false });
    canvas.addEventListener("gesturestart", noNative);
    canvas.addEventListener("contextmenu", noNative);
    canvas.addEventListener("selectstart", noNative);

    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey;
      // Read mode: only scrolling and zoom keys work.
      if (s.present) {
        const P = s.present;
        if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(k)) { e.preventDefault(); goSlide(P.i + 1); }
        else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) { e.preventDefault(); goSlide(P.i - 1); }
        else if (k === "Home") goSlide(0);
        else if (k === "End") goSlide(P.slides.length - 1);
        else if (k === "Escape") onExitPresent && onExitPresent();
        showControls();
        return;
      }
      if (s.readOnly && mod && k.toLowerCase() === "a") { e.preventDefault(); return; } // no browser select-all either
      if (s.readOnly && !(k === " " || k === "!" || k === "+" || k === "=" || k === "-" || (mod && (k === "0" || k.toLowerCase() === "c")))) return;
      if (k === " ") { e.preventDefault(); if (!s.space) { s.space = true; ui(); } return; }
      if (mod) {
        const lk = k.toLowerCase();
        if (lk === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
        else if (lk === "y") { e.preventDefault(); redo(); }
        else if (lk === "a") { e.preventDefault(); selectAll(); }
        else if (lk === "d") { e.preventDefault(); duplicateSelection(); }
        else if (k === "0") { e.preventDefault(); resetView(); }
        return;
      }
      if (k === "Delete" || k === "Backspace") { if (s.selection.length) { e.preventDefault(); deleteSelection(); } return; }
      if (k === "Escape") { s.selection = []; if (s.tool !== "select") setTool("select"); requestDraw(); ui(); return; }
      if (k.startsWith("Arrow") && s.selection.length) {
        e.preventDefault();
        const n = e.shiftKey ? 10 : 1;
        nudge(k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0, k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0);
        return;
      }
      if (k === "[") return arrange(false);
      if (k === "]") return arrange(true);
      if (k === "+" || k === "=") return zoomCenter(1.2);
      if (k === "-" || k === "_") return zoomCenter(1 / 1.2);
      if (k === "!") return fitView();
      if (k === "?") { s.showHelp = !s.showHelp; ui(); return; }
      if (k.toLowerCase() === "i") { fileRef.current && fileRef.current.click(); return; }
      const t = TOOL_KEYS[k.toLowerCase()];
      if (t) setTool(t);
    };
    const onKeyUp = (e) => { if (e.key === " " && s.space) { s.space = false; ui(); } };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const onCopy = (e) => {
      if (isTyping(e.target) || !s.selection.length) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", "NBCLIP:" + JSON.stringify(selectedObjs()));
    };
    const onCut = (e) => { if (s.readOnly || isTyping(e.target) || !s.selection.length) return; onCopy(e); deleteSelection(); };
    const onPaste = (e) => {
      if (isTyping(e.target)) return;
      if (s.readOnly) { blocked(); return; }
      const cd = e.clipboardData;
      const img = [...(cd.files || [])].find((f) => f.type.startsWith("image/"));
      if (img) { e.preventDefault(); insertImage(img); return; }
      const text = cd.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      if (text.startsWith("NBCLIP:")) {
        try {
          const items = JSON.parse(text.slice(7));
          const copies = cloneObjs(items, 24, 24);
          s.tool = "select"; s.selection = copies.map((o) => o.id);
          commit([...s.objects, ...copies]);
        } catch { /* ignore */ }
      } else {
        const url = text.trim(), isUrl = URL_ONLY.test(url);
        const targets = isUrl ? selectedObjs().filter((o) => TEXTY.has(o.type) && o.text && !linksIn(o).length) : [];
        if (targets.length) {
          s.linkBox = { ids: targets.map((o) => o.id), range: null };
          applyLink(url);
          return;
        }
        const p = viewCenterWorld(), st = s.style;
        const o = { id: newId(), type: "text", x: p.x - 80, y: p.y - 20, text: isUrl ? makeLink(linkLabel(url), url) : text.slice(0, 2000), size: st.fontSize, stroke: st.stroke, opacity: 1, effect: st.effect, fx2: st.fx2, hlBg: st.hlBg, ...textFields(st) };
        s.selection = [o.id]; s.tool = "select";
        commit([...s.objects, o]);
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onFontLoaded);

    return () => {
      ro.disconnect();
      window.removeEventListener("beforeunload", beforeUnload);
      if (s.lecture) { // leaving without stopping: release the microphone (App stops & saves before switching pages)
        clearInterval(s.lecture.timer);
        if (s.lecture.sr) { s.lecture.sr.onend = null; try { s.lecture.sr.stop(); } catch { /* ignore */ } }
        try { s.lecture.mr.stop(); } catch { /* ignore */ }
        s.lecture.stream.getTracks().forEach((t) => t.stop());
        s.lecture = null;
      }
      canvas.removeEventListener("wheel", onWheel);
      for (const t of ["touchstart", "touchmove", "gesturestart", "contextmenu", "selectstart"]) canvas.removeEventListener(t, noNative);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
      cancelAnimationFrame(s.raf);
      clearTimeout(s.snapT);
      if (s.rec) { try { s.rec.abort(); } catch { /* ignore */ } s.rec = null; }
    };
  }, []);

  useEffect(() => { requestDraw(); }, [theme]);
  // Live page: apply what others change; keep undo history consistent with their edits.
  useEffect(() => {
    if (!room) return;
    s.room = room; s.synced = s.objects; s.people = [];
    const unObjs = room.subscribe((changes) => {
      s.objects = relink(applyChanges(s.objects, changes));
      s.synced = applyChanges(s.synced, changes);
      s.undo = s.undo.slice(-60).map((st) => applyChanges(st, changes)); // undo only takes back *my* changes
      s.redo = s.redo.map((st) => applyChanges(st, changes));
      pruneSelection(); requestDraw(); ui();
    });
    const unPeople = room.onPeople((list) => { s.people = list; ui(); });
    return () => { unObjs(); unPeople(); s.room = null; s.synced = null; };
  }, [room]);
  useEffect(() => {
    if (present) {
      const slides = computeSlides();
      if (!slides.length) { s.toast && s.toast("Nothing to present yet – add Sections (tool N) to make slides.", "info"); onExitPresent && onExitPresent(); return; }
      s.present = { i: 0, slides, view0: { ...s.view }, idle: false };
      requestAnimationFrame(() => goSlide(0, false));
      showControls();
    } else if (s.present) {
      cancelAnimationFrame(s.present.anim); clearTimeout(s.present.idleT);
      s.view = s.present.view0; s.present = null;
      requestDraw(); ui();
    }
  }, [present]);
  useEffect(() => {
    if (!readOnly) return;
    commitEdit(); clearSnap();
    s.selection = []; s.preview = null; s.marquee = null; s.lasso = null; s.drag = null;
    requestDraw(); ui();
  }, [readOnly]);

  /* ---------------------------------------------------------------- render */
  const sel = selectedObjs();
  const first = sel[0];
  let values = first
    ? {
        stroke: first.stroke, fill: first.fill ?? null,
        width: first.hl ? unHl(first.width) : first.width ?? s.style.width,
        dash: first.dash || "solid", opacity: first.opacity ?? 1, fontSize: first.size ?? s.style.fontSize,
        beautify: first.ink ? "ink" : "smooth", inkBold: !!first.bold, inkItalic: !!first.italic,
        ...(TEXTY.has(first.type)
          ? { ...textFields(first), effect: first.effect || "none", fx2: first.fx2 || "#ec4899", hlBg: first.hlBg || null }
          : { ...textFields(s.style), effect: s.style.effect, fx2: s.style.fx2, hlBg: s.style.hlBg }),
      }
    : s.style;
  const types = new Set(sel.length ? sel.map((o) => o.type) : TOOL_TYPE[s.tool] ? [TOOL_TYPE[s.tool]] : []);
  const arr = [...types];
  const caps = {
    any: arr.length > 0,
    stroke: arr.some((t) => t !== "image" && t !== "section"),
    strokeLabel: arr.every((t) => TEXTY.has(t)) ? "Text color" : "Stroke",
    fill: arr.some((t) => FILLABLE.has(t)),
    fillLabel: arr.every((t) => t === "sticky") ? "Note color" : arr.every((t) => t === "section") ? "Section color" : "Fill",
    fillNoNone: arr.every((t) => t === "sticky"),
    width: arr.some((t) => STROKED.has(t)),
    dash: arr.some((t) => DASHABLE.has(t)),
    opacity: arr.length > 0,
    fontSize: arr.some((t) => TEXTY.has(t)),
    text: arr.some((t) => TEXTY.has(t)),
    textOnly: arr.includes("text"),
    section: sel.length === 1 && first.type === "section",
    beautify: sel.length ? sel.every((o) => o.type === "pen" && !o.hl) : s.tool === "pen",
    strokeNone: arr.length > 0 && arr.every((t) => CLOSED.has(t)),
  };
  if (!first && caps.strokeNone && s.style.noOutline) values = { ...values, stroke: null };

  const ed = s.editing;
  const z = s.view.zoom;
  const th = rtheme();
  let editor = null;
  if (ed) {
    const left = ed.x * z + s.view.x, top = ed.y * z + s.view.y;
    const common = {
      fontFamily: fontFamily(ed.font), fontWeight: ed.bold ? 700 : 400, fontStyle: ed.italic ? "italic" : "normal", textAlign: ed.align || "left",
      textDecoration: [ed.underline && "underline", ed.strike && "line-through"].filter(Boolean).join(" ") || "none",
    };
    if (ed.kind === "sticky") {
      editor = {
        ...common, left, top, width: ed.w * z, height: ed.h * z, padding: STICKY_PAD * z, fontSize: ed.size * z,
        background: ed.fill || "#fef08a", color: ed.stroke === "auto" ? "#1e293b" : ed.stroke, borderRadius: 8 * z,
      };
    } else {
      const lines = ed.value.split("\n"), spec = fontSpec(ed);
      const w = Math.max(60, Math.max(...lines.map((l) => measureWidth(l || " ", spec))) * z + 28);
      editor = { ...common, left, top, width: w, height: lines.length * ed.size * LINE_H * z + 2, fontSize: ed.size * z, color: resolveColor(ed.stroke, th) };
    }
  }

  const dragging = s.drag && s.drag.type === "pan";
  const pill = s.listening ? "listen" : s.aiBusy ? "ai" : null;

  return (
    <div
      ref={wrapRef}
      className={`editor tool-${s.tool} ${s.space || s.tool === "hand" ? "pannable" : ""} ${dragging ? "grabbing" : ""} ${toolbarSlot ? "nav-toolbar" : ""} ${s.readOnly ? "reading pannable" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (blocked()) return;
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
        if (f) insertImage(f, toWorld(screenPos(e)));
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* The toolbar lives in the top navbar when there is one (not in focus mode). */}
      {(() => {
        const qt = quickTarget();
        const qv = first ? (qt === "fill" ? first.fill : first.stroke) : qt === "fill" ? s.style.fill : s.style.stroke;
        const bar = <Toolbar tool={s.tool} onTool={setTool} onImage={() => fileRef.current && fileRef.current.click()} onAction={clearPage} inNav={!!toolbarSlot}
          quick={{ target: qt === "fill" ? "fill" : "ink", value: qv }} onQuickColor={quickColor} />;
        if (s.readOnly) return null;
        return toolbarSlot ? createPortal(bar, toolbarSlot) : bar;
      })()}
      {!s.readOnly && <PropsPanel
        caps={caps} values={values} onChange={applyStyle} hasSelection={sel.length > 0}
        links={[...new Set(sel.flatMap(linksIn))].slice(0, 5)} onOpenLink={openLink}
        namedLinks={new Set(sel.flatMap((o) => linksIn(o).filter((u) => removeLink(o.text, u) !== o.text)))} onUnlink={unlink} onAddLink={addLink}
        onPlayFrom={sel.length === 1 && first.rec && s.recs.some((r) => r.id === first.rec.id) ? () => playFrom(first) : null}
        title={sel.length ? (sel.length === 1 ? "Properties" : `${sel.length} selected`) : (TOOLS.find((t) => t.id === s.tool)?.label || "Properties").split(" (")[0]}
        onFront={() => arrange(true)} onBack={() => arrange(false)} onDuplicate={duplicateSelection} onDelete={deleteSelection}
        sectionTitle={caps.section ? first.title || "" : null} onSectionTitle={setSectionTitle}
        onSectionImage={() => secFileRef.current && secFileRef.current.click()}
      />}

      {pill && (
        <button className={`status-pill glass ${pill}`} onClick={() => pill === "listen" && s.rec && s.rec.stop()}>
          {pill === "listen"
            ? (<><Mic size={15} /> <span className="rec-dot" /> Listening… tap to stop {s.recInterim && <em>“{s.recInterim.slice(-60)}”</em>}</>)
            : (<><Sparkles size={15} className="spinning" /> AI is writing…</>)}
        </button>
      )}

      {ed && (
        <textarea
          key={ed.key}
          className={`note-input ${ed.kind}`}
          style={editor}
          value={ed.value}
          autoFocus
          spellCheck={false}
          placeholder={ed.kind === "sticky" ? "Write a note…" : "Type…"}
          ref={taRef}
          onPaste={onEditPaste}
          onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
          onChange={(e) => { s.editing.value = e.target.value; ui(); }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) { e.preventDefault(); commitEdit(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); addLink(); }
            e.stopPropagation();
          }}
        />
      )}

      {s.linkPop && (
        <div className="link-pop glass" style={{ left: Math.max(8, s.linkPop.x - 20), top: s.linkPop.y + 14 }} onPointerDown={(e) => e.stopPropagation()}>
          <a href={hrefOf(s.linkPop.url)} target="_blank" rel="noopener noreferrer" onClick={() => { s.linkPop = null; ui(); }}>
            <ExternalLink size={14} /> <span>Open {linkLabel(s.linkPop.url)}</span>
          </a>
          {s.linkPop.named && !s.readOnly && <button className="icon-btn sm" onClick={() => unlink(s.linkPop.url)} title="Remove link (keep the words)"><Unlink size={14} /></button>}
          <button className="icon-btn sm" onClick={() => { s.linkPop = null; ui(); }} title="Close"><X size={14} /></button>
        </div>
      )}
      {s.linkBox && (
        <form className="link-box glass" onSubmit={(e) => { e.preventDefault(); applyLink(e.currentTarget.url.value); }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="link-box-head"><Link2 size={15} /> <span>Link {s.linkBox.label ? <>for <strong>“{s.linkBox.label}”</strong></> : ""}</span></div>
          <input name="url" className="field sm" autoFocus placeholder="Paste or type an address, e.g. youtube.com"
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { s.linkBox = null; ui(); } }} />
          <div className="link-box-actions">
            <button type="button" className="btn ghost sm" onClick={() => { s.linkBox = null; ui(); }}>Cancel</button>
            <button type="submit" className="btn primary sm">Add link</button>
          </div>
        </form>
      )}

      {!s.present && <LecturePanel recording={s.lecture} recs={s.recs} seek={s.seek} onStop={() => stopLecture()} onDelete={deleteRecording}
        onTime={(id, ms) => { s.playback = { id, ms }; requestDraw(); }} onClose={() => { s.playback = null; requestDraw(); }} />}

      {!s.readOnly && <div className="histbar glass">
        <button className="icon-btn" onClick={undo} disabled={!s.undo.length} title="Undo (Ctrl+Z)"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!s.redo.length} title="Redo (Ctrl+Y)"><Redo2 size={17} /></button>
        <span className="tb-sep" />
        {s.lecture ? (
          <button className="icon-btn rec-btn on" onClick={() => stopLecture()} title="Stop recording"><StopIcon size={15} /></button>
        ) : (
          <Menu up items={[
            { type: "label", title: "Record lecture", sub: "Your notes stay linked to the audio" },
            { label: "Record (English captions)", icon: Mic, onClick: () => startLecture("en-US") },
            { label: "Record (বাংলা captions)", icon: Mic, onClick: () => startLecture("bn-BD") },
          ]} trigger={<button className="icon-btn rec-btn" title="Record lecture"><Mic size={17} /></button>} />
        )}
        <PageSettings bg={s.bg} paper={s.paper} gap={s.gap} sheets={s.sheets || 0} onChange={setPage} onCover={() => onOpenCover && onOpenCover()} />
      </div>}

      {room && !s.present && (
        <div className="live-pill glass" title={(s.people || []).map((p) => p.name).join(", ")}>
          <span className="live-dot" /> Live
          <span className="live-people">
            {(s.people || []).slice(0, 4).map((p) => (
              <span key={p.uid} className="live-face" title={p.name}>{p.photo ? <img src={p.photo} alt="" referrerPolicy="no-referrer" /> : (p.name || "?")[0].toUpperCase()}</span>
            ))}
          </span>
          {(s.people || []).length > 1 ? `${s.people.length} here` : "just you"}
        </div>
      )}
      {s.outline && !s.present && (
        <OutlinePanel items={outlineItems()} onGo={goOutline} onAddMark={addMark} readOnly={s.readOnly}
          onDeleteMark={(id) => { s.marks = s.marks.filter((m) => m.id !== id); notify(); ui(); }} onClose={() => { s.outline = false; ui(); }} />
      )}
      {s.present && (
        <div className={`present-bar glass ${s.present.idle ? "idle" : ""}`} onPointerMove={showControls}>
          <button className="icon-btn" onClick={() => goSlide(s.present.i - 1)} disabled={s.present.i === 0} title="Previous (←)"><ChevronLeft size={18} /></button>
          <span className="present-count">{s.present.i + 1} / {s.present.slides.length}</span>
          <button className="icon-btn" onClick={() => goSlide(s.present.i + 1)} disabled={s.present.i >= s.present.slides.length - 1} title="Next (→ or Space)"><ChevronRight size={18} /></button>
          <span className="tb-sep" />
          <button className="icon-btn" onClick={() => onExitPresent && onExitPresent()} title="Stop presenting (Esc)"><X size={17} /></button>
        </div>
      )}
      {!s.present && <div className="zoombar glass">
        <button className={`icon-btn ${s.outline ? "active" : ""}`} title="Outline & bookmarks" onClick={() => { s.outline = !s.outline; ui(); }}><ListTree size={16} /></button>
        <button className={`icon-btn ${s.snap ? "active" : ""}`} title={`Snap to grid & guides: ${s.snap ? "on" : "off"} (hold Alt to move freely)`}
          onClick={() => { s.snap = !s.snap; try { localStorage.setItem("nb-snap", s.snap ? "1" : "0"); } catch { /* ignore */ } ui(); }}><Magnet size={16} /></button>
        <span className="tb-sep" />
        <button className="icon-btn hide-phone" onClick={() => zoomCenter(1 / 1.2)} title="Zoom out (-)"><ZoomOut size={17} /></button>
        <button className="zoom-pct" onClick={resetView} title="Reset zoom (Ctrl+0)">{Math.round(z * 100)}%</button>
        <button className="icon-btn hide-phone" onClick={() => zoomCenter(1.2)} title="Zoom in (+)"><ZoomIn size={17} /></button>
        <button className="icon-btn" onClick={fitView} title="Zoom to fit (Shift+1)"><Maximize size={16} /></button>
        <span className="tb-sep hide-phone" />
        <button className="icon-btn hide-phone" onClick={() => { s.showHelp = true; ui(); }} title="Keyboard shortcuts (?)"><Keyboard size={17} /></button>
      </div>}

      {s.showHelp && (
        <div className="backdrop" onMouseDown={() => { s.showHelp = false; ui(); }}>
          <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-top"><h3>Keyboard shortcuts</h3>
              <button className="icon-btn" onClick={() => { s.showHelp = false; ui(); }}><X size={16} /></button></div>
            <div className="shortcuts">
              {SHORTCUTS.map(([k, v]) => (<div key={k}><kbd>{k}</kbd><span>{v}</span></div>))}
            </div>
          </div>
        </div>
      )}

      <input ref={secFileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) addImageToSection(f); }} />
      <input ref={fileRef} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) insertImage(f); }} />
    </div>
  );
});

export default Editor;

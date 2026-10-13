import React, { forwardRef, useEffect, useImperativeHandle, useReducer, useRef } from "react";
import { Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Keyboard, X, Mic, Sparkles } from "lucide-react";
import Toolbar from "./Toolbar.jsx";
import PropsPanel from "./PropsPanel.jsx";
import PageSettings from "./PageSettings.jsx";
import { DEFAULT_STYLE, resolveColor, fontFamily, isDarkColor } from "../lib/palette.js";
import {
  bounds, unionBounds, intersects, inflate, hitObject, translateObject, scaleObject, rdp, norm, recognizeShape,
  wrapText, measureWidth, resetGeometryCache, fontSpec, LINE_H, STICKY_PAD,
} from "../lib/geometry.js";
import { drawBackground, drawObject, A4, sheetBox } from "../lib/render.js";
import { fileToDataUrl, loadImage, scaleImage } from "../lib/imaging.js";
import { runTextAI, TEXT_ACTIONS } from "../lib/ai.js";

const MIN_ZOOM = 0.1, MAX_ZOOM = 8;
const FILLABLE = new Set(["rect", "ellipse", "triangle", "diamond", "sticky", "section"]);
const STROKED = new Set(["pen", "line", "arrow", "rect", "ellipse", "triangle", "diamond"]);
const DASHABLE = new Set(["line", "arrow", "rect", "ellipse", "triangle", "diamond"]);
const TEXTY = new Set(["text", "sticky"]);
const TEXT_KEYS = new Set(["font", "bold", "italic", "underline", "strike", "align"]);
const TEXT_ONLY_KEYS = new Set(["effect", "fx2", "hlBg"]);
const TOOL_KEYS = { v: "select", h: "hand", p: "pen", m: "marker", l: "line", a: "arrow", r: "rect", o: "ellipse", g: "triangle", d: "diamond", t: "text", s: "sticky", e: "eraser", n: "section" };
const TOOL_TYPE = { pen: "pen", marker: "pen", line: "line", arrow: "arrow", rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", text: "text", sticky: "sticky", section: "section" };
const RESIZE_CURSOR = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
const SHORTCUTS = [
  ["V H P M", "Select, Pan, Pen, Highlighter"], ["L A R O G D", "Line, Arrow, Rect, Circle, Triangle, Diamond"],
  ["T S N E I", "Text, Sticky note, Section, Eraser, Image"], ["Space + drag", "Pan the canvas"], ["Ctrl + wheel / pinch", "Zoom"],
  ["Hold pen still", "Snap stroke to a perfect shape"], ["Ctrl + K", "Command palette"], ["F", "Focus mode"], ["Shift + F", "Full screen"],
  ["Ctrl + Z / Y", "Undo / Redo"], ["Ctrl + C / X / V", "Copy / Cut / Paste (also images)"], ["Ctrl + D", "Duplicate"],
  ["Ctrl + A", "Select all"], ["Delete", "Delete selection"], ["Arrow keys", "Nudge (Shift = faster)"],
  ["[ and ]", "Send to back / bring to front"], ["Shift + 1", "Zoom to fit"], ["Ctrl + 0", "Reset zoom"], ["Double-click", "Edit text / add text"],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round1 = (n) => Math.round(n * 10) / 10;
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

const Editor = forwardRef(function Editor({ initial, theme, onChange, onToast, onOpenCover }, ref) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);
  const secFileRef = useRef(null);
  const [, tick] = useReducer((x) => x + 1, 0);
  const ui = () => tick();

  const holder = useRef(null);
  if (!holder.current) {
    holder.current = {
      objects: initial.objects || [],
      view: initial.view || { x: 0, y: 0, zoom: 1 },
      bg: initial.bg || "dots", paper: initial.paper || null, gap: initial.gap || null, sheets: initial.sheets || 0,
      tool: "pen",
      style: { ...DEFAULT_STYLE },
      selection: [], preview: null, drag: null, marquee: null, erasing: null, editing: null, editKey: 0,
      undo: [], redo: [], pointers: new Map(), space: false, showHelp: false,
      lastCoalesce: null, lastCoalesceAt: 0, size: { w: 1, h: 1 }, dpr: 1, raf: 0, uiDirty: false,
      snapT: 0, rec: null, listening: false, recText: "", recInterim: "", aiBusy: false,
    };
  }
  const s = holder.current;
  s.theme = theme; s.onChange = onChange; s.toast = onToast;
  const rtheme = () => (s.paper ? (isDarkColor(s.paper) ? "dark" : "light") : s.theme);

  /* ---------------------------------------------------------------- core */
  function notify() { s.onChange && s.onChange({ objects: s.objects, view: s.view, bg: s.bg, paper: s.paper, gap: s.gap, sheets: s.sheets }); }
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
    s.redo = []; s.objects = next;
    notify(); requestDraw(); ui();
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
  function fitSheets() {
    const z = clamp((s.size.w - 48) / A4.w, MIN_ZOOM, 1.5);
    s.view = { zoom: z, x: (s.size.w - A4.w * z) / 2, y: 24 };
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
    const box = s.sheets ? sheetBox(s.sheets) : unionBounds(s.objects);
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
    for (let i = s.objects.length - 1; i >= 0; i--) if (hitObject(s.objects[i], px, py, tol)) return s.objects[i];
    return null;
  }

  /* ------------------------------------------------------------- drawing */
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { w, h } = s.size, dpr = s.dpr, { x: vx, y: vy, zoom: z } = s.view, theme = rtheme();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, w, h, s.view, s.bg, theme, s.paper, s.gap, s.sheets);

    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * vx, dpr * vy);
    const vis = { x: -vx / z, y: -vy / z, w: w / z, h: h / z };
    const editingId = s.editing && s.editing.id;
    const opts = { onImage: requestDraw, onFont: onFontLoaded, pxScale: dpr * z };
    for (const o of s.objects) {
      if (o.id === editingId) continue;
      if (!intersects(inflate(bounds(o), (o.width || 0) + 12 + (o.size || 0) * 0.3), vis)) continue;
      drawObject(ctx, o, theme, { ...opts, alpha: s.erasing && s.erasing.has(o.id) ? 0.2 : 1 });
    }
    if (s.preview) drawObject(ctx, s.preview, theme, opts);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (s.marquee) {
      const m = s.marquee;
      const x = Math.min(m.x1, m.x2) * z + vx, y = Math.min(m.y1, m.y2) * z + vy;
      const mw = Math.abs(m.x2 - m.x1) * z, mh = Math.abs(m.y2 - m.y1) * z;
      ctx.fillStyle = "rgba(99,102,241,.10)"; ctx.strokeStyle = "rgba(99,102,241,.85)"; ctx.lineWidth = 1;
      ctx.fillRect(x, y, mw, mh); ctx.strokeRect(x + 0.5, y + 0.5, mw, mh);
    }
    const box = s.tool === "select" || s.tool === "hand" ? selBox() : null;
    if (box) {
      const pad = 6;
      const x = box.x * z + vx - pad, y = box.y * z + vy - pad, bw = box.w * z + pad * 2, bh = box.h * z + pad * 2;
      ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, bw, bh);
      if (s.tool === "select" && !(s.drag && s.drag.type === "move")) {
        for (const hd of handlesFor(box)) {
          ctx.fillStyle = "#fff"; ctx.strokeStyle = "#6366f1"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.rect(hd.x - 4.5, hd.y - 4.5, 9, 9); ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  /* ---------------------------------------------------- text / sticky edit */
  function fitSticky(o) {
    const lines = wrapText(o.text, o.w - 2 * STICKY_PAD, fontSpec(o));
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
    const text = ed.value.replace(/\s+$/, "");
    if (ed.id) {
      const o = s.objects.find((x) => x.id === ed.id);
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
      commit([...s.objects, o]);
    }
    requestDraw(); ui();
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
  function selectAll() { s.tool = "select"; s.selection = s.objects.map((o) => o.id); requestDraw(); ui(); }
  function nudge(dx, dy) {
    if (!s.selection.length) return;
    const ids = new Set(s.selection);
    commit(s.objects.map((o) => (ids.has(o.id) ? translateObject(o, dx, dy) : o)), { coalesce: "nudge" });
  }

  function applyStyle(patch) {
    s.style = { ...s.style, ...patch };
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
          else if (k === "stroke") { if (o.type !== "image") n.stroke = v; }
          else n[k] = v;
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
  useImperativeHandle(ref, () => ({
    exportPNG, fit: fitView, aiText, dictate,
    setTool: (t) => setTool(t),
    toggleHelp: () => { s.showHelp = !s.showHelp; ui(); },
    insertImageDataUrl: (src, w, h) => placeImage(src, w, h),
    hasTextSelection: () => selectedObjs().some((o) => TEXTY.has(o.type)),
    getData: () => ({ objects: s.objects, view: s.view, bg: s.bg, paper: s.paper, gap: s.gap, sheets: s.sheets }),
  }));

  /* ------------------------------------------------------------- pointers */
  function clearSnap() { clearTimeout(s.snapT); s.snapT = 0; }
  function armSnap() {
    clearSnap();
    const o = s.preview;
    if (!o || o.type !== "pen" || o.hl || o.points.length < 8) return;
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
    commitEdit();
    const canvas = canvasRef.current;
    canvas.setPointerCapture(e.pointerId);
    const pos = screenPos(e);
    s.pointers.set(e.pointerId, pos);

    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      clearSnap();
      s.preview = null; s.marquee = null;
      s.drag = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: { ...s.view } };
      requestDraw(); ui();
      return;
    }
    if (s.pointers.size > 2) return;

    if (e.button === 1 || s.space || s.tool === "hand") {
      s.drag = { type: "pan", start: pos, view0: { ...s.view } };
      ui();
      return;
    }
    if (e.button !== 0) return;

    const p = toWorld(pos), t = s.tool, st = s.style;

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
      s.preview = {
        id: newId(), type: "pen", points: [[p.x, p.y]], stroke: st.stroke,
        width: hl ? hlW(st.width) : st.width, opacity: st.opacity, dash: "solid", ...(hl ? { hl: true } : {}),
      };
      s.drag = { type: "draw" };
    } else {
      const o = { id: newId(), type: t, x: p.x, y: p.y, w: 0, h: 0, stroke: st.stroke, width: st.width, dash: st.dash, opacity: st.opacity, fill: t === "line" || t === "arrow" ? null : t === "section" ? st.fill || "#6366f1" : st.fill };
      s.preview = o;
      s.drag = { type: "draw", start: p };
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
    if (!c || s.tool !== "select") return;
    const hh = hitHandle(pos);
    if (hh) { c.style.cursor = RESIZE_CURSOR[hh]; return; }
    const p = toWorld(pos);
    c.style.cursor = hitTest(p.x, p.y) ? "move" : "default";
  }

  function onPointerMove(e) {
    const pos = screenPos(e);
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, pos);
    const d = s.drag;
    if (!d) { updateHoverCursor(pos); return; }

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
          const q = toWorld({ x: ev.clientX - r.left, y: ev.clientY - r.top });
          const last = o.points[o.points.length - 1];
          if (Math.hypot(q.x - last[0], q.y - last[1]) * s.view.zoom > 0.8) { o.points.push([q.x, q.y]); added = true; }
        }
        if (added) armSnap();
      } else {
        let w = p.x - d.start.x, h = p.y - d.start.y;
        if (e.shiftKey) {
          if (o.type === "line" || o.type === "arrow") {
            const len = Math.hypot(w, h), ang = Math.round(Math.atan2(h, w) / (Math.PI / 12)) * (Math.PI / 12);
            w = Math.cos(ang) * len; h = Math.sin(ang) * len;
          } else {
            const m = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m;
          }
        }
        s.preview = { ...o, w, h };
      }
      requestDraw();
    } else if (d.type === "move") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * s.view.zoom < 3) return;
      d.moved = true;
      s.objects = d.objs.map((o) => (d.ids.has(o.id) ? translateObject(o, dx, dy) : o));
      requestDraw();
    } else if (d.type === "resize") {
      const { box, handle } = d;
      let x1 = box.x, y1 = box.y, x2 = box.x + box.w, y2 = box.y + box.h;
      const px = p.x - d.gx, py = p.y - d.gy, MIN = 6;
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
      s.objects = d.start.map((o) => (d.ids.has(o.id) ? scaleObject(o, box, nb) : o));
      requestDraw();
    } else if (d.type === "marquee") {
      s.marquee = { ...s.marquee, x2: p.x, y2: p.y };
      const m = s.marquee, r = { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) };
      const hit = s.objects.filter((o) => intersects(bounds(o), r)).map((o) => o.id);
      s.selection = [...new Set([...d.base, ...hit])];
      requestDraw();
    } else if (d.type === "erase") {
      eraseAt(p);
    }
  }

  function onPointerUp(e) {
    s.pointers.delete(e.pointerId);
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
          const pts = rdp(o.points.map((q) => [round1(q[0]), round1(q[1])]), 0.45 / s.view.zoom);
          commit([...s.objects, { ...o, points: pts }]);
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
    } else if (d.type === "erase") {
      const ids = s.erasing; s.erasing = null;
      if (ids && ids.size) commit(s.objects.filter((o) => !ids.has(o.id)));
    }
    requestDraw(); ui();
  }

  function onDoubleClick(e) {
    if (s.tool !== "select") return;
    const p = toWorld(screenPos(e)), o = hitTest(p.x, p.y);
    if (o && TEXTY.has(o.type)) startEdit(o);
    else if (!o) startEdit(null, { kind: "text", x: p.x, y: p.y });
  }

  /* ---------------------------------------------------------- global events */
  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      s.dpr = dpr; s.size = { w: r.width, h: r.height };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
      draw(); ui();
    });
    ro.observe(wrap);

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

    const onKeyDown = (e) => {
      if (isTyping(e.target)) return;
      const k = e.key, mod = e.ctrlKey || e.metaKey;
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
    const onCut = (e) => { if (isTyping(e.target) || !s.selection.length) return; onCopy(e); deleteSelection(); };
    const onPaste = (e) => {
      if (isTyping(e.target)) return;
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
        const p = viewCenterWorld(), st = s.style;
        const o = { id: newId(), type: "text", x: p.x - 80, y: p.y - 20, text: text.slice(0, 2000), size: st.fontSize, stroke: st.stroke, opacity: 1, effect: st.effect, fx2: st.fx2, hlBg: st.hlBg, ...textFields(st) };
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
      canvas.removeEventListener("wheel", onWheel);
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

  /* ---------------------------------------------------------------- render */
  const sel = selectedObjs();
  const first = sel[0];
  const values = first
    ? {
        stroke: first.stroke, fill: first.fill ?? null,
        width: first.hl ? unHl(first.width) : first.width ?? s.style.width,
        dash: first.dash || "solid", opacity: first.opacity ?? 1, fontSize: first.size ?? s.style.fontSize,
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
  };

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
      className={`editor tool-${s.tool} ${s.space || s.tool === "hand" ? "pannable" : ""} ${dragging ? "grabbing" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
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

      <Toolbar tool={s.tool} onTool={setTool} onImage={() => fileRef.current && fileRef.current.click()} />
      <PropsPanel
        caps={caps} values={values} onChange={applyStyle} hasSelection={sel.length > 0}
        onFront={() => arrange(true)} onBack={() => arrange(false)} onDuplicate={duplicateSelection} onDelete={deleteSelection}
        sectionTitle={caps.section ? first.title || "" : null} onSectionTitle={setSectionTitle}
        onSectionImage={() => secFileRef.current && secFileRef.current.click()}
      />

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
          onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
          onChange={(e) => { s.editing.value = e.target.value; ui(); }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) { e.preventDefault(); commitEdit(); }
            e.stopPropagation();
          }}
        />
      )}

      <div className="histbar glass">
        <button className="icon-btn" onClick={undo} disabled={!s.undo.length} title="Undo (Ctrl+Z)"><Undo2 size={17} /></button>
        <button className="icon-btn" onClick={redo} disabled={!s.redo.length} title="Redo (Ctrl+Y)"><Redo2 size={17} /></button>
        <span className="tb-sep" />
        <PageSettings bg={s.bg} paper={s.paper} gap={s.gap} sheets={s.sheets || 0} onChange={setPage} onCover={() => onOpenCover && onOpenCover()} />
      </div>

      <div className="zoombar glass">
        <button className="icon-btn" onClick={() => zoomCenter(1 / 1.2)} title="Zoom out (-)"><ZoomOut size={17} /></button>
        <button className="zoom-pct" onClick={resetView} title="Reset zoom (Ctrl+0)">{Math.round(z * 100)}%</button>
        <button className="icon-btn" onClick={() => zoomCenter(1.2)} title="Zoom in (+)"><ZoomIn size={17} /></button>
        <button className="icon-btn" onClick={fitView} title="Zoom to fit (Shift+1)"><Maximize size={16} /></button>
        <span className="tb-sep" />
        <button className="icon-btn" onClick={() => { s.showHelp = true; ui(); }} title="Keyboard shortcuts (?)"><Keyboard size={17} /></button>
      </div>

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

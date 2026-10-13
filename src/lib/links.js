import { wrapText, measureWidth, fontSpec, LINE_H, STICKY_PAD, norm } from "./geometry.js";

// Links inside text/sticky notes. Two kinds:
//   • a bare address: "see https://youtube.com" – shown as is, as a link
//   • a named link:   "watch [YouTube](https://youtube.com)" – only "YouTube" is shown, as a link
// The note keeps the raw text; everything that draws or measures it uses the shown text.
const NAMED = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.|mailto:)[^\s()]+)\)/gi;
const BARE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
export const URL_ONLY = /^(?:https?:\/\/|www\.)[^\s<>"]+$/i;

const cache = new Map();
// raw text -> { text: shown text, links: [{ start, end, url }] } (offsets in the shown text)
export function parseLinks(raw) {
  raw = String(raw || "");
  let r = cache.get(raw);
  if (r) return r;
  let text = "", last = 0;
  const links = [];
  const bare = (chunk) => {
    for (const m of chunk.matchAll(BARE)) {
      const url = m[0].replace(/[.,;:!?]+$/, ""); // a full stop after an address is not part of it
      links.push({ start: text.length + m.index, end: text.length + m.index + url.length, url });
    }
    text += chunk;
  };
  for (const m of raw.matchAll(NAMED)) {
    bare(raw.slice(last, m.index));
    links.push({ start: text.length, end: text.length + m[1].length, url: m[2] });
    text += m[1];
    last = m.index + m[0].length;
  }
  bare(raw.slice(last));
  r = { text, links };
  if (cache.size > 500) cache.clear();
  cache.set(raw, r);
  return r;
}

export const shownText = (raw) => parseLinks(raw).text;
export const hasLinks = (raw) => parseLinks(raw).links.length > 0;
export const urlsIn = (raw) => [...new Set(parseLinks(raw).links.map((l) => l.url))];
export const hrefOf = (u) => (/^(https?:|mailto:)/i.test(u) ? u : "https://" + u);

// Short name for a pasted address: "youtube.com/watch?v=…".
export function linkLabel(url) {
  try {
    const u = new URL(hrefOf(url));
    const s = u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname) + u.search;
    return s.length > 42 ? s.slice(0, 40) + "…" : s;
  } catch { return url; }
}

// "[label](url)"; labels cannot hold "]" or new lines, so each line gets its own link.
export const makeLink = (label, url) =>
  label.split("\n").map((l) => (l.trim() ? `[${l.replace(/[[\]]/g, "")}](${url})` : l)).join("\n");
// Turn a named link back into plain words.
export const removeLink = (raw, url) =>
  String(raw).replace(NAMED, (all, label, u) => (u === url ? label : all));

// Where each link sits on the page: [{ x, y, w, h, url, str }] in page units, line by line.
export function linkBoxes(o) {
  if ((o.type !== "text" && o.type !== "sticky") || !o.text) return [];
  const { text, links } = parseLinks(o.text);
  if (!links.length) return [];
  const spec = fontSpec(o), size = o.size, lh = size * LINE_H;
  let x0, y0, W, lines;
  if (o.type === "sticky") {
    const b = norm(o);
    x0 = b.x + STICKY_PAD; y0 = b.y + STICKY_PAD; W = b.w - 2 * STICKY_PAD;
    lines = wrapText(text, W, spec);
  } else {
    x0 = o.x; y0 = o.y;
    lines = text.split("\n");
    W = Math.max(8, ...lines.map((l) => measureWidth(l, spec)));
  }
  const out = [];
  let at = 0;
  lines.forEach((line, i) => {
    const ls = line ? text.indexOf(line, at) : at; // wrapping drops spaces, so find each line in order
    if (ls < 0) return;
    at = ls + line.length;
    const lw = measureWidth(line, spec);
    const lx = x0 + (o.align === "center" ? (W - lw) / 2 : o.align === "right" ? W - lw : 0);
    for (const k of links) {
      const a = Math.max(k.start, ls), b = Math.min(k.end, ls + line.length);
      if (a >= b) continue;
      const str = line.slice(a - ls, b - ls);
      out.push({ x: lx + measureWidth(line.slice(0, a - ls), spec), y: y0 + i * lh, w: measureWidth(str, spec), h: lh, url: k.url, str });
    }
  });
  return out;
}

export function linkAt(o, x, y) {
  for (const b of linkBoxes(o)) if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y && y <= b.y + b.h) return b.url;
  return null;
}

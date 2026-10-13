/* ---------------------------------------------------------------- fonts */
export const FONTS = {
  inter: { label: "Inter", family: '"Inter","Hind Siliguri",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif' },
  display: { label: "Poppins", family: '"Poppins","Hind Siliguri",system-ui,sans-serif' },
  serif: { label: "Playfair", family: '"Playfair Display","Noto Serif Bengali",Georgia,serif' },
  hand: { label: "Caveat (handwriting)", family: '"Caveat","Atma",cursive' },
  marker: { label: "Permanent Marker", family: '"Permanent Marker","Atma",cursive' },
  script: { label: "Pacifico (script)", family: '"Pacifico","Atma",cursive' },
  mono: { label: "JetBrains Mono", family: '"JetBrains Mono",ui-monospace,Menlo,monospace' },
  bangla: { label: "বাংলা – Hind Siliguri", family: '"Hind Siliguri","Noto Sans Bengali",sans-serif' },
  banglaSerif: { label: "বাংলা – Noto Serif", family: '"Noto Serif Bengali",serif' },
  atma: { label: "বাংলা – Atma (fun)", family: '"Atma","Hind Siliguri",cursive' },
};
export const FONT = FONTS.inter.family;
export const fontFamily = (id) => (FONTS[id] || FONTS.inter).family;

/* --------------------------------------------------------------- colors */
// "auto" = dark ink on light pages, light ink on dark pages
export const STROKES = ["auto", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];
export const FILLS = [null, "#fecaca", "#fed7aa", "#fef08a", "#bbf7d0", "#a5f3fc", "#bfdbfe", "#ddd6fe", "#fbcfe8", "#e2e8f0"];
export const NB_COLORS = ["#6366f1", "#ec4899", "#f97316", "#22c55e", "#06b6d4", "#eab308", "#8b5cf6", "#ef4444"];

export const PAPERS = [
  { color: null, name: "Auto" },
  { color: "#ffffff", name: "White" },
  { color: "#fffbeb", name: "Cream" },
  { color: "#fef3c7", name: "Sand" },
  { color: "#ecfdf5", name: "Mint" },
  { color: "#eff6ff", name: "Sky" },
  { color: "#f5f3ff", name: "Lavender" },
  { color: "#fff1f2", name: "Rose" },
  { color: "#f1f5f9", name: "Cloud" },
  { color: "#1e293b", name: "Navy" },
  { color: "#14281d", name: "Forest" },
  { color: "#2a1b3d", name: "Plum" },
  { color: "#111827", name: "Charcoal" },
  { color: "#000000", name: "Black" },
];

export const BG_OPTIONS = [
  { id: "plain", label: "Blank" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "lines", label: "Lines" },
  { id: "ruled", label: "Ruled + margin" },
];

export const DEFAULT_STYLE = {
  stroke: "auto", fill: null, width: 3, dash: "solid", opacity: 1, fontSize: 24,
  font: "inter", bold: false, italic: false, underline: false, strike: false, align: "left",
  effect: "none", fx2: "#ec4899", hlBg: null,
  beautify: "ink", // handwriting: "off" | "smooth" | "ink"
  inkBold: false, inkItalic: false, // bold / italic handwriting
  scratch: true, // zigzag over writing erases it
  pressure: true, // stylus pressure changes line width
  math: true, // lines ending with "=" get their answer
};

export const EFFECTS = [
  { id: "none", label: "None" },
  { id: "shadow", label: "Shadow" },
  { id: "glow", label: "Glow" },
  { id: "neon", label: "Neon" },
  { id: "outline", label: "Outline" },
  { id: "gradient", label: "Gradient" },
  { id: "3d", label: "3D" },
];
export const FX2_EFFECTS = new Set(["outline", "gradient", "3d"]);

// One-click text looks. Each patch is applied through the normal style pipeline.
export const TEXT_PRESETS = [
  { name: "Heading", patch: { font: "display", bold: true, fontSize: 48, effect: "none", hlBg: null, align: "left", italic: false, underline: false }, css: { fontFamily: "Poppins", fontWeight: 700 } },
  { name: "Subtitle", patch: { font: "inter", bold: true, fontSize: 30, effect: "none", hlBg: null, italic: false }, css: { fontWeight: 600 } },
  { name: "Body", patch: { font: "inter", bold: false, fontSize: 22, effect: "none", hlBg: null, italic: false, underline: false, strike: false }, css: {} },
  { name: "Handwritten", patch: { font: "hand", bold: false, fontSize: 36, effect: "none", hlBg: null }, css: { fontFamily: "Caveat", fontSize: 22 } },
  { name: "Neon sign", patch: { font: "display", bold: true, fontSize: 52, effect: "neon", stroke: "#22d3ee", hlBg: null }, css: { fontFamily: "Poppins", fontWeight: 700, color: "#e0faff", textShadow: "0 0 8px #22d3ee, 0 0 18px #22d3ee" }, dark: true },
  { name: "Gradient", patch: { font: "display", bold: true, fontSize: 56, effect: "gradient", stroke: "#6366f1", fx2: "#ec4899", hlBg: null }, css: { fontFamily: "Poppins", fontWeight: 700, background: "linear-gradient(90deg,#6366f1,#ec4899)", WebkitBackgroundClip: "text", color: "transparent" } },
  { name: "Retro 3D", patch: { font: "marker", bold: false, fontSize: 56, effect: "3d", stroke: "#facc15", fx2: "#b45309", hlBg: null }, css: { fontFamily: "Permanent Marker", color: "#facc15", textShadow: "2px 2px 0 #b45309, 4px 4px 0 #b45309" }, dark: true },
  { name: "Outline", patch: { font: "display", bold: true, fontSize: 54, effect: "outline", stroke: "#ffffff", fx2: "#111827", hlBg: null }, css: { fontFamily: "Poppins", fontWeight: 700, color: "#fff", WebkitTextStroke: "1.5px #111827" }, dark: true },
  { name: "Highlight", patch: { font: "inter", bold: true, fontSize: 26, effect: "none", stroke: "#1e293b", hlBg: "#fde047" }, css: { fontWeight: 600, background: "#fde047", color: "#1e293b", padding: "0 6px", borderRadius: 4 } },
  { name: "Code", patch: { font: "mono", bold: false, fontSize: 20, effect: "none", stroke: "#a5f3fc", hlBg: "#1e293b" }, css: { fontFamily: "JetBrains Mono", background: "#1e293b", color: "#a5f3fc", padding: "0 6px", borderRadius: 4, fontSize: 13 } },
  { name: "বাংলা শিরোনাম", patch: { font: "banglaSerif", bold: true, fontSize: 44, effect: "none", hlBg: null }, css: { fontFamily: "Noto Serif Bengali", fontWeight: 700 }, sample: "আ অ" },
  { name: "Script", patch: { font: "script", bold: false, fontSize: 46, effect: "shadow", hlBg: null }, css: { fontFamily: "Pacifico", textShadow: "2px 2px 3px rgba(0,0,0,.3)" } },
];

/* ------------------------------------------------------------- helpers */
function parseHex(h) {
  let s = String(h || "").replace("#", "");
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  if (Number.isNaN(n) || s.length !== 6) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = parseHex(a), B = parseHex(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function isDarkColor(hex) {
  const [r, g, b] = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}
export const resolveColor = (c, theme) => (c === "auto" ? (theme === "dark" ? "#f1f5f9" : "#1e293b") : c);

/* ------------------------------------------------------------- covers */
const svg = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const WAVE = svg("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='28' viewBox='0 0 120 28'><path d='M0 14 Q30 0 60 14 T120 14' fill='none' stroke='rgba(255,255,255,.4)' stroke-width='2'/></svg>");
const STAR = (x, y) => `radial-gradient(1.4px 1.4px at ${x}% ${y}%, #fff, transparent)`;

export const COVERS = [
  { id: "aurora", name: "Aurora", css: "radial-gradient(60% 90% at 18% 15%, rgba(52,211,153,.75), transparent 60%), radial-gradient(50% 80% at 82% 25%, rgba(129,140,248,.85), transparent 60%), radial-gradient(60% 80% at 60% 100%, rgba(244,114,182,.7), transparent 60%), #0f172a" },
  { id: "sunset", name: "Sunset", css: "linear-gradient(120deg,#f97316,#ec4899 55%,#8b5cf6)" },
  { id: "ocean", name: "Ocean", css: "linear-gradient(135deg,#06b6d4,#3b82f6 60%,#1e3a8a)" },
  { id: "neon", name: "Neon city", css: "radial-gradient(circle at 18% 120%, #ec4899, transparent 52%), radial-gradient(circle at 88% -10%, #22d3ee, transparent 48%), #0b1020" },
  { id: "galaxy", name: "Galaxy", css: [STAR(12, 30), STAR(28, 70), STAR(40, 20), STAR(55, 60), STAR(68, 25), STAR(80, 75), STAR(92, 35), STAR(20, 85), STAR(75, 10), "radial-gradient(80% 130% at 72% 0%, rgba(109,40,217,.7), transparent), #070b1f"].join(",") },
  { id: "mint", name: "Fresh mint", css: "linear-gradient(135deg,#a7f3d0,#67e8f9)" },
  { id: "lavender", name: "Lavender", css: "linear-gradient(135deg,#ddd6fe,#fbcfe8)" },
  { id: "peach", name: "Peach", css: "linear-gradient(135deg,#fed7aa,#fda4af)" },
  { id: "candy", name: "Candy", css: "linear-gradient(120deg,#fbcfe8,#c4b5fd 50%,#a5f3fc)" },
  { id: "gold", name: "Golden hour", css: "linear-gradient(135deg,#fde68a,#f59e0b 55%,#b45309)" },
  { id: "forest", name: "Forest", css: "linear-gradient(135deg,#14532d,#16a34a 70%,#bef264)" },
  { id: "blueprint", name: "Blueprint", css: "linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px) 0 0/28px 28px, linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px) 0 0/28px 28px, #1d4ed8" },
  { id: "dots", name: "Polka", css: "radial-gradient(rgba(255,255,255,.6) 1.6px, transparent 1.7px) 0 0/22px 22px, linear-gradient(135deg,#6366f1,#8b5cf6)" },
  { id: "waves", name: "Waves", css: `${WAVE} 0 0/120px 28px, linear-gradient(135deg,#0ea5e9,#6366f1)` },
  { id: "paper", name: "Notebook", css: "repeating-linear-gradient(0deg, transparent 0 27px, rgba(59,130,246,.28) 27px 28px), #fffbeb" },
  { id: "terminal", name: "Terminal", css: "linear-gradient(rgba(34,197,94,.16) 1px, transparent 1px) 0 0/100% 6px, radial-gradient(80% 130% at 50% 0%, #14532d, #04120a)" },
  { id: "slate", name: "Slate", css: "linear-gradient(135deg,#0f172a,#334155)" },
  { id: "rose", name: "Rose", css: "linear-gradient(135deg,#fb7185,#e11d48 60%,#9f1239)" },
  { id: "citrus", name: "Citrus", css: "linear-gradient(135deg,#bef264,#facc15 50%,#fb923c)" },
];
export const COVER_SOLIDS = ["#6366f1", "#ec4899", "#f97316", "#22c55e", "#06b6d4", "#eab308", "#8b5cf6", "#ef4444", "#0f172a", "#64748b", "#f1f5f9", "#fef3c7"];
export const coverById = (id) => COVERS.find((c) => c.id === id);
export const coverCss = (id) => ({ kind: "css", css: coverById(id).css, id });

export const EMOJIS = ["📝", "📒", "📚", "🧠", "💡", "🎯", "✅", "📌", "📅", "🗓️", "🚀", "🌟", "🔥", "🎨", "🖌️", "📐", "🧪", "🔬", "💻", "📊",
  "📈", "🧾", "💼", "🏠", "✈️", "🌍", "🎵", "🎬", "📷", "🍳", "☕", "🌱", "🌈", "⚡", "🏆", "❤️", "🎓", "🧩", "🔑", "🗂️", "📖", "✏️", "🖍️", "🧭", "🛠️", "🎁", "🌙", "☀️"];

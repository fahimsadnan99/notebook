// Page templates: ready-made layouts (and demo covers) for new pages.
import { coverCss } from "./palette.js";

let n = 0;
const id = () => "t" + Date.now().toString(36) + (n++).toString(36);
const base = { stroke: "auto", opacity: 1 };

const T = (x, y, text, o = {}) => ({ id: id(), type: "text", x, y, text, size: 24, font: "inter", bold: false, align: "left", effect: "none", ...base, ...o });
const R = (x, y, w, h, o = {}) => ({ id: id(), type: "rect", x, y, w, h, width: 2, dash: "solid", fill: null, ...base, ...o });
const E = (x, y, w, h, o = {}) => ({ id: id(), type: "ellipse", x, y, w, h, width: 2, dash: "solid", fill: null, ...base, ...o });
const L = (x1, y1, x2, y2, o = {}) => ({ id: id(), type: "line", x: x1, y: y1, w: x2 - x1, h: y2 - y1, width: 2, dash: "solid", ...base, ...o });
const A = (x1, y1, x2, y2, o = {}) => ({ id: id(), type: "arrow", x: x1, y: y1, w: x2 - x1, h: y2 - y1, width: 3, dash: "solid", ...base, ...o });
const S = (x, y, w, h, text, fill) => ({ id: id(), type: "sticky", x, y, w, h, text, size: 20, fill, font: "hand", ...base });

export const TEMPLATES = [
  {
    id: "blank", name: "Blank", desc: "Empty dotted canvas", emoji: "📄",
    build: () => ({ objects: [], bg: "dots" }),
  },
  {
    id: "lined", name: "Lined notebook", desc: "Ruled paper with a margin", emoji: "📒", cover: coverCss("paper"),
    build: () => ({
      bg: "ruled", paper: "#fffdf5", icon: "📒", cover: coverCss("paper"),
      objects: [
        T(140, 50, "My notes", { size: 52, font: "hand", bold: true, stroke: "#1d4ed8" }),
        T(140, 125, "Date: ____ / ____ / ______", { size: 28, font: "hand" }),
      ],
    }),
  },
  {
    id: "meeting", name: "Meeting notes", desc: "Agenda, discussion, actions", emoji: "🗂️", cover: coverCss("slate"),
    build: () => ({
      bg: "grid", icon: "🗂️", cover: coverCss("slate"),
      objects: [
        T(80, 50, "Meeting notes", { size: 48, font: "display", bold: true }),
        T(80, 118, "Date  ·  Attendees  ·  Topic", { size: 20, stroke: "#64748b" }),
        R(80, 170, 330, 440, { fill: "#dbeafe", stroke: "#60a5fa" }),
        T(100, 186, "Agenda", { size: 26, font: "display", bold: true, stroke: "#1e3a8a" }),
        R(430, 170, 330, 440, { fill: "#fef9c3", stroke: "#facc15" }),
        T(450, 186, "Discussion", { size: 26, font: "display", bold: true, stroke: "#854d0e" }),
        R(780, 170, 330, 440, { fill: "#dcfce7", stroke: "#4ade80" }),
        T(800, 186, "Action items", { size: 26, font: "display", bold: true, stroke: "#14532d" }),
        ...[0, 1, 2, 3].map((i) => R(800, 245 + i * 56, 24, 24, { stroke: "#16a34a" })),
      ],
    }),
  },
  {
    id: "weekly", name: "Weekly planner", desc: "Seven day columns", emoji: "🗓️", cover: coverCss("sunset"),
    build: () => {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const fills = ["#fecaca", "#fed7aa", "#fef08a", "#bbf7d0", "#a5f3fc", "#bfdbfe", "#ddd6fe"];
      return {
        bg: "dots", icon: "🗓️", cover: coverCss("sunset"),
        objects: [
          T(60, 40, "Weekly planner", { size: 48, font: "display", bold: true, effect: "gradient", stroke: "#f97316", fx2: "#ec4899" }),
          ...days.flatMap((d, i) => [
            R(60 + i * 164, 130, 150, 520, { fill: fills[i], stroke: "#94a3b8", opacity: 0.95 }),
            T(76 + i * 164, 144, d, { size: 24, font: "display", bold: true, stroke: "#1e293b" }),
          ]),
          S(60, 680, 220, 150, "This week's goal ✨", "#fef08a"),
        ],
      };
    },
  },
  {
    id: "todo", name: "To-do list", desc: "Checkboxes and lines", emoji: "✅", cover: coverCss("mint"),
    build: () => ({
      bg: "plain", paper: "#fffbeb", icon: "✅", cover: coverCss("mint"),
      objects: [
        T(80, 50, "To-do", { size: 52, font: "marker", stroke: "#16a34a" }),
        ...Array.from({ length: 9 }, (_, i) => [
          R(80, 150 + i * 62, 32, 32, { stroke: "#16a34a", width: 3 }),
          L(130, 182 + i * 62, 760, 182 + i * 62, { stroke: "#cbd5e1" }),
        ]).flat(),
      ],
    }),
  },
  {
    id: "mindmap", name: "Mind map", desc: "Main idea with branches", emoji: "🧠", cover: coverCss("aurora"),
    build: () => {
      const cx = 520, cy = 320;
      const branches = [[160, 90, "#fecaca"], [740, 90, "#bbf7d0"], [160, 480, "#bfdbfe"], [740, 480, "#fde68a"]];
      return {
        bg: "dots", icon: "🧠", cover: coverCss("aurora"),
        objects: [
          ...branches.flatMap(([x, y, fill], i) => [
            A(cx, cy, x + 110, y + 40, { stroke: "#64748b" }),
            E(x, y, 220, 80, { fill, stroke: "#64748b" }),
            T(x + 40, y + 26, `Topic ${i + 1}`, { size: 24, font: "display", bold: true, stroke: "#1e293b" }),
          ]),
          E(cx - 120, cy - 55, 240, 110, { fill: "#c7d2fe", stroke: "#6366f1", width: 3 }),
          T(cx - 62, cy - 18, "Main idea", { size: 28, font: "display", bold: true, stroke: "#312e81" }),
        ],
      };
    },
  },
  {
    id: "study", name: "Study sheet", desc: "Title, key points, review", emoji: "🎓", cover: coverCss("candy"),
    build: () => ({
      bg: "lines", paper: "#f5f3ff", icon: "🎓", cover: coverCss("candy"),
      objects: [
        T(100, 40, "Chapter title", { size: 48, font: "serif", bold: true, stroke: "#6d28d9" }),
        S(100, 130, 300, 200, "Key idea:\n", "#ddd6fe"),
        S(430, 130, 300, 200, "Remember:\n", "#fbcfe8"),
        S(760, 130, 300, 200, "Questions?\n", "#a5f3fc"),
      ],
    }),
  },
];

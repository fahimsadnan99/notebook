import React from "react";
import {
  MousePointer2, Hand, Pencil, Highlighter, Minus, MoveUpRight, Square, Circle, Triangle, Diamond,
  Type, StickyNote, LayoutPanelTop, Image as ImageIcon, Eraser,
} from "lucide-react";

export const TOOLS = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "hand", label: "Pan (or hold Space)", key: "H", icon: Hand },
  "sep",
  { id: "pen", label: "Pen", key: "P", icon: Pencil },
  { id: "marker", label: "Highlighter", key: "M", icon: Highlighter },
  "sep",
  { id: "line", label: "Line", key: "L", icon: Minus },
  { id: "arrow", label: "Arrow", key: "A", icon: MoveUpRight },
  { id: "rect", label: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Circle / ellipse", key: "O", icon: Circle },
  { id: "triangle", label: "Triangle", key: "G", icon: Triangle },
  { id: "diamond", label: "Diamond", key: "D", icon: Diamond },
  "sep",
  { id: "text", label: "Text", key: "T", icon: Type },
  { id: "sticky", label: "Sticky note", key: "S", icon: StickyNote },
  { id: "section", label: "Section (with title)", key: "N", icon: LayoutPanelTop },
  { id: "image", label: "Insert image", key: "I", icon: ImageIcon, action: true },
  { id: "eraser", label: "Eraser", key: "E", icon: Eraser },
];

export default function Toolbar({ tool, onTool, onImage }) {
  return (
    <div className="toolbar glass">
      {TOOLS.map((t, i) =>
        t === "sep" ? (
          <span key={i} className="tb-sep" />
        ) : (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? "active" : ""}`}
            onClick={() => (t.action ? onImage() : onTool(t.id))}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
          >
            <t.icon size={18} />
            <span className="tool-key">{t.key}</span>
          </button>
        )
      )}
    </div>
  );
}

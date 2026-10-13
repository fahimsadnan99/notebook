import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2, Hand, Pencil, Highlighter, Minus, MoveUpRight, Square, Circle,
  Type, StickyNote, LayoutPanelTop, Image as ImageIcon, Eraser, Shapes, ChevronDown, Lasso,
  PenOff, Trash2,
} from "lucide-react";

const SHAPES = [
  { id: "line", label: "Line", key: "L", icon: Minus },
  { id: "arrow", label: "Arrow", key: "A", icon: MoveUpRight },
  { id: "rect", label: "Rectangle", key: "R", icon: Square },
  { id: "ellipse", label: "Circle / ellipse", key: "O", icon: Circle },
];

// Toolbar layout: "sep" = divider, { group } = dropdown menu of tools.
const LAYOUT = [
  { id: "select", label: "Select", key: "V", icon: MousePointer2 },
  { id: "lasso", label: "Lasso select (draw around handwriting)", key: "Q", icon: Lasso },
  { id: "hand", label: "Pan (or hold Space)", key: "H", icon: Hand },
  "sep",
  { id: "pen", label: "Pen", key: "P", icon: Pencil },
  { id: "marker", label: "Highlighter", key: "M", icon: Highlighter },
  "sep",
  { group: "shape", label: "Shape", icon: Shapes, items: SHAPES },
  "sep",
  { id: "text", label: "Text", key: "T", icon: Type },
  { id: "sticky", label: "Sticky note", key: "S", icon: StickyNote },
  { id: "section", label: "Section (with title)", key: "N", icon: LayoutPanelTop },
  { id: "image", label: "Insert image", key: "I", icon: ImageIcon, action: true },
  { group: "erase", label: "Erase", icon: Eraser, items: [
    { id: "eraser", label: "Eraser (drag over to delete)", key: "E", icon: Eraser },
    "sep",
    { id: "clear-ink", label: "Delete all drawings", icon: PenOff, action: true, danger: true },
    { id: "clear-all", label: "Clear whole page", icon: Trash2, action: true, danger: true },
  ] },
];

// One-click colors in the toolbar: ink color for pens/text/lines, fill color for shapes.
export const QUICK_COLORS = [
  { c: "#22c55e", name: "Green" },
  { c: "#ef4444", name: "Red" },
  { c: "#ffffff", name: "White" },
  { c: "#000000", name: "Black" },
];

// Flat list of every tool (used by the command palette).
export const TOOLS = LAYOUT.flatMap((t) => (t === "sep" ? [] : t.group ? t.items : [t])).filter((t) => t !== "sep" && !t.action);

function ToolGroup({ group, tool, onTool, onAction }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const current = group.items.find((t) => t !== "sep" && !t.action && t.id === tool);
  const Icon = current ? current.icon : group.icon;

  const toggle = () => {
    if (open) return setOpen(false);
    const r = btnRef.current.getBoundingClientRect();
    setPos({ left: Math.min(r.left, window.innerWidth - 220), top: r.bottom + 6 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        className={`tool-btn tool-group ${current ? "active" : ""} ${open ? "open" : ""}`}
        onClick={toggle}
        title={current ? `${group.label}: ${current.label} (${current.key})` : group.label}
        aria-label={group.label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon size={18} />
        <ChevronDown size={11} className="tool-caret" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} className="menu tool-menu" role="menu" style={{ left: pos.left, top: pos.top }}>
          <div className="menu-label"><strong>{group.label}</strong></div>
          {group.items.map((t, i) => t === "sep" ? <div key={i} className="menu-sep" /> : (
            <button key={t.id} role="menuitem" className={`menu-item ${tool === t.id ? "on" : ""} ${t.danger ? "danger" : ""}`}
              onClick={() => { setOpen(false); t.action ? onAction(t.id) : onTool(t.id); }}>
              <t.icon size={15} />
              <span>{t.label}</span>
              {t.key && <kbd>{t.key}</kbd>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function Toolbar({ tool, onTool, onImage, onAction, inNav, quick, onQuickColor }) {
  return (
    <div className={inNav ? "toolbar in-nav" : "toolbar glass"}>
      {LAYOUT.map((t, i) =>
        t === "sep" ? (
          <span key={i} className="tb-sep" />
        ) : t.group ? (
          <ToolGroup key={t.group} group={t} tool={tool} onTool={onTool} onAction={onAction} />
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
      <span className="tb-sep" />
      <div className="quick-colors" role="group" aria-label={`Quick ${quick.target} color`}>
        {QUICK_COLORS.map(({ c, name }) => (
          <button key={c} className={`quick-color ${quick.value === c ? "on" : ""}`} style={{ "--qc": c }}
            onClick={() => onQuickColor(c)} title={`${name} ${quick.target}`} aria-label={`${name} ${quick.target}`} />
        ))}
      </div>
    </div>
  );
}

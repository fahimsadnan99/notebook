import React, { useEffect, useRef, useState } from "react";
import { PanelTop, Image as ImageIcon } from "lucide-react";
import { BG_OPTIONS, PAPERS, mix, isDarkColor } from "../lib/palette.js";

const QUICK = [
  { name: "White", color: "#ffffff" },
  { name: "Cream", color: "#fdf6e3" },
  { name: "Night", color: "#1e2230" },
];

// Little previews of each page pattern
function Preview({ id, paper }) {
  const dark = paper ? isDarkColor(paper) : false;
  const base = paper || "#f8f9fc";
  const ink = dark ? "#ffffff" : "#000000";
  const line = id === "lines" || id === "ruled" ? mix(base, "#3b82f6", 0.3) : mix(base, ink, 0.18);
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" style={{ borderRadius: 6, background: base }}>
      {id === "dots" && [8, 18, 28, 38].flatMap((x) => [8, 17, 26].map((y) => <circle key={x + "-" + y} cx={x} cy={y} r="1.3" fill={line} />))}
      {id === "grid" && [10, 20, 30, 40].map((x) => <line key={"v" + x} x1={x} y1="0" x2={x} y2="34" stroke={line} />)}
      {id === "grid" && [9, 18, 27].map((y) => <line key={"h" + y} x1="0" y1={y} x2="46" y2={y} stroke={line} />)}
      {(id === "lines" || id === "ruled") && [8, 15, 22, 29].map((y) => <line key={y} x1="0" y1={y} x2="46" y2={y} stroke={line} />)}
      {id === "ruled" && <line x1="10" y1="0" x2="10" y2="34" stroke="rgba(239,68,68,.6)" />}
    </svg>
  );
}

export default function PageSettings({ bg, paper, gap, sheets, onChange, onCover }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open]);

  const customPaper = paper && !PAPERS.some((p) => p.color === paper);
  const defGap = bg === "lines" || bg === "ruled" ? 34 : 28;

  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`icon-btn ${open ? "active" : ""}`} onClick={() => setOpen(!open)} title="Page style: color & lines"><PanelTop size={17} /></button>
      {open && (
        <div className="page-settings glass">
          <div className="ps-title">Page style</div>

          <label className="ps-label">Page size</label>
          <div className="seg">
            <button className={!sheets ? "on" : ""} onClick={() => onChange({ sheets: 0 })}>Free canvas</button>
            <button className={sheets ? "on" : ""} onClick={() => onChange({ sheets: sheets || 1 })}>A4 sheet</button>
          </div>
          {!!sheets && (
            <div className="ps-sheets">
              <span>{sheets} sheet{sheets > 1 ? "s" : ""} · 210 × 297 mm</span>
              <button className="btn sm" onClick={() => onChange({ sheets: sheets + 1 })}>+ Add sheet</button>
              {sheets > 1 && <button className="btn sm" onClick={() => onChange({ sheets: sheets - 1 })}>− Remove</button>}
            </div>
          )}

          <label className="ps-label">Quick page colors</label>
          <div className="ps-quick">
            {QUICK.map((q) => (
              <button key={q.name} className={paper === q.color ? "on" : ""} onClick={() => onChange({ paper: q.color })}>
                <span style={{ background: q.color }} />{q.name}
              </button>
            ))}
          </div>

          <label className="ps-label">Lines</label>
          <div className="ps-patterns">
            {BG_OPTIONS.map((b) => (
              <button key={b.id} className={`ps-pattern ${bg === b.id ? "on" : ""}`} onClick={() => onChange({ bg: b.id })}>
                <Preview id={b.id} paper={paper} />
                <span>{b.label}</span>
              </button>
            ))}
          </div>

          <label className="ps-label">Page color</label>
          <div className="swatches">
            {PAPERS.map((p) => (
              <button
                key={p.name}
                className={`swatch ${p.color === null ? "auto" : ""} ${paper === p.color ? "on" : ""}`}
                style={p.color ? { background: p.color } : undefined}
                title={p.name}
                onClick={() => onChange({ paper: p.color })}
              />
            ))}
            <label className={`swatch custom ${customPaper ? "on" : ""}`} title="Custom page color" style={customPaper ? { background: paper } : undefined}>
              <input type="color" value={paper || "#ffffff"} onChange={(e) => onChange({ paper: e.target.value })} />
              {!customPaper && "+"}
            </label>
          </div>

          {bg !== "plain" && (
            <>
              <label className="ps-label">Spacing <em>{gap || defGap}px</em></label>
              <input type="range" min="16" max="80" value={gap || defGap} onChange={(e) => onChange({ gap: +e.target.value })} className="ps-range" />
            </>
          )}

          <button className="btn ps-cover" onClick={() => { setOpen(false); onCover(); }}><ImageIcon size={15} /> Page cover…</button>
        </div>
      )}
    </div>
  );
}

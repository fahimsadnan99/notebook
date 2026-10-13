import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";

export default function CommandPalette({ commands, onClose }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter((c) => (c.label + " " + (c.group || "") + " " + (c.keywords || "")).toLowerCase().includes(t));
  }, [q, commands]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    const el = listRef.current?.children[idx];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const run = (c) => { onClose(); setTimeout(() => c.run(), 30); };

  return (
    <div className="backdrop top" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && list[idx]) { e.preventDefault(); run(list[idx]); }
        }}>
        <div className="pal-input">
          <Search size={17} />
          <input autoFocus placeholder="Search pages, notebooks and actions…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={listRef}>
          {list.map((c, i) => {
            const Icon = c.icon;
            return (
              <button key={c.id} className={`pal-item ${i === idx ? "on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>
                {Icon && <Icon size={16} />}
                <span className="pal-label">{c.label}</span>
                {c.group && <span className="pal-group">{c.group}</span>}
                {i === idx && <CornerDownLeft size={13} className="pal-enter" />}
              </button>
            );
          })}
          {!list.length && <div className="pal-empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft, FileSearch, Loader2 } from "lucide-react";

export default function CommandPalette({ commands, onClose, onSearch, onOpenResult }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [found, setFound] = useState({ q: "", items: [], busy: false });
  const listRef = useRef(null);

  // Search inside every page's words (debounced), shown after the matching commands.
  useEffect(() => {
    const t = q.trim();
    if (!onSearch || t.length < 2) { setFound({ q: t, items: [], busy: false }); return; }
    setFound((f) => ({ ...f, busy: true }));
    let live = true;
    const timer = setTimeout(async () => {
      try { const items = await onSearch(t); if (live) setFound({ q: t, items, busy: false }); }
      catch { if (live) setFound({ q: t, items: [], busy: false }); }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, onSearch]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    const cmds = commands.filter((c) => (c.label + " " + (c.group || "") + " " + (c.keywords || "")).toLowerCase().includes(t));
    const have = new Set(cmds.map((c) => c.id));
    const notes = found.items.filter((r) => !have.has("pg" + r.id)).map((r) => ({
      id: "found-" + r.id, label: `${r.icon ? r.icon + " " : ""}${r.title}`, sub: r.snippet ? `${r.nbName} · ${r.snippet}` : r.nbName,
      group: "In notes", icon: FileSearch, run: () => onOpenResult(r),
    }));
    return [...cmds, ...notes];
  }, [q, commands, found, onOpenResult]);

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
          <input autoFocus placeholder="Search notes, pages and actions…" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="pal-list" ref={listRef}>
          {list.map((c, i) => {
            const Icon = c.icon;
            return (
              <button key={c.id} className={`pal-item ${i === idx ? "on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>
                {Icon && <Icon size={16} />}
                <span className="pal-label">{c.label}{c.sub && <small className="pal-sub">{c.sub}</small>}</span>
                {c.group && <span className="pal-group">{c.group}</span>}
                {i === idx && <CornerDownLeft size={13} className="pal-enter" />}
              </button>
            );
          })}
          {found.busy && <div className="pal-empty"><Loader2 size={14} className="spinning" /> Searching inside your notes…</div>}
          {!list.length && !found.busy && <div className="pal-empty">No matches</div>}
        </div>
      </div>
    </div>
  );
}

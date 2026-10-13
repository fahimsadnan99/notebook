import React, { cloneElement, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

// items: { label, icon, onClick, danger, active, hint, disabled }
//        { type: 'sep' } | { type: 'label', title, sub } | { type: 'colors', colors, value, onPick }
export default function Menu({ trigger, items, align = "left", up = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref} onClick={(e) => e.stopPropagation()}>
      {cloneElement(trigger, { onClick: () => setOpen((o) => !o) })}
      {open && (
        <div className={`menu ${align} ${up ? "up" : ""}`}>
          {items.filter(Boolean).map((it, i) => {
            if (it.type === "sep") return <div key={i} className="menu-sep" />;
            if (it.type === "label")
              return (
                <div key={i} className="menu-label">
                  <strong>{it.title}</strong>
                  {it.sub && <span>{it.sub}</span>}
                </div>
              );
            if (it.type === "colors")
              return (
                <div key={i} className="menu-colors">
                  {it.colors.map((c) => (
                    <button key={c} className={`nb-swatch ${it.value === c ? "on" : ""}`} style={{ background: c }}
                      onClick={() => { setOpen(false); it.onPick(c); }} />
                  ))}
                </div>
              );
            const Icon = it.icon;
            return (
              <button key={i} className={`menu-item ${it.danger ? "danger" : ""}`} disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick && it.onClick(); }}>
                {Icon && <Icon size={15} />}
                <span>{it.label}</span>
                {it.active && <Check size={14} className="menu-check" />}
                {it.hint && <kbd>{it.hint}</kbd>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

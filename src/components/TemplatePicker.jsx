import React from "react";
import { X } from "lucide-react";
import { TEMPLATES } from "../lib/templates.js";
import { coverStyle } from "./PageHeader.jsx";

export default function TemplatePicker({ onPick, onClose }) {
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal tpl-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3>New page</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-msg">Pick a starting point. You can change the page color, lines and cover any time.</p>
        <div className="tpl-grid">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="tpl" onClick={() => onPick(t)}>
              <span className="tpl-cover" style={t.cover ? coverStyle(t.cover) : { background: "var(--panel-2)" }}>
                <span className="tpl-emoji">{t.emoji}</span>
              </span>
              <strong>{t.name}</strong>
              <small>{t.desc}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

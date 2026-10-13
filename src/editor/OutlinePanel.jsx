import React, { useState } from "react";
import { ListTree, Bookmark, BookmarkPlus, Heading, LayoutPanelTop, Trash2, X } from "lucide-react";

// Page outline: headings, section titles and your own bookmarks, in reading order. Tap to jump there.
export default function OutlinePanel({ items, onGo, onAddMark, onDeleteMark, onClose, readOnly }) {
  const [name, setName] = useState("");
  const add = (e) => { e.preventDefault(); onAddMark(name.trim() || `Bookmark ${items.filter((i) => i.kind === "mark").length + 1}`); setName(""); };
  const Icon = { section: LayoutPanelTop, heading: Heading, mark: Bookmark };

  return (
    <div className="outline glass" role="navigation" aria-label="Page outline">
      <div className="outline-head">
        <ListTree size={15} /> <strong>Outline</strong>
        <button className="icon-btn sm" onClick={onClose} title="Close"><X size={14} /></button>
      </div>
      <div className="outline-list">
        {items.length ? items.map((it) => {
          const I = Icon[it.kind];
          return (
            <div key={it.kind + it.id} className={`outline-item ${it.kind}`}>
              <button onClick={() => onGo(it)} title="Jump here"><I size={13} /> <span>{it.label}</span></button>
              {it.kind === "mark" && !readOnly && <button className="icon-btn sm danger" onClick={() => onDeleteMark(it.id)} title="Remove bookmark"><Trash2 size={12} /></button>}
            </div>
          );
        }) : <p className="outline-empty">No headings yet. Big or bold text, Section titles and bookmarks show up here.</p>}
      </div>
      {!readOnly && (
        <form className="outline-add" onSubmit={add}>
          <input className="field sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this spot…" maxLength={60} />
          <button className="btn sm" type="submit" title="Bookmark what you see now"><BookmarkPlus size={14} /> Add</button>
        </form>
      )}
    </div>
  );
}

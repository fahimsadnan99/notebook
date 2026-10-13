import React from "react";
import { PenLine, Search, Plus, ChevronRight, MoreHorizontal, FileText, Cloud, HardDrive, X } from "lucide-react";
import Menu from "./Menu.jsx";

export default function Sidebar({
  open, onClose, notebooks, pages, nbId, pageId, query, setQuery,
  onOpenNb, onOpenPage, onNewNb, onNewPage, nbMenu, pageMenu, mode,
}) {
  const q = query.trim().toLowerCase();
  const nbs = q ? notebooks.filter((n) => n.name.toLowerCase().includes(q) || n.id === nbId) : notebooks;
  const pgs = q ? pages.filter((p) => p.title.toLowerCase().includes(q)) : pages;

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sb-head">
        <div className="brand">
          <span className="logo"><PenLine size={16} /></span>
          <span>Notebook Studio</span>
        </div>
        <button className="icon-btn sm only-mobile" onClick={onClose} title="Close"><X size={16} /></button>
      </div>

      <div className="sb-search">
        <Search size={14} />
        <input placeholder="Search notebooks & pages" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="sb-section">
        <span>Notebooks</span>
        <button className="icon-btn sm" onClick={onNewNb} title="New notebook"><Plus size={16} /></button>
      </div>

      <div className="sb-scroll">
        {nbs.map((n) => (
          <div key={n.id} className="nb-block">
            <div className={`nb-item ${n.id === nbId ? "active" : ""}`} onClick={() => onOpenNb(n.id)}>
              <ChevronRight size={14} className={`chev ${n.id === nbId ? "open" : ""}`} />
              <span className="dot" style={{ background: n.color }} />
              <span className="label">{n.name}</span>
              <Menu trigger={<button className="icon-btn sm more"><MoreHorizontal size={15} /></button>} items={nbMenu(n)} align="right" />
            </div>

            {n.id === nbId && (
              <div className="pg-list">
                {pgs.map((p) => (
                  <div key={p.id} className={`pg-item ${p.id === pageId ? "active" : ""}`} onClick={() => onOpenPage(p.id)}>
                    {p.icon ? <span className="pg-emoji">{p.icon}</span> : <FileText size={14} />}
                    <span className="label">{p.title}</span>
                    <Menu trigger={<button className="icon-btn sm more"><MoreHorizontal size={15} /></button>} items={pageMenu(p)} align="right" />
                  </div>
                ))}
                {!pgs.length && <div className="pg-empty">No matching pages</div>}
                <button className="pg-add" onClick={onNewPage}><Plus size={14} /> New page</button>
              </div>
            )}
          </div>
        ))}
        {!nbs.length && <div className="pg-empty pad">{notebooks.length ? "No results" : "No notebooks yet"}</div>}
      </div>

      <div className="sb-foot">
        {mode === "cloud" ? <><Cloud size={14} /> Synced to your account</> : <><HardDrive size={14} /> Saved in this browser</>}
      </div>
    </aside>
  );
}

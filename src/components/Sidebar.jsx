import React, { useEffect, useState } from "react";

const MIN_W = 200, MAX_W = 520, COLLAPSE_W = 120;

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night ideas 🌙" : h < 12 ? "Good morning ☀️" : h < 17 ? "Good afternoon 🌤️" : h < 21 ? "Good evening ✨" : "Night owl mode 🦉";
}
import { PenLine, Search, Plus, ChevronRight, MoreHorizontal, FileText, Cloud, HardDrive, X, FilePlus2, BookPlus, Trash2, FileUp, Star, History, Repeat, Folder, FolderOpen, FolderPlus } from "lucide-react";
import Menu from "./Menu.jsx";

export default function Sidebar({
  open, onClose, width, onResize, trashCount, onOpenTrash, onSearchNotes, onOpenResult, onImportPDF, onToggleFav, recent = [], dueCount = 0, onOpenReview, folders = [], folderMenu, onNewFolder, notebooks, pages, nbId, pageId, query, setQuery,
  onOpenNb, onOpenPage, onNewNb, onNewPage, nbMenu, pageMenu, mode,
}) {
  const q = query.trim().toLowerCase();
  const nbs = q ? notebooks.filter((n) => n.name.toLowerCase().includes(q) || n.id === nbId) : notebooks;
  const pgs = (q ? pages.filter((p) => p.title.toLowerCase().includes(q)) : pages).slice().sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)); // favorites first

  const [resizing, setResizing] = useState(false);
  const [openFolders, setOpenFolders] = useState(() => { try { return JSON.parse(localStorage.getItem("nb-open-folders")) || []; } catch { return []; } });
  const toggleFolder = (id) => setOpenFolders((l) => {
    const next = l.includes(id) ? l.filter((x) => x !== id) : [...l, id];
    try { localStorage.setItem("nb-open-folders", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [found, setFound] = useState([]);
  useEffect(() => {
    const t = query.trim();
    if (!onSearchNotes || t.length < 2) { setFound([]); return; }
    let live = true;
    const timer = setTimeout(() => onSearchNotes(t).then((r) => live && setFound(r)).catch(() => {}), 300);
    return () => { live = false; clearTimeout(timer); };
  }, [query, onSearchNotes]);

  // Drag the right edge to resize; drag far left to collapse; double-click to reset.
  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    setResizing(true);
    document.body.classList.add("sb-dragging");
    const move = (ev) => {
      const w = startW + ev.clientX - startX;
      if (w < COLLAPSE_W) return;
      onResize(Math.min(MAX_W, Math.max(MIN_W, w)));
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("sb-dragging");
      setResizing(false);
      if (startW + ev.clientX - startX < COLLAPSE_W) onClose();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const renderNb = (n, i) => {
          const active = n.id === nbId;
          return (
            <div key={n.id} className={`nb-block ${active ? "active" : ""}`} style={{ "--nb": n.color, "--i": i }}>
              <div className={`nb-item ${active ? "active" : ""}`} onClick={() => onOpenNb(n.id)}>
                <span className="nb-cover" aria-hidden="true">
                  <span className="nb-spine" />
                  <span className="nb-initial">{(n.name.trim()[0] || "N").toUpperCase()}</span>
                </span>
                <span className="nb-meta">
                  <span className="label">{n.name}</span>
                  <small>{active ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : "Tap to open"}</small>
                </span>
                <ChevronRight size={14} className={`chev ${active ? "open" : ""}`} />
                <Menu trigger={<button className="icon-btn sm more"><MoreHorizontal size={15} /></button>} items={nbMenu(n)} align="right" />
              </div>

              {active && (
                <div className="pg-list">
                  {pgs.map((p, j) => (
                    <div key={p.id} className={`pg-item ${p.id === pageId ? "active" : ""}`} style={{ "--i": j }} onClick={() => onOpenPage(p.id)}>
                      <span className="pg-node" />
                      {p.icon ? <span className="pg-emoji">{p.icon}</span> : <FileText size={14} className="pg-icon" />}
                      <span className="label">{p.title}</span>
                      <button className={`pg-star ${p.fav ? "on" : ""}`} title={p.fav ? "Remove from favorites" : "Add to favorites"}
                        onClick={(e) => { e.stopPropagation(); onToggleFav(p); }}><Star size={13} /></button>
                      <Menu trigger={<button className="icon-btn sm more"><MoreHorizontal size={15} /></button>} items={pageMenu(p)} align="right" />
                    </div>
                  ))}
                  {!pgs.length && <div className="pg-empty">No matching pages</div>}
                  <button className="pg-add" onClick={onNewPage}><Plus size={14} /> New page</button>
                </div>
              )}
            </div>
          );
  };

  // Folders: open/closed is remembered; folders around the open notebook are always open.
  const validFolder = (id) => id && folders.some((f) => f.id === id);
  const activeFolders = new Set();
  for (let f = notebooks.find((n) => n.id === nbId)?.folder; validFolder(f) && !activeFolders.has(f); f = folders.find((x) => x.id === f)?.parent) activeFolders.add(f);
  const countIn = (fid) => nbs.filter((n) => n.folder === fid).length + folders.filter((f) => f.parent === fid).length;
  const renderTree = (parent, depth) => (
    <>
      {folders.filter((f) => (validFolder(f.parent) ? f.parent : null) === parent).map((f) => {
        const isOpen = openFolders.includes(f.id) || activeFolders.has(f.id);
        return (
          <div key={f.id} className="fd-block">
            <div className="fd-item" onClick={() => toggleFolder(f.id)}>
              <ChevronRight size={14} className={`chev ${isOpen ? "open" : ""}`} />
              {isOpen ? <FolderOpen size={16} className="fd-ico" /> : <Folder size={16} className="fd-ico" />}
              <span className="label">{f.name}</span>
              <em className="fd-count">{countIn(f.id)}</em>
              <Menu trigger={<button className="icon-btn sm more"><MoreHorizontal size={15} /></button>} items={folderMenu(f)} align="right" />
            </div>
            {isOpen && <div className="fd-children">{renderTree(f.id, depth + 1)}{!countIn(f.id) && <div className="pg-empty">Empty folder</div>}</div>}
          </div>
        );
      })}
      {nbs.filter((n) => (validFolder(n.folder) ? n.folder : null) === parent).map(renderNb)}
    </>
  );

  return (
    <aside className={`sidebar ${open ? "open" : ""} ${resizing ? "resizing" : ""}`}>
      <div className="sb-hero">
        <div className="sb-head">
          <div className="brand">
            <span className="logo"><PenLine size={16} /></span>
            <span className="brand-text">
              <strong>Notebook Studio</strong>
              <small>{greeting()}</small>
            </span>
          </div>
          <button className="icon-btn sm" onClick={onClose} title="Close (Esc)"><X size={16} /></button>
        </div>

        <div className="sb-search">
          <Search size={14} />
          <input placeholder="Search notebooks & pages" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="sb-clear" onClick={() => setQuery("")} title="Clear"><X size={12} /></button>}
        </div>

        <div className="sb-quick">
          <button className="sb-quick-btn primary" onClick={onNewPage} disabled={!nbId}><FilePlus2 size={15} /> New page</button>
          <button className="sb-quick-btn" onClick={onNewNb}><BookPlus size={15} /> Notebook</button>
          <button className="sb-quick-btn icon" onClick={onImportPDF} title="Import a PDF to write on" aria-label="Import PDF"><FileUp size={16} /></button>
        </div>
      </div>

      {!q && recent.length > 0 && (
        <div className="sb-recent">
          <div className="sb-section"><span><History size={11} /> Recent</span></div>
          <div className="sb-recent-row">
            {recent.map((r) => (
              <button key={r.pageId} className="sb-recent-item" style={{ "--nb": r.color || "var(--accent)" }} onClick={() => onOpenResult({ nbId: r.nbId, id: r.pageId })} title={`${r.nbName} / ${r.title}`}>
                <span className="sb-recent-ico">{r.icon || "📄"}</span>
                <span className="sb-recent-txt"><strong>{r.title}</strong><small>{r.nbName}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sb-section">
        <span>Notebooks <em>{notebooks.length}</em></span>
        <span className="sb-section-btns">
          <button className="icon-btn sm" onClick={onNewFolder} title="New folder"><FolderPlus size={15} /></button>
          <button className="icon-btn sm" onClick={onNewNb} title="New notebook"><Plus size={16} /></button>
        </span>
      </div>

      <div className="sb-scroll">
        {q ? nbs.map(renderNb) : renderTree(null, 0)}
        {found.length > 0 && (
          <div className="sb-found">
            <div className="sb-section"><span>Found in notes <em>{found.length}</em></span></div>
            {found.map((r) => (
              <button key={r.id} className="sb-found-item" style={{ "--nb": r.color }} onClick={() => onOpenResult(r)}>
                <strong>{r.icon ? r.icon + " " : ""}{r.title}</strong>
                <small>{r.nbName}{r.snippet ? " · " + r.snippet : ""}</small>
              </button>
            ))}
          </div>
        )}
        {!nbs.length && !found.length && (
          <div className="sb-empty">
            <span className="sb-empty-art">📒</span>
            <strong>{notebooks.length ? "Nothing found" : "No notebooks yet"}</strong>
            <span>{notebooks.length ? "Try a different word." : "Create one to start writing."}</span>
            {!notebooks.length && <button className="sb-quick-btn primary" onClick={onNewNb}><BookPlus size={15} /> New notebook</button>}
          </div>
        )}
      </div>

      <button className="sb-trash review" onClick={onOpenReview} title="Practise saved flashcards">
        <Repeat size={15} /> <span>Review cards</span>
        {dueCount > 0 && <em>{dueCount} due</em>}
      </button>
      <button className="sb-trash" onClick={onOpenTrash} title="Deleted notebooks and pages">
        <Trash2 size={15} /> <span>Trash</span>
        {trashCount > 0 && <em>{trashCount}</em>}
      </button>

      <div className="sb-foot">
        <span className={`sb-foot-icon ${mode === "cloud" ? "cloud" : ""}`}>{mode === "cloud" ? <Cloud size={15} /> : <HardDrive size={15} />}</span>
        <span className="sb-foot-text">
          <strong>{mode === "cloud" ? "Synced to your account" : "Saved in this browser"}</strong>
          <small>{notebooks.length} notebook{notebooks.length === 1 ? "" : "s"} · autosave on</small>
        </span>
      </div>
      <div className="sb-resize" onPointerDown={startResize} onDoubleClick={() => onResize(280)} title="Drag to resize" />
    </aside>
  );
}

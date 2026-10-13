import React, { useEffect, useState } from "react";
import { Trash2, RotateCcw, X, FileText, Loader2 } from "lucide-react";
import { TRASH_DAYS } from "../lib/storage.js";
import { useDialogs } from "./Dialogs.jsx";

const DAY = 24 * 3600 * 1000;

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export default function TrashModal({ store, onClose, onRestored, onChanged }) {
  const { confirm, toast } = useDialogs();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try { setItems(await store.listTrash()); }
    catch (e) { toast("Could not open Trash: " + (e.message || e), "error"); setItems([]); }
  };
  useEffect(() => { load(); }, [store]);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const name = (it) => (it.kind === "notebook" ? it.name : it.title);

  async function restore(it) {
    setBusy(it.id);
    try {
      if (it.kind === "notebook") await store.restoreNotebook(it.id);
      else await store.restorePage(it.nbId, it.id);
      toast(`"${name(it)}" restored`, "success");
      setItems((l) => l.filter((x) => x.id !== it.id));
      onChanged();
      onRestored(it);
    } catch (e) { toast("Restore failed: " + (e.message || e), "error"); }
    setBusy(null);
  }

  async function purge(it) {
    const ok = await confirm({
      title: "Delete forever?",
      message: `"${name(it)}"${it.kind === "notebook" ? " and its pages" : ""} will be gone for good. This cannot be undone.`,
      confirmText: "Delete forever", danger: true,
    });
    if (!ok) return;
    setBusy(it.id);
    try {
      if (it.kind === "notebook") await store.purgeNotebook(it.id);
      else await store.purgePage(it.nbId, it.id);
      setItems((l) => l.filter((x) => x.id !== it.id));
      onChanged();
    } catch (e) { toast("Delete failed: " + (e.message || e), "error"); }
    setBusy(null);
  }

  async function emptyTrash() {
    const ok = await confirm({ title: "Empty Trash?", message: `All ${items.length} items will be deleted for good. This cannot be undone.`, confirmText: "Empty Trash", danger: true });
    if (!ok) return;
    setBusy("all");
    try {
      for (const it of items) {
        if (it.kind === "notebook") await store.purgeNotebook(it.id);
        else await store.purgePage(it.nbId, it.id);
      }
      setItems([]);
      onChanged();
    } catch (e) { toast("Could not empty Trash: " + (e.message || e), "error"); load(); }
    setBusy(null);
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal trash-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3><Trash2 size={18} /> Trash</h3>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <p className="trash-note">Deleted notebooks and pages stay here for {TRASH_DAYS} days, then they are removed for good.</p>

        <div className="trash-list">
          {items === null && <div className="trash-empty"><Loader2 size={20} className="spinning" /></div>}
          {items && !items.length && (
            <div className="trash-empty">
              <span className="trash-empty-art">🗑️</span>
              <strong>Trash is empty</strong>
              <span>Anything you delete will show up here.</span>
            </div>
          )}
          {items && items.map((it) => {
            const left = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - it.deletedAt) / DAY));
            return (
              <div key={it.kind + it.id} className="trash-item" style={{ "--nb": it.color }}>
                {it.kind === "notebook"
                  ? <span className="nb-cover sm" aria-hidden="true"><span className="nb-spine" /><span className="nb-initial">{(it.name.trim()[0] || "N").toUpperCase()}</span></span>
                  : <span className="trash-page-icon">{it.icon || <FileText size={16} />}</span>}
                <span className="trash-meta">
                  <strong>{name(it)}</strong>
                  <small>
                    {it.kind === "notebook" ? `Notebook · ${it.count} page${it.count === 1 ? "" : "s"}` : `Page in ${it.nbName}`}
                    {" · "}deleted {ago(it.deletedAt)} · {left} day{left === 1 ? "" : "s"} left
                  </small>
                </span>
                <button className="btn sm" onClick={() => restore(it)} disabled={!!busy}>
                  {busy === it.id ? <Loader2 size={14} className="spinning" /> : <RotateCcw size={14} />} Restore
                </button>
                <button className="icon-btn danger" onClick={() => purge(it)} disabled={!!busy} title="Delete forever"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>

        {items && items.length > 0 && (
          <div className="modal-actions spread">
            <span className="trash-count">{items.length} item{items.length === 1 ? "" : "s"}</span>
            <button className="btn danger" onClick={emptyTrash} disabled={!!busy}>
              {busy === "all" ? <Loader2 size={14} className="spinning" /> : <Trash2 size={14} />} Empty Trash
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

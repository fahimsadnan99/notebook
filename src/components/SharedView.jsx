import React, { useEffect, useRef, useState } from "react";
import { PenLine, Maximize, Loader2 } from "lucide-react";
import Editor from "../editor/Editor.jsx";

// Someone opened a read-only share link (?share=ID): show just that page, no sign-in needed.
export default function SharedView({ id, theme }) {
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    import("../lib/firebase.js")
      .then((m) => m.loadShare(id))
      .then((p) => (p ? setPage(p) : setError("This link was turned off by its owner, or it is not valid.")))
      .catch((e) => setError("Could not open this page: " + (e.message || e)));
  }, [id]);
  useEffect(() => { if (page) document.title = `${page.title} – Notebook Studio`; }, [page]);

  return (
    <div className="shell shared-view">
      <main className="main">
        <header className="topbar">
          <span className="brand"><span className="logo"><PenLine size={16} /></span>
            <span className="shared-title"><strong>{page ? `${page.icon ? page.icon + " " : ""}${page.title}` : "Shared page"}</strong>
              <small>{page ? `${page.nbName ? page.nbName + " · " : ""}view only` : ""}</small></span>
          </span>
          <span className="top-right">
            {page && <button className="icon-btn" onClick={() => ref.current?.fit()} title="Fit to screen"><Maximize size={17} /></button>}
            <a className="btn ghost" href={location.origin + location.pathname}>Open Notebook Studio</a>
          </span>
        </header>
        <div className="stage">
          <div className="editor-host">
            {page && <Editor ref={ref} initial={page} theme={theme} readOnly onChange={() => {}} onToast={() => {}} />}
            {!page && (
              <div className="stage-loading">{error ? <span className="share-note">{error}</span> : <Loader2 size={24} className="spinning" />}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { X, MessagesSquare, Send, Loader2, FileText } from "lucide-react";
import { pickSources, askNotes } from "../lib/ai.js";

// Ask questions about everything you have written; answers cite the pages they came from.
export default function AskModal({ getPages, onOpen, onClose }) {
  const [msgs, setMsgs] = useState([]); // { role: "user" | "ai", text, sources? }
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const abort = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  async function send(e) {
    e?.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ(""); setBusy(true);
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    abort.current = new AbortController();
    try {
      const pages = await getPages();
      // follow-up questions also search with the previous question's words
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      const sources = pickSources(question + " " + (lastUser ? lastUser.text : ""), pages);
      const text = sources.length || history.length
        ? await askNotes(question, sources, history, abort.current.signal)
        : "I couldn't find anything about that in your notes. (Only typed text, sticky notes and lecture transcripts can be searched – not handwriting.)";
      setMsgs((m) => [...m, { role: "ai", text, sources }]);
    } catch (err) {
      if (err.name !== "AbortError") setMsgs((m) => [...m, { role: "ai", text: "Sorry, the AI service did not answer: " + (err.message || err), error: true }]);
    }
    setBusy(false);
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal ask-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3><MessagesSquare size={18} className="spark" /> Ask your notes</h3>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <div className="ask-list" ref={listRef}>
          {!msgs.length && (
            <div className="ask-empty">
              <strong>Ask anything about what you wrote.</strong>
              <span>Answers come from your typed notes, sticky notes and lecture transcripts, with the pages they came from.</span>
              <div className="ask-ideas">
                {["Summarize what I wrote about motion", "What are the formulas in my notes?", "আমার নোটে নিউটনের সূত্র কী লেখা আছে?"].map((s) => (
                  <button key={s} className="chip-btn" onClick={() => setQ(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`ask-msg ${m.role} ${m.error ? "err" : ""}`}>
              <div className="ask-bubble">{m.text}</div>
              {m.sources?.length > 0 && (
                <div className="ask-sources">
                  {m.sources.map((s, j) => (
                    <button key={s.id} className="ask-src" style={{ "--nb": s.color }} onClick={() => { onOpen(s); onClose(); }} title={`Open ${s.nbName} / ${s.title}`}>
                      <b>[{j + 1}]</b> {s.icon || <FileText size={12} />} {s.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {busy && <div className="ask-msg ai"><div className="ask-bubble"><Loader2 size={14} className="spinning" /> Reading your notes…</div></div>}
        </div>
        <form className="ask-input" onSubmit={send}>
          <input className="field" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question about your notes…" />
          <button className="btn primary" type="submit" disabled={busy || !q.trim()} title="Ask"><Send size={15} /></button>
        </form>
      </div>
    </div>
  );
}

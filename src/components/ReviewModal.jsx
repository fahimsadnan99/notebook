import React, { useEffect, useMemo, useState } from "react";
import { X, Repeat, Trash2, Loader2, FileText } from "lucide-react";
import { grade, isDue, nextLabel } from "../lib/srs.js";

const GRADES = [
  { id: "again", label: "Again", cls: "again" },
  { id: "hard", label: "Hard", cls: "hard" },
  { id: "good", label: "Good", cls: "good" },
  { id: "easy", label: "Easy", cls: "easy" },
];

// Daily review of saved flashcards (spaced repetition).
export default function ReviewModal({ store, onClose, onChanged, onOpenSource }) {
  const [cards, setCards] = useState(null);
  const [queue, setQueue] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    store.listCards().then((all) => {
      setCards(all);
      setQueue(all.filter((c) => isDue(c)).sort((a, b) => a.due - b.due).map((c) => c.id));
    }).catch(() => setCards([]));
  }, [store]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      else if (queue.length && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setFlipped((f) => !f); }
      else if (flipped && queue.length && ["1", "2", "3", "4"].includes(e.key)) answer(GRADES[+e.key - 1].id);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const byId = useMemo(() => new Map((cards || []).map((c) => [c.id, c])), [cards]);
  const card = queue.length ? byId.get(queue[0]) : null;
  const nextDue = useMemo(() => (cards || []).filter((c) => !isDue(c)).sort((a, b) => a.due - b.due)[0], [cards]);

  async function answer(g) {
    const updated = grade(card, g);
    setCards((l) => l.map((c) => (c.id === card.id ? updated : c)));
    // "Again" puts the card back at the end of today's queue
    setQueue((q) => (g === "again" ? [...q.slice(1), card.id] : q.slice(1)));
    setFlipped(false); setDone((n) => n + 1);
    try { await store.saveCards([updated]); onChanged(); } catch { /* retried next time */ }
  }
  async function remove() {
    if (!confirm("Delete this card?")) return;
    const id = card.id;
    setQueue((q) => q.filter((x) => x !== id)); setCards((l) => l.filter((c) => c.id !== id)); setFlipped(false);
    try { await store.deleteCard(id); onChanged(); } catch { /* ignore */ }
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal flash-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3><Repeat size={18} className="spark" /> Review</h3>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        {!cards && <div className="flash-state"><Loader2 size={22} className="spinning" /></div>}
        {cards && !cards.length && (
          <div className="flash-state">
            <strong>No saved cards yet.</strong>
            <span>Use AI → “Quiz me” and press “Save to review deck”, or write {"{{answers}}"} in curly braces and use “Make cards from {"{{blanks}}"}”.</span>
          </div>
        )}
        {card && (
          <>
            <div className="flash-meta">{queue.length} left today · {done} reviewed{card.src && <> · <button className="link-btn" onClick={() => { onOpenSource(card.src); onClose(); }}><FileText size={11} /> {card.src.title}</button></>}</div>
            <button className={`flash-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} title="Tap to flip (Space)">
              <span className="flash-face front"><small>Question</small>{card.q}</span>
              <span className="flash-face back"><small>Answer</small>{card.a}</span>
            </button>
            <div className="flash-actions">
              {!flipped ? (
                <button className="btn primary lg" onClick={() => setFlipped(true)}>Show answer</button>
              ) : GRADES.map((g, i) => (
                <button key={g.id} className={`btn grade ${g.cls}`} onClick={() => answer(g.id)} title={`Key ${i + 1}`}>
                  <strong>{g.label}</strong><small>{nextLabel(card, g.id)}</small>
                </button>
              ))}
            </div>
            <div className="review-foot"><button className="link-btn danger" onClick={remove}><Trash2 size={12} /> Delete card</button></div>
          </>
        )}
        {cards && cards.length > 0 && !card && (
          <div className="flash-done">
            <span className="flash-score">🎉</span>
            <strong>{done ? `Done for today – ${done} reviews.` : "Nothing to review right now."}</strong>
            <span className="flash-meta">{cards.length} cards saved{nextDue ? ` · next one ${new Date(nextDue.due).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

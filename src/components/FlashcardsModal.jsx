import React, { useEffect, useRef, useState } from "react";
import { X, Loader2, Brain, RotateCcw, Check, ChevronLeft, StickyNote, RefreshCw, Repeat } from "lucide-react";
import { makeFlashcards } from "../lib/ai.js";

// Quiz yourself on a page: AI makes flashcards from the typed notes, you flip and mark them.
export default function FlashcardsModal({ notes, title, onClose, onAddToPage, onSaveDeck }) {
  const [cards, setCards] = useState(null);
  const [error, setError] = useState("");
  const [deck, setDeck] = useState([]); // indexes still being studied
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState([]);
  const [known, setKnown] = useState(0);
  const [saved, setSaved] = useState(false);
  const abort = useRef(null);

  const generate = async () => {
    setError(""); setCards(null);
    abort.current?.abort();
    abort.current = new AbortController();
    try {
      const c = await makeFlashcards(`${title ? title + "\n\n" : ""}${notes}`, abort.current.signal);
      setCards(c); setSaved(false); setDeck(c.map((_, i) => i)); setPos(0); setFlipped(false); setMissed([]); setKnown(0);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message || String(e));
    }
  };
  useEffect(() => { generate(); return () => abort.current?.abort(); }, []);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") onClose();
      else if (cards && pos < deck.length && (e.key === " " || e.key === "Enter")) { e.preventDefault(); setFlipped((f) => !f); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [cards, pos, deck, onClose]);

  const mark = (gotIt) => {
    if (gotIt) setKnown((k) => k + 1); else setMissed((m) => [...m, deck[pos]]);
    setFlipped(false); setPos((p) => p + 1);
  };
  const again = () => { setDeck(missed); setMissed([]); setPos(0); setKnown(0); setFlipped(false); };
  const done = cards && pos >= deck.length;
  const card = cards && !done ? cards[deck[pos]] : null;

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal flash-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3><Brain size={18} className="spark" /> Quiz me</h3>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>

        {!cards && !error && (
          <div className="flash-state"><Loader2 size={22} className="spinning" /><span>Making flashcards from your notes…</span></div>
        )}
        {error && (
          <div className="flash-state">
            <span>{error}</span>
            <button className="btn" onClick={generate}><RefreshCw size={14} /> Try again</button>
          </div>
        )}

        {card && (
          <>
            <div className="flash-progress"><i style={{ width: `${(pos / deck.length) * 100}%` }} /></div>
            <div className="flash-meta">Card {pos + 1} of {deck.length}</div>
            <button className={`flash-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)} title="Tap to flip (Space)">
              <span className="flash-face front"><small>Question</small>{card.q}</span>
              <span className="flash-face back"><small>Answer</small>{card.a}</span>
            </button>
            <div className="flash-actions">
              {!flipped ? (
                <button className="btn primary lg" onClick={() => setFlipped(true)}>Show answer</button>
              ) : (
                <>
                  <button className="btn lg" onClick={() => mark(false)}><ChevronLeft size={15} /> Still learning</button>
                  <button className="btn primary lg" onClick={() => mark(true)}><Check size={15} /> I knew it</button>
                </>
              )}
            </div>
          </>
        )}

        {done && (
          <div className="flash-done">
            <span className="flash-score">{known} / {deck.length}</span>
            <strong>{missed.length ? "Nice work! Review the ones you missed." : "Perfect – you know them all! 🎉"}</strong>
            <div className="flash-actions">
              {missed.length > 0 && <button className="btn primary" onClick={again}><RotateCcw size={14} /> Practice {missed.length} missed</button>}
              <button className="btn" onClick={generate}><RefreshCw size={14} /> New cards</button>
              <button className="btn" onClick={() => { onAddToPage(cards); onClose(); }}><StickyNote size={14} /> Add cards to page</button>
              <button className="btn" disabled={saved} onClick={async () => { await onSaveDeck(cards); setSaved(true); }}><Repeat size={14} /> {saved ? "Saved to review deck" : "Save to review deck"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

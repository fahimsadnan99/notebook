import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Image as ImageIcon, Smile, ChevronUp, ChevronDown, X } from "lucide-react";
import { EMOJIS } from "../lib/palette.js";

export const coverStyle = (c) =>
  !c ? {} : c.kind === "image"
    ? { backgroundImage: `url(${c.src})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: c.css };

function EmojiPicker({ onPick, onClose, hasIcon }) {
  const ref = useRef(null);
  useEffect(() => {
    const down = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, []);
  return (
    <div className="emoji-pop glass" ref={ref}>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (<button key={e} onClick={() => onPick(e)}>{e}</button>))}
      </div>
      {hasIcon && <button className="btn" onClick={() => onPick(null)}><X size={14} /> Remove icon</button>}
    </div>
  );
}

export default function PageHeader({ cover, icon, title, collapsed, onToggle, onTitle, onIcon, onCover, onRemoveCover, readOnly }) {
  const [text, setText] = useState(title || "");
  const [emoji, setEmoji] = useState(false);
  useEffect(() => setText(title || ""), [title]);
  const commit = () => { const t = text.trim(); if (t && t !== title) onTitle(t); else setText(title || ""); };

  if (collapsed) {
    return (
      <div className="page-header collapsed">
        <button className="ph-collapse" onClick={onToggle} title="Show cover & title"><ChevronDown size={15} /> {icon} {title}</button>
      </div>
    );
  }

  return (
    <div className={`page-header ${cover ? "has-cover" : ""}`}>
      {cover && <div className="cover" style={coverStyle(cover)} />}
      <div className="ph-inner">
        <div className="ph-main">
          <div className="ph-icon-wrap">
            {icon ? (
              <button className="ph-icon" onClick={() => !readOnly && setEmoji(true)} title={readOnly ? "" : "Change icon"}>{icon}</button>
            ) : !readOnly && (
              <button className="ph-add" onClick={() => setEmoji(true)}><Smile size={14} /> Add icon</button>
            )}
            {emoji && <EmojiPicker hasIcon={!!icon} onPick={(e) => { setEmoji(false); onIcon(e); }} onClose={() => setEmoji(false)} />}
          </div>
          <input
            className="ph-title"
            readOnly={readOnly}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setText(title || ""); e.target.blur(); } }}
            placeholder="Untitled page"
          />
        </div>
        <div className="ph-actions">
          {readOnly ? null : cover ? (
            <>
              <button className="ph-btn" onClick={onCover}><ImageIcon size={14} /> <span className="ph-txt">Change cover</span></button>
              <button className="ph-btn" onClick={onRemoveCover}><X size={14} /> <span className="ph-txt">Remove</span></button>
            </>
          ) : (
            <button className="ph-btn" onClick={onCover}><ImagePlus size={14} /> <span className="ph-txt">Add cover</span></button>
          )}
          <button className="ph-btn icon" onClick={onToggle} title="Hide header"><ChevronUp size={15} /></button>
        </div>
      </div>
    </div>
  );
}

import React, { useRef, useState } from "react";
import { X, Upload, Sparkles, Trash2, Check } from "lucide-react";
import { COVERS, COVER_SOLIDS } from "../lib/palette.js";
import { fileToDataUrl, loadImage, cropToCover } from "../lib/imaging.js";
import { coverStyle } from "./PageHeader.jsx";

export default function CoverPicker({ cover, onPick, onRemove, onAi, onClose, toast }) {
  const [tab, setTab] = useState("gallery");
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const img = await loadImage(await fileToDataUrl(file));
      onPick({ kind: "image", src: cropToCover(img) });
    } catch { toast("Could not read that image.", "error"); }
  };
  const customSolid = (c) => onPick({ kind: "css", css: c });

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal cover-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3>Page cover</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="tabs">
          {[["gallery", "Gallery"], ["colors", "Colors"], ["upload", "Upload"]].map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
          <button className="ai-tab" onClick={onAi}><Sparkles size={14} /> Generate with AI</button>
        </div>

        {tab === "gallery" && (
          <div className="cover-grid">
            {COVERS.map((c) => (
              <button key={c.id} className="cover-tile" onClick={() => onPick({ kind: "css", css: c.css, id: c.id })} title={c.name}>
                <span className="swatch-cover" style={{ background: c.css }} />
                <small>{c.name}</small>
                {cover && cover.id === c.id && <span className="picked"><Check size={13} /></span>}
              </button>
            ))}
          </div>
        )}

        {tab === "colors" && (
          <div className="cover-colors">
            <div className="swatches big">
              {COVER_SOLIDS.map((c) => (<button key={c} className="swatch" style={{ background: c }} onClick={() => customSolid(c)} />))}
              <label className="swatch custom" title="Custom color">+<input type="color" onChange={(e) => customSolid(e.target.value)} /></label>
            </div>
            {cover && <div className="cover-now" style={coverStyle(cover)} />}
          </div>
        )}

        {tab === "upload" && (
          <div className="cover-upload">
            <button className="drop" onClick={() => fileRef.current.click()}>
              <Upload size={22} />
              <strong>Choose an image</strong>
              <span>It is cropped to a wide banner and shrunk automatically.</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; upload(f); }} />
          </div>
        )}

        <div className="modal-actions spread">
          {cover ? <button className="btn" onClick={onRemove}><Trash2 size={14} /> Remove cover</button> : <span />}
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

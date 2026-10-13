import React, { useEffect, useRef, useState } from "react";
import { X, Sparkles, Wand2, Download, ImagePlus, Image as ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { IMAGE_STYLES, IMAGE_SIZES, generateImage, enhancePrompt } from "../lib/ai.js";
import { blobToDataUrl, loadImage, scaleImage, cropToCover, downloadDataUrl } from "../lib/imaging.js";

const IDEAS = ["A cozy reading nook with warm light", "Futuristic city at sunrise", "Cute robot studying in a library", "Watercolor mountains and a lake", "Abstract gradient waves, calm mood"];

export default function AiImageModal({ mode, onClose, onInsert, onCover, toast }) {
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState("digital");
  const [sizeId, setSizeId] = useState(mode === "cover" ? "cover" : "square");
  const [busy, setBusy] = useState(false);
  const [magic, setMagic] = useState(false);
  const [results, setResults] = useState([]); // { src, w, h }
  const [active, setActive] = useState(0);
  const abort = useRef(null);

  useEffect(() => () => abort.current && abort.current.abort(), []);

  const generate = async () => {
    if (!prompt.trim()) { toast("Describe the image you want first.", "info"); return; }
    abort.current && abort.current.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setBusy(true);
    try {
      const blob = await generateImage({ prompt, styleId, sizeId, seed: Math.floor(Math.random() * 1e6) }, ctl.signal);
      const img = await loadImage(await blobToDataUrl(blob));
      const r = scaleImage(img, { maxSide: 1000, type: "image/jpeg", quality: 0.82 });
      setResults((l) => { const n = [{ ...r }, ...l].slice(0, 6); return n; });
      setActive(0);
    } catch (e) {
      if (e.name !== "AbortError") {
        console.error(e);
        toast("Could not generate the image. The free AI service may be busy – try again in a moment.", "error");
      }
    }
    setBusy(false);
  };

  const magicPrompt = async () => {
    if (!prompt.trim()) { toast("Type a short idea first, then press Magic prompt.", "info"); return; }
    setMagic(true);
    try { setPrompt(await enhancePrompt(prompt)); }
    catch { toast("The AI helper could not improve the prompt right now.", "error"); }
    setMagic(false);
  };

  const cur = results[active];
  const useAsCover = async () => {
    const img = await loadImage(cur.src);
    onCover(cropToCover(img));
  };

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal ai-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3><Sparkles size={18} className="spark" /> AI image generator</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="ai-grid">
          <div className="ai-form">
            <label className="ps-label">Describe your image</label>
            <textarea className="field area" rows={4} value={prompt} placeholder="e.g. a friendly dragon reading a book under a tree" onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") generate(); }} />
            <div className="ai-row">
              <button className="btn sm" onClick={magicPrompt} disabled={magic}>{magic ? <Loader2 size={14} className="spinning" /> : <Wand2 size={14} />} Magic prompt</button>
              <div className="ideas">
                {IDEAS.slice(0, 3).map((i) => (<button key={i} className="idea" onClick={() => setPrompt(i)}>{i}</button>))}
              </div>
            </div>

            <label className="ps-label">Style</label>
            <div className="chips">
              {IMAGE_STYLES.map((s) => (<button key={s.id} className={`chip-btn ${styleId === s.id ? "on" : ""}`} onClick={() => setStyleId(s.id)}>{s.label}</button>))}
            </div>

            <label className="ps-label">Shape</label>
            <div className="chips">
              {IMAGE_SIZES.map((s) => (<button key={s.id} className={`chip-btn ${sizeId === s.id ? "on" : ""}`} onClick={() => setSizeId(s.id)}>{s.label}</button>))}
            </div>

            <button className="btn primary lg gen" onClick={generate} disabled={busy}>
              {busy ? <><Loader2 size={16} className="spinning" /> Generating…</> : <><Sparkles size={16} /> {results.length ? "Generate another" : "Generate"}</>}
            </button>
            <p className="hint">Free AI by Pollinations.ai. Generating can take 10–40 seconds.</p>
          </div>

          <div className="ai-result">
            <div className={`ai-preview ${busy ? "busy" : ""}`}>
              {cur ? <img src={cur.src} alt="Generated" /> : (
                <div className="ai-empty"><Sparkles size={28} /><span>Your image will appear here</span></div>
              )}
              {busy && <div className="shimmer" />}
            </div>
            {results.length > 1 && (
              <div className="thumbs">
                {results.map((r, i) => (<button key={i} className={i === active ? "on" : ""} onClick={() => setActive(i)}><img src={r.src} alt="" /></button>))}
              </div>
            )}
            <div className="ai-actions">
              <button className="btn primary" disabled={!cur} onClick={() => onInsert(cur.src, cur.w, cur.h)}><ImagePlus size={15} /> Insert on page</button>
              <button className="btn" disabled={!cur} onClick={useAsCover}><ImageIcon size={15} /> Use as cover</button>
              <button className="btn" disabled={!cur} onClick={() => downloadDataUrl(cur.src, "ai-image.jpg")}><Download size={15} /></button>
              <button className="btn" disabled={busy || !prompt.trim()} onClick={generate} title="Try again"><RefreshCw size={15} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { Headphones, Play, Pause, Square, Trash2, ChevronDown, FileText } from "lucide-react";
import { loadAudio } from "../lib/audioStore.js";

const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Lecture recordings for this page: the live "recording" pill, and a player that syncs with the ink.
export default function LecturePanel({ recording, recs, onStop, onDelete, onTime, onClose, seek }) {
  const [open, setOpen] = useState(false);
  const [curId, setCurId] = useState(null);
  const [src, setSrc] = useState(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [showText, setShowText] = useState(true);
  const audio = useRef(null);
  const pendingSeek = useRef(null);
  const cur = recs.find((r) => r.id === curId) || null;

  // Load the chosen recording's audio from this device.
  useEffect(() => {
    if (!curId) return;
    let url = null, live = true;
    setSrc(null); setMissing(false); setT(0); setPlaying(false);
    loadAudio(curId).then((blob) => {
      if (!live) return;
      if (!blob) { setMissing(true); return; }
      url = URL.createObjectURL(blob); setSrc(url);
    }).catch(() => live && setMissing(true));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [curId]);

  // Tell the editor where playback is, so later ink can be faded until it is "written".
  useEffect(() => { if (open && curId) onTime(curId, t); }, [open, curId, t]);

  // "Play from here" on a stroke.
  useEffect(() => {
    if (!seek) return;
    setOpen(true);
    pendingSeek.current = seek.ms;
    if (seek.id !== curId) setCurId(seek.id);
    else applySeek();
  }, [seek]);
  function applySeek() {
    const a = audio.current;
    if (!a || pendingSeek.current === null) return;
    a.currentTime = pendingSeek.current / 1000;
    setT(pendingSeek.current);
    pendingSeek.current = null;
    a.play().catch(() => {});
  }

  const openPanel = () => { setOpen(true); if (!curId && recs.length) setCurId(recs[recs.length - 1].id); };
  const close = () => { audio.current?.pause(); setOpen(false); onClose(); };
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) a.play().catch(() => {}); else a.pause(); };
  const jump = (ms) => { const a = audio.current; setT(ms); if (a) { a.currentTime = ms / 1000; a.play().catch(() => {}); } };

  if (recording) {
    const last = recording.interim || recording.transcript[recording.transcript.length - 1]?.text || "";
    return (
      <div className="lecture rec glass" role="status">
        <span className="rec-dot" />
        <span className="rec-time">{clock(Date.now() - recording.start)}</span>
        <span className="rec-live">{last || "Recording… write your notes, they stay linked to the audio"}</span>
        <button className="btn sm danger" onClick={onStop}><Square size={12} /> Stop</button>
      </div>
    );
  }
  if (!recs.length) return null;
  if (!open) {
    return (
      <button className="lecture pill glass" onClick={openPanel} title="Play the lecture recordings of this page">
        <Headphones size={15} /> {recs.length === 1 ? "1 recording" : `${recs.length} recordings`}
      </button>
    );
  }

  const dur = cur?.dur || 0;
  return (
    <div className="lecture panel glass">
      <div className="lec-head">
        <Headphones size={15} />
        <select className="lec-select" value={curId || ""} onChange={(e) => setCurId(e.target.value)}>
          {recs.map((r) => <option key={r.id} value={r.id}>{r.title} · {clock(r.dur)} · {new Date(r.at).toLocaleDateString()}</option>)}
        </select>
        <button className="icon-btn sm" onClick={() => setShowText(!showText)} title="Transcript"><FileText size={14} /></button>
        <button className="icon-btn sm danger" onClick={() => { if (cur && confirm(`Delete "${cur.title}"?`)) { audio.current?.pause(); onDelete(cur.id); setCurId(null); } }} title="Delete recording"><Trash2 size={14} /></button>
        <button className="icon-btn sm" onClick={close} title="Close player"><ChevronDown size={15} /></button>
      </div>

      {missing ? (
        <div className="lec-missing">The audio is saved on the device that recorded it. The transcript is below.</div>
      ) : (
        <div className="lec-player">
          <button className="lec-play" onClick={toggle} disabled={!src} title={playing ? "Pause" : "Play"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <input type="range" min="0" max={dur} step="250" value={Math.min(t, dur)} onChange={(e) => jump(+e.target.value)} disabled={!src} />
          <span className="lec-time">{clock(t)} / {clock(dur)}</span>
        </div>
      )}
      <p className="lec-hint">Ink written later fades in as it plays. Tap a stroke with Select to jump there.</p>

      {showText && cur && (
        <div className="lec-transcript">
          {cur.transcript?.length ? cur.transcript.map((seg, i) => (
            <button key={i} className={`lec-seg ${t >= seg.ms && (i === cur.transcript.length - 1 || t < cur.transcript[i + 1].ms) ? "on" : ""}`} onClick={() => jump(seg.ms)}>
              <span>{clock(seg.ms)}</span> {seg.text}
            </button>
          )) : <span className="lec-empty">No transcript (live captions need Chrome or Edge).</span>}
        </div>
      )}

      {src && (
        <audio ref={audio} src={src} preload="auto"
          onLoadedMetadata={applySeek}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)} />
      )}
    </div>
  );
}

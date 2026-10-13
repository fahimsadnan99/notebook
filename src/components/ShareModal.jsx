import React, { useState } from "react";
import { X, Link2, Copy, Check, Users } from "lucide-react";

// Shows a share / live link with a copy button and a way to stop sharing.
export default function ShareModal({ kind, link, onStop, onClose }) {
  const [copied, setCopied] = useState(false);
  const live = kind === "live";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* the link is selected in the box for manual copy */ }
  };
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal share-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3>{live ? <Users size={18} /> : <Link2 size={18} />} {live ? "Live page" : "Read-only link"}</h3>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={16} /></button>
        </div>
        <p className="share-note">
          {live
            ? "Send this link to friends. After signing in with Google they can write on this page with you at the same time – everyone sees changes instantly."
            : "Anyone with this link can view this page (no sign-in needed) but cannot change it. The link shows your latest version."}
        </p>
        <div className="share-row">
          <input className="field" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn primary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="share-warn">Only share with people you trust{live ? ": anyone with the link can edit." : "."}</div>
        <div className="modal-actions spread">
          <button className="btn danger" onClick={onStop}>{live ? "Stop live editing" : "Stop sharing"}</button>
          <button className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { PenLine, Lock, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { unlockedUntil, unlock, waitSeconds, UNLOCK_DAYS } from "../lib/gate.js";

// Nothing of the app (not even sign-in) loads until the access code is entered.
// Read-only share links (?share=) stay open, since they are meant for other people.
export default function Gate({ children }) {
  const isShare = (() => { try { return new URLSearchParams(location.search).has("share"); } catch { return false; } })();
  const [until, setUntil] = useState(unlockedUntil);
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [wait, setWait] = useState(waitSeconds);
  const inputRef = useRef(null);

  // Lock again when the 7 days run out, also while the app stays open (or wakes from sleep).
  useEffect(() => {
    if (!until) return;
    const check = () => { if (!unlockedUntil()) setUntil(0); };
    const t = setTimeout(check, Math.max(0, until - Date.now()) + 500);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("storage", check); // locked in another tab
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", check); window.removeEventListener("storage", check); };
  }, [until]);

  useEffect(() => {
    if (!wait) return;
    const t = setInterval(() => setWait(waitSeconds()), 1000);
    return () => clearInterval(t);
  }, [wait > 0]);

  if (until || isShare) return children;

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim() || busy || wait) return;
    setBusy(true); setErr("");
    const ok = await unlock(code);
    setBusy(false);
    if (ok) { setUntil(unlockedUntil()); return; }
    setCode("");
    const w = waitSeconds();
    setWait(w);
    setErr(w ? "Too many wrong tries." : "Wrong code. Try again.");
    inputRef.current?.focus();
  };

  return (
    <div className="login gate">
      <div className="login-bg">
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </div>
      <form className="login-card gate-card" onSubmit={submit}>
        <div className="logo big"><PenLine size={26} /></div>
        <h1>Notebook Studio</h1>
        <p className="tagline">This notebook is private. Enter the access code to open it.</p>

        <label className={`gate-field ${err ? "bad" : ""}`}>
          <Lock size={17} />
          <input ref={inputRef} type={show ? "text" : "password"} inputMode="numeric" autoComplete="current-password" autoFocus
            placeholder="Access code" value={code} disabled={busy || wait > 0} aria-label="Access code"
            onChange={(e) => { setCode(e.target.value); setErr(""); }} />
          <button type="button" className="gate-eye" onClick={() => setShow(!show)} title={show ? "Hide code" : "Show code"} tabIndex={-1}>
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </label>
        {(err || wait > 0) && <p className="gate-err" role="alert">{err} {wait > 0 && `Wait ${wait}s.`}</p>}

        <button type="submit" className="google-btn gate-btn" disabled={busy || wait > 0 || !code.trim()}>
          {busy ? <Loader2 size={18} className="spinning" /> : <ShieldCheck size={18} />} {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="gate-note">Stays unlocked on this device for {UNLOCK_DAYS} days, then asks again.</p>
      </form>
    </div>
  );
}

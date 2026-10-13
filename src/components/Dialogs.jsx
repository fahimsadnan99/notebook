import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

const Ctx = createContext(null);
export const useDialogs = () => useContext(Ctx);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [toasts, setToasts] = useState([]);

  const api = useMemo(() => ({
    prompt: (o) => new Promise((res) => setDlg({ type: "prompt", ...o, res })),
    confirm: (o) => new Promise((res) => setDlg({ type: "confirm", ...o, res })),
    toast: (msg, kind = "info") => {
      const id = Math.random();
      setToasts((t) => [...t, { id, msg, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
    },
  }), []);

  const close = (val) => { dlg.res(val); setDlg(null); };

  return (
    <Ctx.Provider value={api}>
      {children}
      {dlg && <DialogBox dlg={dlg} close={close} />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === "error" ? <AlertTriangle size={16} /> : t.kind === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

function DialogBox({ dlg, close }) {
  const [value, setValue] = useState(dlg.value || "");
  const ref = useRef(null);
  useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, []);
  const isPrompt = dlg.type === "prompt";
  const submit = () => close(isPrompt ? (value.trim() || null) : true);
  const cancel = () => close(isPrompt ? null : false);

  return (
    <div className="backdrop" onMouseDown={cancel}>
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") cancel(); if (e.key === "Enter" && (isPrompt || e.target.tagName !== "BUTTON")) submit(); }}
      >
        <h3>{dlg.title}</h3>
        {dlg.message && <p className="modal-msg">{dlg.message}</p>}
        {isPrompt && (
          <input ref={ref} className="field" value={value} placeholder={dlg.placeholder || ""} onChange={(e) => setValue(e.target.value)} />
        )}
        <div className="modal-actions">
          <button className="btn" onClick={cancel}>Cancel</button>
          <button className={`btn ${dlg.danger ? "danger" : "primary"}`} onClick={submit} autoFocus={!isPrompt}>
            {dlg.confirmText || "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

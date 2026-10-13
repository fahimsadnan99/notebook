import React from "react";
import {
  PanelLeft, Sun, Moon, Monitor, Download, Check, Loader2, AlertCircle, CloudOff, Pencil, HardDrive, Sparkles, Search, Focus, Maximize, Minimize,
} from "lucide-react";
import Menu from "./Menu.jsx";

const STATUS = {
  idle: null,
  dirty: { icon: Loader2, text: "Unsaved", cls: "warn" },
  saving: { icon: Loader2, text: "Saving…", cls: "spin" },
  saved: { icon: Check, text: "Saved", cls: "ok" },
  offline: { icon: CloudOff, text: "Will sync when online", cls: "warn" },
  error: { icon: AlertCircle, text: "Save failed", cls: "bad" },
};

export default function TopBar({
  onToggleSidebar, nbName, pageTitle, onRenamePage, status, theme, onCycleTheme,
  exportItems, accountItems, aiItems, user, mode, onPalette, onFocus, onFullscreen, fullscreen,
}) {
  const st = STATUS[status];
  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const initial = (user?.displayName || user?.email || "?").trim()[0]?.toUpperCase();

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onToggleSidebar} title="Toggle sidebar"><PanelLeft size={18} /></button>

      <div className="crumbs">
        <span className="crumb-nb">{nbName}</span>
        {pageTitle && (<>
          <span className="sep">/</span>
          <button className="crumb-page" onClick={onRenamePage} title="Rename page">
            {pageTitle} <Pencil size={12} />
          </button>
        </>)}
      </div>

      <div className="top-right">
        {st && (
          <span className={`chip ${st.cls}`}>
            <st.icon size={13} className={st.cls === "spin" ? "spinning" : ""} /> <span className="chip-text">{st.text}</span>
          </span>
        )}
        <button className="search-btn" onClick={onPalette} title="Command palette (Ctrl+K)">
          <Search size={14} /> <span>Search</span> <kbd>Ctrl K</kbd>
        </button>
        <Menu align="right" items={aiItems}
          trigger={<button className="btn ai-btn"><Sparkles size={15} /> <span>AI</span></button>} />
        <button className="icon-btn" onClick={onFocus} title="Focus mode (F)"><Focus size={17} /></button>
        <button className={`icon-btn ${fullscreen ? "active" : ""}`} onClick={onFullscreen} title={fullscreen ? "Exit full screen (Shift+F)" : "Full screen (Shift+F)"}>
          {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
        </button>
        <button className="icon-btn" onClick={onCycleTheme} title={`Theme: ${theme}`}><ThemeIcon size={17} /></button>
        <Menu align="right" items={exportItems}
          trigger={<button className="btn ghost"><Download size={15} /> <span>Export</span></button>} />
        <Menu align="right" items={accountItems}
          trigger={
            <button className="avatar" title="Account">
              {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
                : mode === "cloud" ? initial : <HardDrive size={15} />}
            </button>
          } />
      </div>
    </header>
  );
}

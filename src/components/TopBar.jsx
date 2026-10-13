import React from "react";
import {
  Menu as MenuIcon, MoreVertical, MoreHorizontal, BookOpen, PenLine, Presentation, Sun, Moon, Monitor, Flame, Check, Loader2, AlertCircle, CloudOff, HardDrive, Sparkles, Search, Focus, Maximize, Minimize,
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
  onToggleSidebar, nbName, nbColor, pageTitle, onRenamePage, status, theme, onCycleTheme,
  exportItems, accountItems, aiItems, user, mode, onPalette, onFocus, onFullscreen, fullscreen, toolbarSlotRef, readMode, onReadMode, onPresent,
}) {
  const st = STATUS[status];
  const ThemeIcon = theme === "red" ? Flame : theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const initial = (user?.displayName || user?.email || "?").trim()[0]?.toUpperCase();
  // Phones: everything except the tools and the account lives in one menu, so the bar is a single row.
  const phoneItems = [
    { label: "Search & commands", icon: Search, onClick: onPalette },
    { label: readMode ? "Enable editing" : "Read mode (no accidental edits)", icon: readMode ? PenLine : BookOpen, onClick: () => onReadMode(!readMode) },
    { type: "sep" },
    { type: "label", title: "AI" },
    ...aiItems,
    { type: "sep" },
    { label: "Present (slides)", icon: Presentation, onClick: onPresent },
    { label: fullscreen ? "Exit full screen" : "Full screen", icon: fullscreen ? Minimize : Maximize, onClick: onFullscreen },
    { label: `Theme: ${theme === "red" ? "dark red" : theme}`, icon: ThemeIcon, onClick: onCycleTheme },
    { type: "sep" },
    { type: "label", title: "Export" },
    ...exportItems,
  ];

  // Desktop: the everyday buttons stay in the bar; the rest sit in one tidy "More" menu.
  const moreItems = [
    { label: "Present (slides)", icon: Presentation, onClick: onPresent },
    { label: "Focus mode (F)", icon: Focus, onClick: onFocus },
    { label: fullscreen ? "Exit full screen" : "Full screen (Shift+F)", icon: fullscreen ? Minimize : Maximize, onClick: onFullscreen },
    { label: `Theme: ${theme === "red" ? "dark red" : theme}`, icon: ThemeIcon, onClick: onCycleTheme },
    { type: "sep" },
    { type: "label", title: "Export" },
    ...exportItems,
  ];

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onToggleSidebar} title="Menu"><MenuIcon size={18} /></button>

      {/* The page title is already shown big in the page header, so the bar only names the notebook. */}
      <div className="crumbs hide-phone">
        <button className="nb-chip" onClick={onToggleSidebar} title={pageTitle ? `${nbName} / ${pageTitle}` : nbName} style={{ "--nb": nbColor || "var(--accent)" }}>
          <i /> <span>{nbName}</span>
        </button>
      </div>

      {readMode && (
        <div className="read-pill" role="status">
          <BookOpen size={15} /> <span className="read-txt">Read mode</span>
          <button className="read-edit" onClick={() => onReadMode(false)}><PenLine size={14} /> Enable editing</button>
        </div>
      )}
      <div className="nav-tools" ref={toolbarSlotRef} />

      <div className="top-right">
        {st && (
          <span className={`chip ${st.cls} ${st.cls === "ok" ? "compact" : ""}`} title={st.text}>
            <st.icon size={13} className={st.cls === "spin" ? "spinning" : ""} /> <span className="chip-text">{st.text}</span>
          </span>
        )}
        <button className="search-btn hide-phone" onClick={onPalette} title="Command palette (Ctrl+K)">
          <Search size={15} /> <span className="wide-only">Search</span> <kbd className="wide-only">Ctrl K</kbd>
        </button>
        <Menu align="right" items={aiItems}
          trigger={<button className="btn ai-btn hide-phone"><Sparkles size={15} /> <span className="ai-txt">AI</span></button>} />
        {!readMode && (
          <button className="icon-btn hide-phone" onClick={() => onReadMode(true)} title="Read mode – no accidental edits"><BookOpen size={17} /></button>
        )}
        <button className="icon-btn hide-phone" onClick={onCycleTheme} title={`Theme: ${theme === "red" ? "dark red" : theme} (click to change)`}><ThemeIcon size={17} /></button>
        <Menu align="right" items={moreItems}
          trigger={<button className="icon-btn hide-phone" title="More: present, focus, full screen, export"><MoreHorizontal size={18} /></button>} />
        <Menu align="right" items={phoneItems}
          trigger={<button className="icon-btn only-phone" title="More"><MoreVertical size={18} /></button>} />
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

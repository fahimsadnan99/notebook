import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil, Trash2, Copy, FileImage, FileJson, Upload, LogOut, LogIn, BookOpen, CloudUpload, Plus, FileText,
  Sparkles, ImagePlus, Image as ImageIcon, Wand2, Mic, Focus, Sun, PanelLeft, Download, Maximize, Keyboard, X,
} from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import Login from "./components/Login.jsx";
import PageHeader from "./components/PageHeader.jsx";
import CoverPicker from "./components/CoverPicker.jsx";
import AiImageModal from "./components/AiImageModal.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import TemplatePicker from "./components/TemplatePicker.jsx";
import Editor from "./editor/Editor.jsx";
import { TOOLS } from "./editor/Toolbar.jsx";
import { useDialogs } from "./components/Dialogs.jsx";
import { NB_COLORS } from "./lib/palette.js";
import { TEXT_ACTIONS } from "./lib/ai.js";
import {
  cloudConfigured, createLocalStore, hasLocalData, copyStore, watchAuth, signInGoogle, signOutUser,
} from "./lib/storage.js";

const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve("timeout"), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
});

function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[\\/:*?"<>|]/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function App() {
  const { prompt, confirm, toast } = useDialogs();

  /* ------------------------------------------------------------- theme */
  const [themePref, setThemePref] = useState(() => localStorage.getItem("nb-theme") || "system");
  const [sysDark, setSysDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const theme = themePref === "system" ? (sysDark ? "dark" : "light") : themePref;
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = (e) => setSysDark(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const cycleTheme = () => {
    const next = themePref === "system" ? "light" : themePref === "light" ? "dark" : "system";
    setThemePref(next);
    localStorage.setItem("nb-theme", next);
  };

  /* -------------------------------------------------------------- auth */
  const [phase, setPhase] = useState("boot"); // boot | login | app
  const [store, setStore] = useState(null);
  const [user, setUser] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const chosenLocal = useRef(false);

  useEffect(() => {
    if (!cloudConfigured) { setStore(createLocalStore()); setPhase("app"); return; }
    let unsub = null, dead = false;
    watchAuth((st, u) => {
      if (st) { chosenLocal.current = false; setUser(u); setStore(st); setPhase("app"); }
      else if (!chosenLocal.current) { setUser(null); setStore(null); setPhase("login"); }
    }).then((u) => { if (dead) u(); else unsub = u; })
      .catch((err) => { console.error(err); toast("Could not start cloud sync. Using this browser only.", "error"); setStore(createLocalStore()); setPhase("app"); });
    return () => { dead = true; if (unsub) unsub(); };
  }, []);

  const doGoogle = async () => {
    setSigningIn(true);
    try { await signInGoogle(); } catch (e) { toast("Sign in failed: " + (e.message || e), "error"); }
    setSigningIn(false);
  };
  const doLocal = () => { chosenLocal.current = true; setUser(null); setStore(createLocalStore()); setPhase("app"); };

  /* -------------------------------------------------------------- data */
  const [notebooks, setNotebooks] = useState([]);
  const [pages, setPages] = useState([]);
  const [nbId, setNbId] = useState(null);
  const [pageId, setPageId] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [meta, setMeta] = useState({ cover: null, icon: null });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 860);
  const [status, setStatus] = useState("idle");
  const [focus, setFocus] = useState(false);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", on); document.addEventListener("webkitfullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); };
  }, []);
  const toggleFullscreen = useCallback(() => {
    const d = document, el = d.documentElement;
    const isFs = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (isFs) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      else toast("This browser does not support full screen here. On iPhone, use Share > Add to Home Screen.", "info");
    } catch { toast("Could not enter full screen.", "error"); }
  }, []);
  const [headerCollapsed, setHeaderCollapsed] = useState(() => localStorage.getItem("nb-header-collapsed") === "1");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [aiModal, setAiModal] = useState(null); // null | { mode: 'canvas' | 'cover' }
  const [showPalette, setShowPalette] = useState(false);
  const editorRef = useRef(null);
  const metaRef = useRef({ cover: null, icon: null });
  const pending = useRef(null);
  const timer = useRef(null);
  const loadSeq = useRef(0);
  const warned = useRef(false);

  const lastKey = store ? `nb-last-${store.kind}` : "nb-last";

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus("saving");
    try {
      const size = JSON.stringify(p.data).length;
      if (size > 950000 && !warned.current) { warned.current = true; toast("This page is getting very large (limit ~1 MB). Move some content or images to a new page.", "error"); }
      const r = await withTimeout(p.store.savePage(p.nbId, p.pageId, p.data), 5000);
      if (pending.current) return; // newer edits already waiting
      setStatus(r === "timeout" ? "offline" : "saved");
    } catch (e) {
      console.error(e);
      if (!pending.current) pending.current = p;
      setStatus("error");
      toast(e.message || "Could not save changes.", "error");
    }
  }, []);

  const queueSave = useCallback((data) => {
    pending.current = { store, nbId, pageId, data };
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [store, nbId, pageId, flush]);

  const onEditorChange = useCallback((data) => queueSave({ ...data, ...metaRef.current }), [queueSave]);

  function updateMeta(patch) {
    metaRef.current = { ...metaRef.current, ...patch };
    setMeta(metaRef.current);
    if ("icon" in patch) setPages((l) => l.map((p) => (p.id === pageId ? { ...p, icon: patch.icon } : p)));
    const d = editorRef.current?.getData();
    if (d) queueSave({ ...d, ...metaRef.current });
  }

  useEffect(() => {
    const h = (e) => { if (pending.current) { flush(); e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flush]);

  async function openPage(nb, pg) {
    await flush();
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await store.loadPage(nb, pg);
      if (seq !== loadSeq.current) return;
      warned.current = false;
      metaRef.current = { cover: data.cover || null, icon: data.icon || null };
      setMeta(metaRef.current);
      setNbId(nb); setPageId(pg); setPageData(data); setStatus("idle");
      localStorage.setItem(lastKey, JSON.stringify({ nbId: nb, pageId: pg }));
    } catch (e) {
      console.error(e); toast("Could not open that page.", "error");
    }
    if (seq === loadSeq.current) setLoading(false);
  }

  async function openNotebook(nb, preferPage) {
    await flush();
    let list = await store.listPages(nb);
    if (!list.length) list = [await store.createPage(nb, "Page 1")];
    setNbId(nb);
    setPages(list);
    const pg = list.some((p) => p.id === preferPage) ? preferPage : list[0].id;
    await openPage(nb, pg);
  }

  async function loadNotebooks(preferNb, preferPage) {
    setLoading(true);
    try {
      const list = await store.listNotebooks();
      setNotebooks(list);
      if (!list.length) {
        setNbId(null); setPages([]); setPageId(null); setPageData(null); setLoading(false);
        return;
      }
      let last = null;
      try { last = JSON.parse(localStorage.getItem(lastKey)); } catch { /* ignore */ }
      const nb = [preferNb, last && last.nbId].find((id) => id && list.some((n) => n.id === id)) || list[0].id;
      await openNotebook(nb, preferPage ?? (last && last.nbId === nb ? last.pageId : undefined));
    } catch (e) {
      console.error(e);
      toast("Could not load your notebooks: " + (e.message || e), "error");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!store) return;
    setNotebooks([]); setPages([]); setNbId(null); setPageId(null); setPageData(null);
    loadNotebooks();
  }, [store]);

  /* ------------------------------------------------------------ actions */
  async function newNotebook() {
    const name = await prompt({ title: "New notebook", placeholder: "e.g. Physics, Ideas, Diary", value: `Notebook ${notebooks.length + 1}`, confirmText: "Create" });
    if (!name) return;
    const nb = await store.createNotebook(name, NB_COLORS[notebooks.length % NB_COLORS.length]);
    await loadNotebooks(nb.id);
  }
  async function renameNotebook(n) {
    const name = await prompt({ title: "Rename notebook", value: n.name, confirmText: "Rename" });
    if (!name) return;
    await store.updateNotebook(n.id, { name });
    setNotebooks((l) => l.map((x) => (x.id === n.id ? { ...x, name } : x)));
  }
  async function recolorNotebook(n, color) {
    await store.updateNotebook(n.id, { color });
    setNotebooks((l) => l.map((x) => (x.id === n.id ? { ...x, color } : x)));
  }
  async function deleteNotebook(n) {
    const ok = await confirm({ title: "Delete notebook?", message: `"${n.name}" and all of its pages will be permanently deleted.`, confirmText: "Delete", danger: true });
    if (!ok) return;
    if (n.id === nbId) pending.current = null;
    await store.deleteNotebook(n.id);
    await loadNotebooks();
  }

  function askNewPage() {
    if (!nbId) { toast("Create a notebook first.", "info"); return; }
    setShowTemplates(true);
  }
  async function createFromTemplate(t) {
    setShowTemplates(false);
    await flush();
    const title = t.id === "blank" ? `Page ${pages.length + 1}` : t.name;
    const p = await store.createPage(nbId, title, t.build());
    setPages((l) => [...l, p]);
    await openPage(nbId, p.id);
  }
  async function renamePage(p, newTitle) {
    const title = newTitle || await prompt({ title: "Rename page", value: p.title, confirmText: "Rename" });
    if (!title) return;
    await store.renamePage(nbId, p.id, title);
    setPages((l) => l.map((x) => (x.id === p.id ? { ...x, title } : x)));
  }
  async function duplicatePage(p) {
    await flush();
    const data = await store.loadPage(nbId, p.id);
    const np = await store.createPage(nbId, `${p.title} copy`, data);
    setPages((l) => [...l, np]);
    await openPage(nbId, np.id);
  }
  async function deletePage(p) {
    const ok = await confirm({ title: "Delete page?", message: `"${p.title}" will be permanently deleted.`, confirmText: "Delete", danger: true });
    if (!ok) return;
    if (p.id === pageId) pending.current = null;
    await store.deletePage(nbId, p.id);
    let list = pages.filter((x) => x.id !== p.id);
    if (!list.length) list = [await store.createPage(nbId, "Page 1")];
    setPages(list);
    if (p.id === pageId) await openPage(nbId, list[0].id);
  }

  const nb = notebooks.find((n) => n.id === nbId);
  const pg = pages.find((p) => p.id === pageId);

  /* ------------------------------------------------------- export/import */
  async function exportPNG() {
    const blob = await editorRef.current?.exportPNG();
    if (blob) downloadBlob(blob, `${nb?.name || "notebook"} - ${pg?.title || "page"}.png`);
  }
  async function exportPageJSON() {
    const d = editorRef.current?.getData();
    if (!d) return;
    const file = { kind: "page", app: "notebook-studio", title: pg?.title, ...d, ...metaRef.current };
    downloadBlob(new Blob([JSON.stringify(file)], { type: "application/json" }), `${nb?.name} - ${pg?.title}.json`);
  }
  async function exportNotebookJSON() {
    await flush();
    const out = [];
    for (const p of await store.listPages(nbId)) out.push({ title: p.title, ...(await store.loadPage(nbId, p.id)) });
    const file = { kind: "notebook", app: "notebook-studio", name: nb?.name, color: nb?.color, pages: out };
    downloadBlob(new Blob([JSON.stringify(file)], { type: "application/json" }), `${nb?.name}.json`);
  }
  const importRef = useRef(null);
  async function importFile(file) {
    try {
      const j = JSON.parse(await file.text());
      if (j.kind === "notebook" && Array.isArray(j.pages)) {
        const created = await store.createNotebook(j.name || "Imported notebook", j.color || NB_COLORS[0]);
        for (const p of j.pages) await store.createPage(created.id, p.title || "Page", p);
        await loadNotebooks(created.id);
      } else if (Array.isArray(j.objects) && nbId) {
        await flush();
        const np = await store.createPage(nbId, j.title || "Imported page", j);
        setPages((l) => [...l, np]);
        await openPage(nbId, np.id);
      } else throw new Error("bad file");
      toast("Imported successfully.", "success");
    } catch { toast("That file is not a valid Notebook Studio export.", "error"); }
  }
  async function uploadLocal() {
    const ok = await confirm({ title: "Copy local notebooks to your account?", message: "Everything saved in this browser will be copied to the cloud. Your local copy is kept.", confirmText: "Copy" });
    if (!ok) return;
    try {
      const n = await copyStore(createLocalStore(), store);
      toast(`Copied ${n} notebook${n === 1 ? "" : "s"} to the cloud.`, "success");
      await loadNotebooks();
    } catch (e) { toast("Copy failed: " + (e.message || e), "error"); }
  }

  /* -------------------------------------------------------- global keys */
  useEffect(() => {
    const h = (e) => {
      const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setShowPalette(true); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "F" && e.shiftKey) toggleFullscreen();
      else if (e.key === "f") setFocus((f) => !f);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------------------------------------------------------------- UI */
  if (phase === "boot") return <div className="boot"><div className="spinner" /></div>;
  if (phase === "login") return <Login onGoogle={doGoogle} onLocal={doLocal} busy={signingIn} />;

  const mode = store?.kind || "local";
  const toggleHeader = () => setHeaderCollapsed((c) => { localStorage.setItem("nb-header-collapsed", c ? "0" : "1"); return !c; });

  const exportItems = [
    { label: "Page as PNG image", icon: FileImage, onClick: exportPNG, disabled: !pageId },
    { label: "Page as JSON", icon: FileJson, onClick: exportPageJSON, disabled: !pageId },
    { label: "Whole notebook as JSON", icon: BookOpen, onClick: exportNotebookJSON, disabled: !nbId },
    { type: "sep" },
    { label: "Import from JSON…", icon: Upload, onClick: () => importRef.current?.click() },
  ];
  const accountItems = [
    mode === "cloud"
      ? { type: "label", title: user?.displayName || "Signed in", sub: user?.email }
      : { type: "label", title: "Local mode", sub: cloudConfigured ? "Notes stay in this browser" : "Add Firebase keys to enable cloud sync" },
    { type: "sep" },
    mode === "cloud" && hasLocalData() && { label: "Copy local notebooks to cloud", icon: CloudUpload, onClick: uploadLocal },
    mode === "cloud" && { label: "Sign out", icon: LogOut, onClick: async () => { await flush(); signOutUser(); } },
    mode === "local" && cloudConfigured && { label: "Sign in for cloud sync", icon: LogIn, onClick: () => setPhase("login") },
  ];
  const aiItems = [
    { label: "Generate image…", icon: ImagePlus, onClick: () => setAiModal({ mode: "canvas" }), disabled: !pageId },
    { label: "Generate page cover…", icon: ImageIcon, onClick: () => setAiModal({ mode: "cover" }), disabled: !pageId },
    { type: "sep" },
    { type: "label", title: "Write with AI", sub: "Select a text or sticky note first" },
    ...Object.entries(TEXT_ACTIONS).map(([id, a]) => ({ label: a.label, icon: Wand2, onClick: () => editorRef.current?.aiText(id), disabled: !pageId })),
    { type: "sep" },
    { label: "Voice typing (English)", icon: Mic, onClick: () => editorRef.current?.dictate("en-US"), disabled: !pageId },
    { label: "Voice typing (বাংলা)", icon: Mic, onClick: () => editorRef.current?.dictate("bn-BD"), disabled: !pageId },
  ];

  const nbMenu = (n) => [
    { label: "Rename", icon: Pencil, onClick: () => renameNotebook(n) },
    { type: "colors", colors: NB_COLORS, value: n.color, onPick: (c) => recolorNotebook(n, c) },
    { type: "sep" },
    { label: "Delete notebook", icon: Trash2, danger: true, onClick: () => deleteNotebook(n) },
  ];
  const pageMenu = (p) => [
    { label: "Rename", icon: Pencil, onClick: () => renamePage(p) },
    { label: "Duplicate", icon: Copy, onClick: () => duplicatePage(p) },
    { type: "sep" },
    { label: "Delete page", icon: Trash2, danger: true, onClick: () => deletePage(p) },
  ];

  const commands = [
    ...pages.map((p) => ({ id: "pg" + p.id, label: p.title, group: "Page", icon: FileText, run: () => openPage(nbId, p.id) })),
    ...notebooks.map((n) => ({ id: "nb" + n.id, label: n.name, group: "Notebook", icon: BookOpen, run: () => openNotebook(n.id) })),
    { id: "a-newpage", label: "New page…", group: "Action", icon: Plus, keywords: "template add", run: askNewPage },
    { id: "a-newnb", label: "New notebook…", group: "Action", icon: BookOpen, run: newNotebook },
    { id: "a-cover", label: "Change page cover…", group: "Action", icon: ImageIcon, keywords: "banner", run: () => pageId && setShowCover(true) },
    { id: "a-ai", label: "AI: generate image…", group: "AI", icon: Sparkles, keywords: "picture photo art", run: () => pageId && setAiModal({ mode: "canvas" }) },
    { id: "a-aicover", label: "AI: generate page cover…", group: "AI", icon: Sparkles, run: () => pageId && setAiModal({ mode: "cover" }) },
    ...Object.entries(TEXT_ACTIONS).map(([id, a]) => ({ id: "ai-" + id, label: `AI: ${a.label}`, group: "AI", icon: Wand2, run: () => editorRef.current?.aiText(id) })),
    { id: "a-dict", label: "Voice typing (English)", group: "AI", icon: Mic, keywords: "dictate speak microphone", run: () => editorRef.current?.dictate("en-US") },
    { id: "a-dictbn", label: "Voice typing (বাংলা)", group: "AI", icon: Mic, keywords: "dictate bangla bengali", run: () => editorRef.current?.dictate("bn-BD") },
    { id: "a-fullscreen", label: "Toggle full screen", group: "View", icon: Maximize, run: () => toggleFullscreen() },
    { id: "a-focus", label: "Toggle focus mode", group: "View", icon: Focus, run: () => setFocus((f) => !f) },
    { id: "a-side", label: "Toggle sidebar", group: "View", icon: PanelLeft, run: () => setSidebarOpen((o) => !o) },
    { id: "a-theme", label: "Change theme (system / light / dark)", group: "View", icon: Sun, run: cycleTheme },
    { id: "a-fit", label: "Zoom to fit", group: "View", icon: Maximize, run: () => editorRef.current?.fit() },
    { id: "a-keys", label: "Keyboard shortcuts", group: "View", icon: Keyboard, run: () => editorRef.current?.toggleHelp() },
    { id: "a-png", label: "Export page as PNG", group: "Export", icon: Download, run: exportPNG },
    { id: "a-json", label: "Export page as JSON", group: "Export", icon: FileJson, run: exportPageJSON },
    ...TOOLS.filter((t) => t !== "sep" && !t.action).map((t) => ({ id: "tool-" + t.id, label: `Tool: ${t.label}`, group: "Tool", icon: t.icon, run: () => editorRef.current?.setTool(t.id) })),
  ];

  return (
    <div className={`shell ${sidebarOpen && !focus ? "with-sidebar" : ""} ${focus ? "focus" : ""}`}>
      <Sidebar
        open={sidebarOpen && !focus} onClose={() => setSidebarOpen(false)}
        notebooks={notebooks} pages={pages} nbId={nbId} pageId={pageId}
        query={query} setQuery={setQuery}
        onOpenNb={(id) => { if (id !== nbId) openNotebook(id); if (window.innerWidth <= 860) setSidebarOpen(false); }}
        onOpenPage={(id) => { if (id !== pageId) openPage(nbId, id); if (window.innerWidth <= 860) setSidebarOpen(false); }}
        onNewNb={newNotebook} onNewPage={askNewPage} nbMenu={nbMenu} pageMenu={pageMenu} mode={mode}
      />
      {sidebarOpen && !focus && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        {!focus && (
          <TopBar
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            nbName={nb?.name || "Notebook Studio"} pageTitle={pg?.title} onRenamePage={() => pg && renamePage(pg)}
            status={status} theme={themePref} onCycleTheme={cycleTheme}
            exportItems={exportItems} accountItems={accountItems} aiItems={aiItems} user={user} mode={mode}
            onPalette={() => setShowPalette(true)} onFocus={() => setFocus(true)} onFullscreen={toggleFullscreen} fullscreen={fs}
          />
        )}

        <div className="stage">
          {pageData && pageId && !focus && (
            <PageHeader
              cover={meta.cover} icon={meta.icon} title={pg?.title} collapsed={headerCollapsed} onToggle={toggleHeader}
              onTitle={(t) => pg && renamePage(pg, t)} onIcon={(e) => updateMeta({ icon: e })}
              onCover={() => setShowCover(true)} onRemoveCover={() => updateMeta({ cover: null })}
            />
          )}
          <div className="editor-host">
            {pageData && pageId && (
              <Editor key={pageId} ref={editorRef} initial={pageData} theme={theme} onChange={onEditorChange} onToast={toast}
                onOpenCover={() => setShowCover(true)} />
            )}
          </div>
          {loading && <div className="stage-loading"><div className="spinner" /></div>}
          {!loading && !nbId && (
            <div className="empty-state">
              <div className="logo big"><BookOpen size={26} /></div>
              <h2>Create your first notebook</h2>
              <p>Notebooks hold pages. Every page is an infinite canvas for writing and drawing.</p>
              <button className="btn primary lg" onClick={newNotebook}><Plus size={16} /> New notebook</button>
            </div>
          )}
          {focus && <button className="focus-exit glass" onClick={() => setFocus(false)}><X size={14} /> Exit focus</button>}
        </div>
      </main>

      <input ref={importRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); }} />

      {showTemplates && <TemplatePicker onPick={createFromTemplate} onClose={() => setShowTemplates(false)} />}
      {showCover && (
        <CoverPicker
          cover={meta.cover} toast={toast} onClose={() => setShowCover(false)}
          onPick={(c) => updateMeta({ cover: c })} onRemove={() => { updateMeta({ cover: null }); setShowCover(false); }}
          onAi={() => { setShowCover(false); setAiModal({ mode: "cover" }); }}
        />
      )}
      {aiModal && (
        <AiImageModal
          mode={aiModal.mode} toast={toast} onClose={() => setAiModal(null)}
          onInsert={(src, w, h) => { editorRef.current?.insertImageDataUrl(src, w, h); setAiModal(null); toast("Image added to your page ✨", "success"); }}
          onCover={(src) => { updateMeta({ cover: { kind: "image", src } }); setAiModal(null); toast("Cover updated ✨", "success"); }}
        />
      )}
      {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} />}
    </div>
  );
}

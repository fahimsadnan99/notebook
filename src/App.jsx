import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil, Trash2, Copy, FileImage, FileJson, Upload, LogOut, LogIn, BookOpen, CloudUpload, Plus, FileText,
  Sparkles, ImagePlus, Image as ImageIcon, Wand2, Mic, Focus, Sun, PanelLeft, Download, Maximize, Keyboard, X, MonitorDown, FileUp, Star, Brain, Presentation, MessagesSquare, Repeat, FolderInput, FolderPlus, Link2, Users, PenOff, Eraser, Lock,
} from "lucide-react";
import { lock as lockApp, unlockedUntil } from "./lib/gate.js";
import Sidebar from "./components/Sidebar.jsx";
import TopBar from "./components/TopBar.jsx";
import Login from "./components/Login.jsx";
import PageHeader from "./components/PageHeader.jsx";
import CoverPicker from "./components/CoverPicker.jsx";
import TrashModal from "./components/TrashModal.jsx";
import FlashcardsModal from "./components/FlashcardsModal.jsx";
import AskModal from "./components/AskModal.jsx";
import ReviewModal from "./components/ReviewModal.jsx";
import ShareModal from "./components/ShareModal.jsx";
import SharedView from "./components/SharedView.jsx";

const SHARED_NB = "__shared__"; // virtual notebook with live pages others shared (see firebase.js)
const urlParam = (k) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };
const dropParam = (k) => { try { const u = new URL(location.href); u.searchParams.delete(k); history.replaceState(null, "", u); } catch { /* ignore */ } };
import { newCard, isDue, clozeCards } from "./lib/srs.js";
import AiImageModal from "./components/AiImageModal.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import TemplatePicker from "./components/TemplatePicker.jsx";
import Editor from "./editor/Editor.jsx";
import { TOOLS } from "./editor/Toolbar.jsx";
import { useDialogs } from "./components/Dialogs.jsx";
import { NB_COLORS } from "./lib/palette.js";
import { TEXT_ACTIONS } from "./lib/ai.js";
import {
  textOf, cloudConfigured, createLocalStore, hasLocalData, copyStore, watchAuth, signInGoogle, signOutUser,
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
    const order = ["system", "light", "dark", "red"];
    const next = order[(order.indexOf(themePref) + 1) % order.length];
    setThemePref(next);
    localStorage.setItem("nb-theme", next);
  };

  /* -------------------------------------------------------------- auth */
  const [phase, setPhase] = useState("boot"); // boot | login | app
  const [store, setStore] = useState(null);
  const [shareView] = useState(() => urlParam("share")); // someone opened a read-only link
  const [room, setRoom] = useState(null); // live page connection
  const roomRef = useRef(null);
  const [shareBox, setShareBox] = useState(null); // { kind, link, onStop }
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
  const [folders, setFolders] = useState([]);
  const [moveNb, setMoveNb] = useState(null); // notebook being moved to a folder
  const [pages, setPages] = useState([]);
  const [nbId, setNbId] = useState(null);
  const [pageId, setPageId] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [meta, setMeta] = useState({ cover: null, icon: null });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toolbarSlot, setToolbarSlot] = useState(null);
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem("nb-sidebar-w")) || 280);
  useEffect(() => { localStorage.setItem("nb-sidebar-w", String(sidebarW)); }, [sidebarW]);
  const [status, setStatus] = useState("idle");
  const [focus, setFocus] = useState(false);
  // Presentation: full screen, no app chrome, Sections become slides.
  const [present, setPresent] = useState(false);
  const presentFs = useRef(false);
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const on = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", on); document.addEventListener("webkitfullscreenchange", on);
    return () => { document.removeEventListener("fullscreenchange", on); document.removeEventListener("webkitfullscreenchange", on); };
  }, []);
  function startPresent() {
    if (!pageId) return;
    setSidebarOpen(false); setPresent(true);
    const el = document.documentElement;
    if (!(document.fullscreenElement || document.webkitFullscreenElement) && (el.requestFullscreen || el.webkitRequestFullscreen)) {
      Promise.resolve((el.requestFullscreen || el.webkitRequestFullscreen).call(el)).then(() => { presentFs.current = true; }).catch(() => {});
    }
  }
  function stopPresent() {
    setPresent(false);
    if (presentFs.current) { presentFs.current = false; try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch { /* ignore */ } }
  }
  const toggleFullscreen = useCallback(() => {
    const d = document, el = d.documentElement;
    const isFs = d.fullscreenElement || d.webkitFullscreenElement;
    try {
      if (isFs) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      else toast("This browser does not support full screen here. On iPhone, use Share > Add to Home Screen.", "info");
    } catch { toast("Could not enter full screen.", "error"); }
  }, []);
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    const saved = localStorage.getItem("nb-header-collapsed");
    return saved === null ? window.innerWidth <= 600 : saved === "1"; // phones start with the thin strip
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  // Read mode: pages can be scrolled and zoomed but not changed (remembered on this device).
  const [readMode, setReadModeState] = useState(() => localStorage.getItem("nb-read") === "1");
  const setReadMode = (on) => {
    setReadModeState(on);
    try { localStorage.setItem("nb-read", on ? "1" : "0"); } catch { /* ignore */ }
    toast(on ? "Read mode – you can scroll and zoom, nothing changes by accident." : "Editing enabled.", "info");
  };
  const [flash, setFlash] = useState(null);
  const [showAsk, setShowAsk] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const refreshDue = () => store?.listCards?.().then((l) => setDueCount(l.filter((c) => isDue(c)).length)).catch(() => {});
  // Recently opened pages (this device), newest first.
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem("nb-recent")) || []; } catch { return []; } });
  // "Install app": the browser offers this when the site can be installed (Chrome, Edge, Android).
  const [installEvt, setInstallEvt] = useState(null);
  useEffect(() => {
    const offer = (e) => { e.preventDefault(); setInstallEvt(e); };
    const done = () => { setInstallEvt(null); toast("Notebook Studio installed – open it from your home screen.", "success"); };
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", offer); window.removeEventListener("appinstalled", done); };
  }, []);
  const installApp = async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch { /* ignore */ }
    setInstallEvt(null);
  };
  const [trashCount, setTrashCount] = useState(0);
  const refreshTrash = () => store?.listTrash?.().then((l) => setTrashCount(l.length)).catch(() => {});
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
    // A lecture recording belongs to the page it started on: stop and save it before leaving.
    if (editorRef.current?.isRecording?.()) await editorRef.current.stopRecording();
    await flush();
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await store.loadPage(nb, pg);
      if (seq !== loadSeq.current) return;
      roomRef.current?.close(); roomRef.current = null; setRoom(null);
      if (data.roomId && store.openRoom) {
        try {
          const r = await store.openRoom(data.roomId);
          if (seq !== loadSeq.current) { r.close(); return; }
          data.objects = r.objects; roomRef.current = r; setRoom(r);
        } catch (e) { toast(e.message || "Could not join the live page.", "error"); }
      }
      warned.current = false;
      metaRef.current = { cover: data.cover || null, icon: data.icon || null, shareId: data.shareId || null };
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
    if (!list.length && nb === SHARED_NB) { await loadNotebooks(); return; } // left every shared page
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
      store.listFolders().then(setFolders).catch(() => {});
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
    refreshTrash();
    refreshDue();
  }, [store]);

  /* ------------------------------------------------------------ actions */
  async function newNotebook(folder = null) {
    const name = await prompt({ title: "New notebook", placeholder: "e.g. Physics, Ideas, Diary", value: `Notebook ${notebooks.length + 1}`, confirmText: "Create" });
    if (!name) return;
    const nb = await store.createNotebook(name, NB_COLORS[notebooks.length % NB_COLORS.length]);
    if (folder) await store.updateNotebook(nb.id, { folder });
    await loadNotebooks(nb.id);
  }
  /* ---------------------------------------------------------- folders */
  async function newFolder(parent = null) {
    const name = await prompt({ title: parent ? "New folder inside" : "New folder", placeholder: "e.g. Semester 1, Science", value: "", confirmText: "Create" });
    if (!name) return;
    const f = await store.createFolder(name, parent);
    setFolders((l) => [...l, f]);
  }
  async function renameFolder(f) {
    const name = await prompt({ title: "Rename folder", value: f.name, confirmText: "Rename" });
    if (!name) return;
    await store.updateFolder(f.id, { name });
    setFolders((l) => l.map((x) => (x.id === f.id ? { ...x, name } : x)));
  }
  async function deleteFolder(f) {
    const ok = await confirm({ title: "Delete folder?", message: `"${f.name}" will be removed. Its notebooks and folders are kept and move up one level.`, confirmText: "Delete folder", danger: true });
    if (!ok) return;
    await store.deleteFolder(f.id);
    setFolders(await store.listFolders());
    setNotebooks(await store.listNotebooks());
  }
  async function moveNotebook(n, folder) {
    setMoveNb(null);
    await store.updateNotebook(n.id, { folder });
    setNotebooks((l) => l.map((x) => (x.id === n.id ? { ...x, folder } : x)));
    toast(folder ? `Moved to "${folders.find((f) => f.id === folder)?.name}"` : "Moved to the top level", "success");
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
  // Deleting moves things to the Trash, so no confirmation is needed; it can be restored from there.
  async function deleteNotebook(n) {
    if (n.id === nbId) await flush();
    await store.deleteNotebook(n.id);
    toast(`"${n.name}" moved to Trash`, "success");
    refreshTrash();
    await loadNotebooks();
  }

  function askNewPage() {
    if (!nbId) { toast("Create a notebook first.", "info"); return; }
    if (nbId === SHARED_NB) { toast("“Shared with me” only holds live pages from others. Pick one of your notebooks to add a page.", "info"); return; }
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
    if (p.id === pageId) await flush();
    await store.deletePage(nbId, p.id);
    toast(`"${p.title}" moved to Trash`, "success");
    refreshTrash();
    let list = pages.filter((x) => x.id !== p.id);
    if (!list.length) list = [await store.createPage(nbId, "Page 1")];
    setPages(list);
    if (p.id === pageId) await openPage(nbId, list[0].id);
  }

  const nb = notebooks.find((n) => n.id === nbId);
  const pg = pages.find((p) => p.id === pageId);

  // AI flashcards from the words on this page.
  function quizMe() {
    const d = editorRef.current?.getData();
    const notes = d ? textOf(d.objects) : "";
    if (notes.length < 30) { toast("Type some notes on this page first (text boxes or sticky notes) – the quiz is made from them.", "info"); return; }
    setFlash({ notes, title: pg?.title || "" });
  }

  async function saveDeck(cards) {
    const src = pg ? { nbId, pageId, title: pg.title } : null;
    await store.saveCards(cards.map((c) => newCard(c.q, c.a, src)));
    refreshDue();
    toast(`${cards.length} cards saved – they come back in Review when it's time to practise.`, "success");
  }
  // {{blank}} in typed notes -> fill-in-the-blank cards
  async function clozeFromPage() {
    const d = editorRef.current?.getData();
    // each text box / sticky note separately, so a card's question is just its own line
    const cards = d ? clozeCards(d.objects.filter((o) => (o.type === "text" || o.type === "sticky") && o.text).map((o) => o.text).join("\n")) : [];
    if (!cards.length) { toast("Write the answer in double curly braces, e.g. “Water boils at {{100 °C}}”, then try again.", "info"); return; }
    await saveDeck(cards);
  }

  /* ------------------------------------------------- share + live pages */
  const needCloud = () => { if (mode === "cloud") return false; toast("Sign in with Google first – sharing needs your online account.", "info"); return true; };
  async function sharePage(p) {
    if (needCloud()) return;
    try {
      await flush();
      const id = await store.createShare(nbId, p.id, { nbName: nb?.name, title: p.title });
      if (p.id === pageId) metaRef.current = { ...metaRef.current, shareId: id };
      setShareBox({
        kind: "share", link: `${location.origin}${location.pathname}?share=${id}`,
        onStop: async () => {
          setShareBox(null);
          await store.removeShare(nbId, p.id, id);
          if (p.id === pageId) metaRef.current = { ...metaRef.current, shareId: null };
          toast("Link turned off.", "success");
        },
      });
    } catch (e) { toast("Could not create the link: " + (e.message || e) + " (check the Firestore rules in README)", "error"); }
  }
  async function goLive(p) {
    if (needCloud()) return;
    try {
      await flush();
      const id = await store.createRoom(nbId, p.id, { nbName: nb?.name, title: p.title });
      if (p.id !== pageId || !room) await openPage(nbId, p.id);
      setShareBox({
        kind: "live", link: `${location.origin}${location.pathname}?room=${id}`,
        onStop: async () => {
          setShareBox(null);
          const d = editorRef.current?.getData();
          if (d && p.id === pageId) await store.savePage(nbId, p.id, { ...d, ...metaRef.current }); // keep everyone's latest work
          roomRef.current?.close(); roomRef.current = null; setRoom(null);
          await store.stopRoom(nbId, p.id, id);
          await openPage(nbId, p.id);
          toast("Live editing stopped. The page keeps everything that was written.", "success");
        },
      });
    } catch (e) { toast("Could not start live editing: " + (e.message || e) + " (check the Firestore rules in README)", "error"); }
  }

  async function toggleFav(p) {
    if (nbId === SHARED_NB) return;
    const fav = !p.fav;
    setPages((l) => l.map((x) => (x.id === p.id ? { ...x, fav } : x)));
    try { await store.setPageFav(nbId, p.id, fav); }
    catch (e) { toast("Could not save favorite: " + (e.message || e), "error"); }
  }

  /* ------------------------------------------------------- export/import */
  async function exportPNG() {
    const blob = await editorRef.current?.exportPNG();
    if (blob) downloadBlob(blob, `${nb?.name || "notebook"} - ${pg?.title || "page"}.png`);
  }
  async function exportPDF() {
    const blob = await editorRef.current?.exportPDF();
    if (blob) downloadBlob(blob, `${nb?.name || "notebook"} - ${pg?.title || "page"}.pdf`);
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
  const pdfRef = useRef(null);
  const [pdfBusy, setPdfBusy] = useState(null);

  // PDF -> a new notebook with one page per PDF page; the PDF page is a locked picture you write on.
  async function importPDF(file) {
    if (!file || !store) return;
    setPdfBusy({ name: file.name, done: 0, count: 0 });
    try {
      const { pdfToImages } = await import("./lib/pdfImport.js");
      const { pages: imgs, total } = await pdfToImages(file, { onProgress: (done, count) => setPdfBusy({ name: file.name, done, count }) });
      await flush();
      const name = file.name.replace(/\.pdf$/i, "").trim() || "PDF";
      const book = await store.createNotebook(name, NB_COLORS[notebooks.length % NB_COLORS.length]);
      let first = null;
      for (let i = 0; i < imgs.length; i++) {
        const W = 794, H = Math.round(W * imgs[i].ratio);
        const pic = { id: "pdf" + i + Math.random().toString(36).slice(2, 8), type: "image", x: 0, y: 0, w: W, h: H, src: imgs[i].src, opacity: 1, locked: true };
        const p = await store.createPage(book.id, `Page ${i + 1}`, { bg: "plain", objects: [pic] });
        if (!first) first = p;
      }
      await loadNotebooks(book.id, first?.id);
      toast(total > imgs.length ? `Imported the first ${imgs.length} of ${total} pages.` : `"${name}" is ready – write on it with the pen.`, "success");
    } catch (e) {
      console.error(e);
      toast("Could not open this PDF: " + (e.message || e), "error");
    }
    setPdfBusy(null);
  }
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
      if (present) return;
      if (e.key === "F" && e.shiftKey) toggleFullscreen();
      else if (e.key === "f") setFocus((f) => !f);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------------------------------------------------------------- UI */
  useEffect(() => {
    const p = pages.find((x) => x.id === pageId);
    if (!nbId || !p) return;
    setRecent((list) => {
      const next = [{ nbId, pageId, title: p.title, icon: p.icon || null }, ...list.filter((r) => r.pageId !== pageId)].slice(0, 8);
      try { localStorage.setItem("nb-recent", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [nbId, pageId, pages]);
  useEffect(() => { if (present && presentFs.current && !fs) { presentFs.current = false; setPresent(false); } }, [fs]); // Esc left full screen
  useEffect(() => { // ?room=ID: join a live page someone sent you
    const id = urlParam("room");
    if (!id || !store) return;
    if (store.kind !== "cloud") { toast("Sign in with Google to join a live page.", "info"); return; }
    dropParam("room");
    store.joinRoom(id).then(({ ownerIsMe }) => {
      if (ownerIsMe) toast("That is your own live page – open it from your notebook.", "info");
      else { toast("You joined a live page – it is under “Shared with me”.", "success"); loadNotebooks(SHARED_NB, id); }
    }).catch((e) => toast(e.message || "Could not join the live page.", "error"));
  }, [store]);
  useEffect(() => () => roomRef.current?.close(), []);
  // (hook: must stay above the early returns below)
  // Search inside notes: save the open page first so its newest words are found.
  const searchNotes = useCallback(async (q) => { await flush(); return store ? store.searchPages(q) : []; }, [store, flush]);

  if (shareView) return <SharedView id={shareView} theme={theme === "red" ? "dark" : theme} />;
  if (phase === "boot") return <div className="boot"><div className="spinner" /></div>;
  if (phase === "login") return <Login onGoogle={doGoogle} onLocal={doLocal} busy={signingIn} />;

  const mode = store?.kind || "local";
  const toggleHeader = () => setHeaderCollapsed((c) => { localStorage.setItem("nb-header-collapsed", c ? "0" : "1"); return !c; });

  const exportItems = [
    { label: "Page as PDF", icon: FileText, onClick: exportPDF, disabled: !pageId },
    { label: "Page as PNG image", icon: FileImage, onClick: exportPNG, disabled: !pageId },
    { label: "Page as JSON", icon: FileJson, onClick: exportPageJSON, disabled: !pageId },
    { label: "Whole notebook as JSON", icon: BookOpen, onClick: exportNotebookJSON, disabled: !nbId },
    { type: "sep" },
    { label: "Import PDF to write on…", icon: FileUp, onClick: () => pdfRef.current?.click() },
    { label: "Import from JSON…", icon: Upload, onClick: () => importRef.current?.click() },
  ];
  const accountItems = [
    mode === "cloud"
      ? { type: "label", title: user?.displayName || "Signed in", sub: user?.email }
      : { type: "label", title: "Local mode", sub: cloudConfigured ? "Notes stay in this browser" : "Add Firebase keys to enable cloud sync" },
    { type: "sep" },
    installEvt && { label: "Install app", icon: MonitorDown, onClick: installApp },
    mode === "cloud" && hasLocalData() && { label: "Copy local notebooks to cloud", icon: CloudUpload, onClick: uploadLocal },
    mode === "cloud" && { label: "Sign out", icon: LogOut, onClick: async () => { await flush(); signOutUser(); } },
    mode === "local" && cloudConfigured && { label: "Sign in for cloud sync", icon: LogIn, onClick: () => setPhase("login") },
    { type: "sep" },
    { label: "Lock now", icon: Lock, hint: unlockedUntil() ? `asks again ${new Date(unlockedUntil()).toLocaleDateString()}` : "",
      onClick: async () => { await flush(); lockApp(); location.reload(); } },
  ];
  const aiItems = [
    { label: "Ask your notes…", icon: MessagesSquare, onClick: () => setShowAsk(true) },
    { label: "Quiz me (flashcards)", icon: Brain, onClick: quizMe, disabled: !pageId },
    { label: dueCount ? `Review cards (${dueCount} due)` : "Review cards", icon: Repeat, onClick: () => setShowReview(true) },
    { label: "Make cards from {{blanks}}", icon: Repeat, onClick: clozeFromPage, disabled: !pageId },
    { label: "Generate image…", icon: ImagePlus, onClick: () => setAiModal({ mode: "canvas" }), disabled: !pageId },
    { label: "Generate page cover…", icon: ImageIcon, onClick: () => setAiModal({ mode: "cover" }), disabled: !pageId },
    { type: "sep" },
    { type: "label", title: "Write with AI", sub: "Select a text or sticky note first" },
    ...Object.entries(TEXT_ACTIONS).map(([id, a]) => ({ label: a.label, icon: Wand2, onClick: () => editorRef.current?.aiText(id), disabled: !pageId })),
    { type: "sep" },
    { label: "Voice typing (English)", icon: Mic, onClick: () => editorRef.current?.dictate("en-US"), disabled: !pageId },
    { label: "Voice typing (বাংলা)", icon: Mic, onClick: () => editorRef.current?.dictate("bn-BD"), disabled: !pageId },
  ];

  const nbMenu = (n) => n.virtual ? [{ type: "label", title: "Shared with me", sub: "Live pages other people invited you to" }] : [
    { label: "Rename", icon: Pencil, onClick: () => renameNotebook(n) },
    { label: "Move to folder…", icon: FolderInput, onClick: () => setMoveNb(n) },
    { type: "colors", colors: NB_COLORS, value: n.color, onPick: (c) => recolorNotebook(n, c) },
    { type: "sep" },
    { label: "Move to Trash", icon: Trash2, danger: true, onClick: () => deleteNotebook(n) },
  ];
  const folderMenu = (f) => [
    { label: "New notebook here", icon: BookOpen, onClick: () => newNotebook(f.id) },
    { label: "New folder inside", icon: FolderPlus, onClick: () => newFolder(f.id) },
    { label: "Rename", icon: Pencil, onClick: () => renameFolder(f) },
    { type: "sep" },
    { label: "Delete folder", icon: Trash2, danger: true, onClick: () => deleteFolder(f) },
  ];
  const pageMenu = (p) => nbId === SHARED_NB ? [
    { type: "label", title: "Live page", sub: "Shared with you" },
    { label: "Leave this page", icon: LogOut, danger: true, onClick: () => deletePage(p) },
  ] : [
    { label: "Share read-only link…", icon: Link2, onClick: () => sharePage(p) },
    { label: "Collaborate live…", icon: Users, onClick: () => goLive(p) },
    { type: "sep" },
    { label: "Rename", icon: Pencil, onClick: () => renamePage(p) },
    { label: "Duplicate", icon: Copy, onClick: () => duplicatePage(p) },
    { type: "sep" },
    { label: p.fav ? "Remove from favorites" : "Add to favorites", icon: Star, onClick: () => toggleFav(p) },
    { label: "Move to Trash", icon: Trash2, danger: true, onClick: () => deletePage(p) },
  ];

  const openResult = (r) => { setSidebarOpen(false); openNotebook(r.nbId, r.id); };

  const commands = [
    ...pages.map((p) => ({ id: "pg" + p.id, label: p.title, group: "Page", icon: FileText, run: () => openPage(nbId, p.id) })),
    ...notebooks.map((n) => ({ id: "nb" + n.id, label: n.name, group: "Notebook", icon: BookOpen, run: () => openNotebook(n.id) })),
    { id: "a-newpage", label: "New page…", group: "Action", icon: Plus, keywords: "template add", run: askNewPage },
    installEvt && { id: "a-install", label: "Install app", group: "Action", icon: MonitorDown, keywords: "pwa home screen download", run: installApp },
    { id: "a-importpdf", label: "Import PDF to write on…", group: "Action", icon: FileUp, keywords: "slides book annotate pdf", run: () => pdfRef.current?.click() },
    { id: "a-newnb", label: "New notebook…", group: "Action", icon: BookOpen, run: newNotebook },
    { id: "a-cover", label: "Change page cover…", group: "Action", icon: ImageIcon, keywords: "banner", run: () => pageId && setShowCover(true) },
    { id: "a-ask", label: "AI: Ask your notes (questions about everything you wrote)", group: "AI", icon: MessagesSquare, keywords: "chat question answer study", run: () => setShowAsk(true) },
    { id: "a-review", label: `Review flashcards${dueCount ? ` (${dueCount} due)` : ""}`, group: "Study", icon: Repeat, keywords: "spaced repetition anki practise", run: () => setShowReview(true) },
    { id: "a-cloze", label: "Make cards from {{blanks}} on this page", group: "Study", icon: Repeat, keywords: "cloze fill blank flashcard", run: clozeFromPage },
    { id: "a-quiz", label: "AI: Quiz me on this page (flashcards)", group: "AI", icon: Brain, keywords: "study test exam questions", run: quizMe },
    { id: "a-ai", label: "AI: generate image…", group: "AI", icon: Sparkles, keywords: "picture photo art", run: () => pageId && setAiModal({ mode: "canvas" }) },
    { id: "a-aicover", label: "AI: generate page cover…", group: "AI", icon: Sparkles, run: () => pageId && setAiModal({ mode: "cover" }) },
    ...Object.entries(TEXT_ACTIONS).map(([id, a]) => ({ id: "ai-" + id, label: `AI: ${a.label}`, group: "AI", icon: Wand2, run: () => editorRef.current?.aiText(id) })),
    { id: "a-dict", label: "Voice typing (English)", group: "AI", icon: Mic, keywords: "dictate speak microphone", run: () => editorRef.current?.dictate("en-US") },
    { id: "a-dictbn", label: "Voice typing (বাংলা)", group: "AI", icon: Mic, keywords: "dictate bangla bengali", run: () => editorRef.current?.dictate("bn-BD") },
    { id: "a-fullscreen", label: "Toggle full screen", group: "View", icon: Maximize, run: () => toggleFullscreen() },
    { id: "a-focus", label: "Toggle focus mode", group: "View", icon: Focus, run: () => setFocus((f) => !f) },
    { id: "a-side", label: "Open / close menu", group: "View", icon: PanelLeft, run: () => setSidebarOpen((o) => !o) },
    { id: "a-read", label: readMode ? "Enable editing" : "Read mode (no accidental edits)", group: "View", icon: BookOpen, keywords: "lock view only reading", run: () => setReadMode(!readMode) },
    { id: "a-present", label: "Present this page (Sections become slides)", group: "View", icon: Presentation, keywords: "slides slideshow show", run: startPresent },
    { id: "a-theme", label: "Change theme (system / light / dark / dark red)", group: "View", icon: Sun, run: cycleTheme },
    { id: "a-fit", label: "Zoom to fit", group: "View", icon: Maximize, run: () => editorRef.current?.fit() },
    { id: "a-keys", label: "Keyboard shortcuts", group: "View", icon: Keyboard, run: () => editorRef.current?.toggleHelp() },
    { id: "a-pdf", label: "Export page as PDF", group: "Export", icon: Download, run: exportPDF },
    { id: "a-png", label: "Export page as PNG", group: "Export", icon: Download, run: exportPNG },
    { id: "a-json", label: "Export page as JSON", group: "Export", icon: FileJson, run: exportPageJSON },
    { id: "clear-ink", label: "Delete all drawings on this page", group: "Page", icon: PenOff, run: () => editorRef.current?.clearPage("clear-ink") },
    { id: "clear-all", label: "Clear whole page", group: "Page", icon: Eraser, run: () => editorRef.current?.clearPage("clear-all") },
    ...TOOLS.filter((t) => t !== "sep" && !t.action).map((t) => ({ id: "tool-" + t.id, label: `Tool: ${t.label}`, group: "Tool", icon: t.icon, run: () => editorRef.current?.setTool(t.id) })),
  ].filter(Boolean);

  return (
    <div className={`shell ${focus || present ? "focus" : ""} ${present ? "presenting" : ""}`} style={{ "--sb-w": `${sidebarW}px` }}>
      <Sidebar
        open={sidebarOpen && !focus && !present} onClose={() => setSidebarOpen(false)}
        width={sidebarW} onResize={setSidebarW}
        notebooks={notebooks} pages={pages} nbId={nbId} pageId={pageId}
        query={query} setQuery={setQuery}
        onOpenNb={(id) => { if (id !== nbId) openNotebook(id); if (window.innerWidth <= 860) setSidebarOpen(false); }}
        onOpenPage={(id) => { if (id !== pageId) openPage(nbId, id); setSidebarOpen(false); }}
        onNewNb={() => newNotebook()} onNewFolder={() => newFolder()} folders={folders} folderMenu={folderMenu} onNewPage={askNewPage} nbMenu={nbMenu} pageMenu={pageMenu} mode={mode}
        onSearchNotes={searchNotes} onOpenResult={openResult} onToggleFav={toggleFav}
        recent={recent.filter((r) => r.pageId !== pageId && notebooks.some((n) => n.id === r.nbId)).slice(0, 4).map((r) => ({ ...r, nbName: notebooks.find((n) => n.id === r.nbId)?.name, color: notebooks.find((n) => n.id === r.nbId)?.color }))} onImportPDF={() => pdfRef.current?.click()}
        dueCount={dueCount} onOpenReview={() => { setShowReview(true); setSidebarOpen(false); }}
        trashCount={trashCount} onOpenTrash={() => { setShowTrash(true); setSidebarOpen(false); }}
      />
      {sidebarOpen && !focus && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        {!focus && !present && (
          <TopBar
            onToggleSidebar={() => setSidebarOpen((o) => !o)}
            nbName={nb?.name || "Notebook Studio"} nbColor={nb?.color} pageTitle={pg?.title} onRenamePage={() => pg && renamePage(pg)}
            status={status} theme={themePref} onCycleTheme={cycleTheme}
            exportItems={exportItems} accountItems={accountItems} aiItems={aiItems} user={user} mode={mode}
            onPalette={() => setShowPalette(true)} onFocus={() => setFocus(true)} onFullscreen={toggleFullscreen} fullscreen={fs}
            toolbarSlotRef={setToolbarSlot} readMode={readMode} onReadMode={setReadMode} onPresent={startPresent}
          />
        )}

        <div className="stage">
          {pageData && pageId && !focus && !present && (
            <PageHeader
              cover={meta.cover} icon={meta.icon} title={pg?.title} collapsed={headerCollapsed} onToggle={toggleHeader}
              onTitle={(t) => pg && renamePage(pg, t)} onIcon={(e) => updateMeta({ icon: e })}
              onCover={() => setShowCover(true)} onRemoveCover={() => updateMeta({ cover: null })} readOnly={readMode}
            />
          )}
          <div className="editor-host">
            {pageData && pageId && (
              <Editor key={pageId} ref={editorRef} initial={pageData} theme={theme === "red" ? "dark" : theme} onChange={onEditorChange} onToast={toast}
                onOpenCover={() => setShowCover(true)} toolbarSlot={present ? null : toolbarSlot} readOnly={readMode} present={present} onExitPresent={stopPresent} room={room} />
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
          {focus && !present && <button className="focus-exit glass" onClick={() => setFocus(false)}><X size={14} /> Exit focus</button>}
        </div>
      </main>

      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importPDF(f); }} />
      {pdfBusy && (
        <div className="pdf-busy glass" role="status">
          <span className="spinner sm" />
          <span><strong>Importing PDF</strong><small>{pdfBusy.count ? `Page ${pdfBusy.done} of ${pdfBusy.count}` : pdfBusy.name}</small></span>
        </div>
      )}
      <input ref={importRef} type="file" accept="application/json,.json" hidden
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); }} />

      {showTemplates && <TemplatePicker onPick={createFromTemplate} onClose={() => setShowTemplates(false)} />}
      {showAsk && store && <AskModal onClose={() => setShowAsk(false)} onOpen={(p) => openResult({ nbId: p.nbId, id: p.id })}
        getPages={async () => { await flush(); return store.pageTexts(); }} />}
      {flash && <FlashcardsModal notes={flash.notes} title={flash.title} onClose={() => setFlash(null)} onAddToPage={(cards) => editorRef.current?.addCards(cards)} onSaveDeck={saveDeck} />}
      {showReview && store && <ReviewModal store={store} onClose={() => { setShowReview(false); refreshDue(); }} onChanged={refreshDue}
        onOpenSource={(src) => openResult({ nbId: src.nbId, id: src.pageId })} />}
      {shareBox && <ShareModal kind={shareBox.kind} link={shareBox.link} onStop={shareBox.onStop} onClose={() => setShareBox(null)} />}
      {moveNb && (
        <div className="backdrop" onMouseDown={() => setMoveNb(null)}>
          <div className="modal move-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-top"><h3><FolderInput size={18} /> Move “{moveNb.name}”</h3><button className="icon-btn" onClick={() => setMoveNb(null)}><X size={16} /></button></div>
            <div className="move-list">
              <button className={`move-item ${!moveNb.folder ? "on" : ""}`} onClick={() => moveNotebook(moveNb, null)}><BookOpen size={15} /> Top level (no folder)</button>
              {(function tree(parent, depth) {
                return folders.filter((f) => (f.parent || null) === parent).flatMap((f) => [
                  <button key={f.id} className={`move-item ${moveNb.folder === f.id ? "on" : ""}`} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => moveNotebook(moveNb, f.id)}><FolderInput size={15} /> {f.name}</button>,
                  ...tree(f.id, depth + 1),
                ]);
              })(null, 0)}
            </div>
            <div className="modal-actions"><button className="btn" onClick={() => { setMoveNb(null); newFolder(); }}><FolderPlus size={14} /> New folder</button></div>
          </div>
        </div>
      )}
      {showTrash && store && (
        <TrashModal store={store} onClose={() => setShowTrash(false)} onChanged={refreshTrash}
          onRestored={(it) => (it.kind === "notebook" ? loadNotebooks(it.id) : loadNotebooks(it.nbId, it.id))} />
      )}
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
      {showPalette && <CommandPalette commands={commands} onClose={() => setShowPalette(false)} onSearch={searchNotes} onOpenResult={openResult} />}
    </div>
  );
}

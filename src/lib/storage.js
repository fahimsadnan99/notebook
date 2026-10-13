// Storage layer. Same API for local (browser) and cloud (Firebase Firestore).
const e = import.meta.env;
export const cloudConfigured = !!(e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_PROJECT_ID);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const TRASH_DAYS = 30; // trashed items are deleted for good after this many days
const TRASH_MS = TRASH_DAYS * 24 * 3600 * 1000;
const KEY = "notebook-app-v1"; // same key as the first versions, so old notes still open

// A page = { title, icon, cover, objects, view, bg, paper, gap }
// Words written on a page (text boxes, sticky notes, section titles), used by "search inside notes".
export function textOf(objects = [], recs = []) {
  const parts = (recs || []).map((r) => (r.transcript || []).map((t) => t.text).join(" "));
  for (const o of objects) {
    if (o.type === "text" || o.type === "sticky") parts.push(o.text || "");
    else if (o.type === "section") parts.push(o.title || "");
  }
  return parts.join(" \n ").replace(/\s+/g, " ").trim().slice(0, 8000);
}

// Find q in a page's title or words. Returns null or { snippet } with a little text around the match.
export function matchPage(title, text, q) {
  const t = q.trim().toLowerCase();
  if (!t) return null;
  if ((title || "").toLowerCase().includes(t)) return { snippet: text ? text.slice(0, 80) : "", inTitle: true };
  const i = (text || "").toLowerCase().indexOf(t);
  if (i < 0) return null;
  const a = Math.max(0, i - 30), b = Math.min(text.length, i + t.length + 50);
  return { snippet: (a > 0 ? "…" : "") + text.slice(a, b) + (b < text.length ? "…" : ""), inTitle: false };
}

export const pageFromInit = (init = {}) => ({
  objects: init.objects || [], view: init.view || null, bg: init.bg || "dots",
  paper: init.paper || null, gap: init.gap || null, sheets: init.sheets || 0, cover: init.cover || null, icon: init.icon || null,
  recs: init.recs || [], marks: init.marks || [],
});

export function createLocalStore() {
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || { notebooks: {} }; }
    catch { return { notebooks: {} }; }
  };
  const write = (db) => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { throw new Error("Browser storage is full. Sign in to use cloud storage, or delete some pages/images."); }
  };
  const sorted = (o) => Object.values(o).sort((a, b) => a.createdAt - b.createdAt);

  return {
    kind: "local",
    async listNotebooks() {
      return sorted(read().notebooks).filter((n) => !n.deletedAt).map(({ id, name, color, folder }) => ({ id, name, color: color || "#6366f1", folder: folder || null }));
    },
    async createNotebook(name, color) {
      const db = read(); const id = uid();
      db.notebooks[id] = { id, name, color, createdAt: Date.now(), pages: {} };
      write(db);
      return { id, name, color };
    },
    async updateNotebook(id, patch) {
      const db = read();
      if (db.notebooks[id]) { Object.assign(db.notebooks[id], patch); write(db); }
    },
    // Delete = move to Trash. purge* deletes for good, restore* brings it back.
    async deleteNotebook(id) { const db = read(); if (db.notebooks[id]) { db.notebooks[id].deletedAt = Date.now(); write(db); } },
    async purgeNotebook(id) { const db = read(); delete db.notebooks[id]; write(db); },
    async restoreNotebook(id) { const db = read(); if (db.notebooks[id]) { delete db.notebooks[id].deletedAt; write(db); } },
    async listPages(nbId) {
      const nb = read().notebooks[nbId];
      return nb ? sorted(nb.pages).filter((p) => !p.deletedAt).map(({ id, title, icon, fav }) => ({ id, title, icon: icon || null, fav: !!fav })) : [];
    },
    async createPage(nbId, title, init) {
      const db = read(); const id = uid();
      db.notebooks[nbId].pages[id] = { id, title, createdAt: Date.now(), ...pageFromInit(init) };
      write(db);
      return { id, title, icon: init?.icon || null };
    },
    async setPageFav(nbId, pageId, fav) {
      const db = read(), p = db.notebooks[nbId]?.pages[pageId];
      if (p) { if (fav) p.fav = true; else delete p.fav; write(db); }
    },
    async renamePage(nbId, pageId, title) {
      const db = read();
      const p = db.notebooks[nbId]?.pages[pageId];
      if (p) { p.title = title; write(db); }
    },
    async deletePage(nbId, pageId) {
      const db = read(), p = db.notebooks[nbId]?.pages[pageId];
      if (p) { p.deletedAt = Date.now(); write(db); }
    },
    async purgePage(nbId, pageId) { const db = read(); delete db.notebooks[nbId]?.pages[pageId]; write(db); },
    async restorePage(nbId, pageId) {
      const db = read(), p = db.notebooks[nbId]?.pages[pageId];
      if (p) { delete p.deletedAt; write(db); }
    },
    // Folders hold notebooks and other folders (parent = folder id, or null at the top).
    async listFolders() { return Object.values(read().folders || {}).sort((a, b) => a.createdAt - b.createdAt); },
    async createFolder(name, parent = null) {
      const db = read(); db.folders = db.folders || {};
      const f = { id: uid(), name, parent, createdAt: Date.now() };
      db.folders[f.id] = f; write(db); return f;
    },
    async updateFolder(id, patch) { const db = read(); if (db.folders?.[id]) { Object.assign(db.folders[id], patch); write(db); } },
    // Deleting a folder keeps its contents: they move up to the parent folder.
    async deleteFolder(id) {
      const db = read(), f = db.folders?.[id];
      if (!f) return;
      for (const x of Object.values(db.folders)) if (x.parent === id) x.parent = f.parent || null;
      for (const n of Object.values(db.notebooks)) if (n.folder === id) n.folder = f.parent || null;
      delete db.folders[id]; write(db);
    },
    // Review deck (spaced repetition cards).
    async listCards() { return Object.values(read().cards || {}); },
    async saveCards(cards) { const db = read(); db.cards = db.cards || {}; for (const c of cards) db.cards[c.id] = c; write(db); },
    async deleteCard(id) { const db = read(); if (db.cards) { delete db.cards[id]; write(db); } },
    async pageTexts() {
      const out = [];
      for (const nb of Object.values(read().notebooks)) {
        if (nb.deletedAt) continue;
        for (const p of Object.values(nb.pages)) {
          if (!p.deletedAt) out.push({ nbId: nb.id, nbName: nb.name, color: nb.color || "#6366f1", id: p.id, title: p.title, icon: p.icon || null, text: textOf(p.objects, p.recs) });
        }
      }
      return out;
    },
    async searchPages(q) {
      const out = [];
      for (const nb of Object.values(read().notebooks)) {
        if (nb.deletedAt) continue;
        for (const p of Object.values(nb.pages)) {
          if (p.deletedAt) continue;
          const m = matchPage(p.title, textOf(p.objects, p.recs), q);
          if (m) out.push({ nbId: nb.id, nbName: nb.name, color: nb.color || "#6366f1", id: p.id, title: p.title, icon: p.icon || null, ...m });
        }
      }
      return out.sort((a, b) => b.inTitle - a.inTitle).slice(0, 40);
    },
    async listTrash() {
      const db = read(), now = Date.now(), items = [];
      let changed = false;
      for (const nb of Object.values(db.notebooks)) {
        if (nb.deletedAt && now - nb.deletedAt > TRASH_MS) { delete db.notebooks[nb.id]; changed = true; continue; }
        if (nb.deletedAt) {
          items.push({ kind: "notebook", id: nb.id, name: nb.name, color: nb.color || "#6366f1", deletedAt: nb.deletedAt, count: Object.values(nb.pages).filter((p) => !p.deletedAt).length });
          continue;
        }
        for (const p of Object.values(nb.pages)) {
          if (!p.deletedAt) continue;
          if (now - p.deletedAt > TRASH_MS) { delete nb.pages[p.id]; changed = true; continue; }
          items.push({ kind: "page", id: p.id, nbId: nb.id, nbName: nb.name, color: nb.color || "#6366f1", title: p.title, icon: p.icon || null, deletedAt: p.deletedAt });
        }
      }
      if (changed) write(db);
      return items.sort((a, b) => b.deletedAt - a.deletedAt);
    },
    async loadPage(nbId, pageId) {
      const p = read().notebooks[nbId]?.pages[pageId];
      return { title: p?.title || "", ...pageFromInit(p || {}) };
    },
    async savePage(nbId, pageId, data) {
      const db = read();
      const p = db.notebooks[nbId]?.pages[pageId];
      if (!p) return;
      Object.assign(p, pageFromInit(data));
      write(db);
    },
  };
}

export function hasLocalData() {
  try {
    const db = JSON.parse(localStorage.getItem(KEY));
    return !!db && Object.values(db.notebooks || {}).some((n) => !n.deletedAt);
  } catch { return false; }
}

// Copy every notebook and page from one store to another (used: local -> cloud, after sign in).
export async function copyStore(src, dst) {
  const nbs = await src.listNotebooks();
  for (const nb of nbs) {
    const created = await dst.createNotebook(nb.name, nb.color);
    for (const pg of await src.listPages(nb.id)) {
      const data = await src.loadPage(nb.id, pg.id);
      await dst.createPage(created.id, pg.title, data);
    }
  }
  return nbs.length;
}

/* ---- Cloud helpers (Firebase is loaded only when configured) ---- */
const cloud = () => import("./firebase.js");
export async function watchAuth(cb) {
  const m = await cloud();
  return m.watchAuth(cb);
}
export async function signInGoogle() { return (await cloud()).signInGoogle(); }
export async function signOutUser() { return (await cloud()).signOutUser(); }

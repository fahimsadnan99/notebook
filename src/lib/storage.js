// Storage layer. Same API for local (browser) and cloud (Firebase Firestore).
const e = import.meta.env;
export const cloudConfigured = !!(e.VITE_FIREBASE_API_KEY && e.VITE_FIREBASE_PROJECT_ID);

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const KEY = "notebook-app-v1"; // same key as the first versions, so old notes still open

// A page = { title, icon, cover, objects, view, bg, paper, gap }
export const pageFromInit = (init = {}) => ({
  objects: init.objects || [], view: init.view || null, bg: init.bg || "dots",
  paper: init.paper || null, gap: init.gap || null, sheets: init.sheets || 0, cover: init.cover || null, icon: init.icon || null,
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
      return sorted(read().notebooks).map(({ id, name, color }) => ({ id, name, color: color || "#6366f1" }));
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
    async deleteNotebook(id) { const db = read(); delete db.notebooks[id]; write(db); },
    async listPages(nbId) {
      const nb = read().notebooks[nbId];
      return nb ? sorted(nb.pages).map(({ id, title, icon }) => ({ id, title, icon: icon || null })) : [];
    },
    async createPage(nbId, title, init) {
      const db = read(); const id = uid();
      db.notebooks[nbId].pages[id] = { id, title, createdAt: Date.now(), ...pageFromInit(init) };
      write(db);
      return { id, title, icon: init?.icon || null };
    },
    async renamePage(nbId, pageId, title) {
      const db = read();
      const p = db.notebooks[nbId]?.pages[pageId];
      if (p) { p.title = title; write(db); }
    },
    async deletePage(nbId, pageId) { const db = read(); delete db.notebooks[nbId].pages[pageId]; write(db); },
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
    return !!db && Object.keys(db.notebooks || {}).length > 0;
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

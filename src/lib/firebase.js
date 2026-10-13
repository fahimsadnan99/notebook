// Loaded only when Firebase keys exist (dynamic import from storage.js).
import { initializeApp } from "firebase/app";
import { textOf, matchPage } from "./storage.js";
import { secretId } from "./collab.js";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy, where, deleteField, onSnapshot, writeBatch,
} from "firebase/firestore";

const e = import.meta.env;
const firebaseConfig = {
  apiKey: e.VITE_FIREBASE_API_KEY,
  authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: e.VITE_FIREBASE_PROJECT_ID,
  storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: e.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Offline cache: notes stay readable/editable without internet and sync later.
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch {
  db = getFirestore(app);
}

const TRASH_MS = 30 * 24 * 3600 * 1000; // keep in sync with TRASH_DAYS in storage.js
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => cb(user ? createCloudStore(user) : null, user));
}
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);

// Drawing data (objects/view/bg/paper/gap) is one JSON string; cover + icon are separate fields.
const packData = (d) => JSON.stringify({ objects: d.objects || [], view: d.view || null, bg: d.bg || "dots", paper: d.paper || null, gap: d.gap || null, sheets: d.sheets || 0, recs: d.recs || [], marks: d.marks || [] });

function parsePage(d) {
  let parsed = {};
  try { parsed = d.data ? JSON.parse(d.data) : {}; } catch { parsed = {}; }
  if (Array.isArray(parsed)) parsed = { objects: parsed };
  return {
    title: d.title || "", icon: d.icon || null, cover: d.cover || null,
    objects: parsed.objects || [], view: parsed.view || null, bg: parsed.bg || "dots",
    paper: parsed.paper || null, gap: parsed.gap || null, sheets: parsed.sheets || 0, recs: parsed.recs || [], marks: parsed.marks || [],
    shareId: d.shareId || null, roomId: d.roomId || null,
  };
}

/* ------------------------------------------------------------ share links */
// shares/{id}: a read-only copy of one page that anyone with the link can open (kept up to date on save).
const shareDoc = (id) => doc(db, "shares", id);
export async function loadShare(id) {
  const snap = await getDoc(shareDoc(id));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { ...parsePage(d), title: d.title || "", nbName: d.nbName || "", updatedAt: d.updatedAt || 0 };
}

/* ------------------------------------------------------- live collaboration */
// rooms/{roomId} = { owner, title, nbName, bg, paper, gap, sheets, online: { uid: { name, photo, at } } }
// rooms/{roomId}/objects/{objId} = { j: JSON of the object, z: stacking order, by: uid }
// (objects are stored as JSON text because Firestore cannot hold arrays inside arrays, like pen points)
const roomDoc = (id) => doc(db, "rooms", id);
const roomObjs = (id) => collection(db, "rooms", id, "objects");

async function writeObjects(roomId, sets, dels, all, uid) {
  const z = new Map(all.map((o, i) => [o.id, i]));
  const ops = [...sets.map((o) => ["set", o]), ...dels.map((id) => ["del", id])];
  for (let i = 0; i < ops.length; i += 400) { // a batch holds at most 500 writes
    const b = writeBatch(db);
    for (const [kind, v] of ops.slice(i, i + 400)) {
      if (kind === "set") b.set(doc(roomObjs(roomId), v.id), { j: JSON.stringify(v), z: z.get(v.id) ?? 0, by: uid, at: Date.now() });
      else b.delete(doc(roomObjs(roomId), v));
    }
    await b.commit();
  }
}

export async function openRoom(roomId, user) {
  const meta = await getDoc(roomDoc(roomId));
  if (!meta.exists()) throw new Error("This live page no longer exists.");
  const snap = await getDocs(query(roomObjs(roomId), orderBy("z")));
  const objects = snap.docs.map((d) => { try { return JSON.parse(d.data().j); } catch { return null; } }).filter(Boolean);
  const unsubs = [];
  const me = { name: user.displayName || user.email || "Someone", photo: user.photoURL || null };
  const beat = () => updateDoc(roomDoc(roomId), { [`online.${user.uid}`]: { ...me, at: Date.now() } }).catch(() => {});
  beat();
  const timer = setInterval(beat, 25000);
  return {
    id: roomId, meta: meta.data(), objects, uid: user.uid,
    // Changes made by other people (our own writes are skipped).
    subscribe(cb) {
      let first = true;
      const un = onSnapshot(roomObjs(roomId), (qs) => {
        if (first) { first = false; return; }
        const changes = [];
        for (const ch of qs.docChanges()) {
          if (ch.doc.metadata.hasPendingWrites) continue;
          if (ch.type === "removed") changes.push({ type: "del", id: ch.doc.id });
          else { try { changes.push({ type: "set", obj: JSON.parse(ch.doc.data().j) }); } catch { /* skip broken */ } }
        }
        if (changes.length) cb(changes);
      });
      unsubs.push(un);
      return un;
    },
    // Who is here right now (seen in the last ~70 seconds).
    onPeople(cb) {
      const un = onSnapshot(roomDoc(roomId), (d) => {
        const online = d.data()?.online || {}, now = Date.now();
        cb(Object.entries(online).filter(([, v]) => v && now - v.at < 70000).map(([uid, v]) => ({ uid, ...v })));
      });
      unsubs.push(un);
      return un;
    },
    write: (diff, all) => writeObjects(roomId, diff.sets, diff.dels, all, user.uid).catch((e) => console.error("live sync", e)),
    close() {
      clearInterval(timer); unsubs.forEach((u) => u());
      updateDoc(roomDoc(roomId), { [`online.${user.uid}`]: deleteField() }).catch(() => {});
    },
  };
}

// Virtual notebook that lists the live pages other people shared with you.
export const SHARED_NB = "__shared__";

export function createCloudStore(user) {
  const nbCol = () => collection(db, "users", user.uid, "notebooks");
  const pgCol = (nbId) => collection(db, "users", user.uid, "notebooks", nbId, "pages");
  return {
    kind: "cloud",
    async listNotebooks() {
      const joined = await getDocs(collection(db, "users", user.uid, "joined")).catch(() => null);
      const shared = joined && joined.size ? [{ id: SHARED_NB, name: "Shared with me", color: "#14b8a6", folder: null, virtual: true }] : [];
      return [...(await this._listNotebooks()), ...shared];
    },
    async _listNotebooks() {
      const snap = await getDocs(query(nbCol(), orderBy("createdAt")));
      return snap.docs.filter((d) => !d.data().deletedAt).map((d) => ({ id: d.id, name: d.data().name, color: d.data().color || "#6366f1", folder: d.data().folder || null }));
    },
    async createNotebook(name, color) {
      const id = uid();
      await setDoc(doc(nbCol(), id), { name, color, createdAt: Date.now() });
      return { id, name, color };
    },
    async updateNotebook(id, patch) { await updateDoc(doc(nbCol(), id), patch); },
    // Delete = move to Trash. purge* deletes for good, restore* brings it back.
    async deleteNotebook(id) { await updateDoc(doc(nbCol(), id), { deletedAt: Date.now() }); },
    async restoreNotebook(id) { await updateDoc(doc(nbCol(), id), { deletedAt: deleteField() }); },
    async purgeNotebook(id) {
      const pages = await getDocs(pgCol(id));
      await Promise.all(pages.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(nbCol(), id));
    },
    async listPages(nbId) {
      if (nbId === SHARED_NB) {
        const j = await getDocs(collection(db, "users", user.uid, "joined"));
        return j.docs.sort((a, b) => a.data().at - b.data().at).map((d) => ({ id: d.id, title: d.data().title + (d.data().ownerName ? ` · ${d.data().ownerName}` : ""), icon: "👥", fav: false }));
      }
      const snap = await getDocs(query(pgCol(nbId), orderBy("createdAt")));
      return snap.docs.filter((d) => !d.data().deletedAt).map((d) => ({ id: d.id, title: d.data().title, icon: d.data().icon || null, fav: !!d.data().fav }));
    },
    async createPage(nbId, title, init = {}) {
      this._idx = null;
      const id = uid();
      await setDoc(doc(pgCol(nbId), id), {
        title, createdAt: Date.now(), data: packData(init), cover: init.cover || null, icon: init.icon || null, searchText: textOf(init.objects, init.recs),
      });
      return { id, title, icon: init.icon || null };
    },
    async setPageFav(nbId, pageId, fav) { await updateDoc(doc(pgCol(nbId), pageId), { fav: fav ? true : deleteField() }); },
    async renamePage(nbId, pageId, title) { await updateDoc(doc(pgCol(nbId), pageId), { title }); },
    async deletePage(nbId, pageId) {
      // leave a live page that someone else shared
      if (nbId === SHARED_NB) return deleteDoc(doc(db, "users", user.uid, "joined", pageId));
      await updateDoc(doc(pgCol(nbId), pageId), { deletedAt: Date.now() }); },
    async restorePage(nbId, pageId) { await updateDoc(doc(pgCol(nbId), pageId), { deletedAt: deleteField() }); },
    async purgePage(nbId, pageId) { await deleteDoc(doc(pgCol(nbId), pageId)); },
    // Reads every page once, then answers from memory for a short while so typing does not cost extra reads.
    // Folders: users/{uid}/folders/{folderId} = { name, parent, createdAt }
    async listFolders() { return (await getDocs(collection(db, "users", user.uid, "folders"))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAt - b.createdAt); },
    async createFolder(name, parent = null) {
      const f = { name, parent, createdAt: Date.now() }, id = uid();
      await setDoc(doc(db, "users", user.uid, "folders", id), f); return { id, ...f };
    },
    async updateFolder(id, patch) { await updateDoc(doc(db, "users", user.uid, "folders", id), patch); },
    async deleteFolder(id) {
      const ref = doc(db, "users", user.uid, "folders", id), snap = await getDoc(ref);
      if (!snap.exists()) return;
      const parent = snap.data().parent || null;
      for (const d of (await getDocs(collection(db, "users", user.uid, "folders"))).docs) if (d.data().parent === id) await updateDoc(d.ref, { parent });
      for (const d of (await getDocs(nbCol())).docs) if (d.data().folder === id) await updateDoc(d.ref, { folder: parent });
      await deleteDoc(ref);
    },
    // Review deck (spaced repetition cards): users/{uid}/cards/{cardId}
    async listCards() { return (await getDocs(collection(db, "users", user.uid, "cards"))).docs.map((d) => d.data()); },
    async saveCards(cards) { await Promise.all(cards.map((c) => setDoc(doc(db, "users", user.uid, "cards", c.id), JSON.parse(JSON.stringify(c))))); },
    async deleteCard(id) { await deleteDoc(doc(db, "users", user.uid, "cards", id)); },
    async pageTexts() { await this.searchPages(""); return this._idx; },
    async searchPages(q) {
      if (!this._idx || Date.now() - this._idxAt > 30000) {
        const idx = [];
        for (const d of (await getDocs(nbCol())).docs) {
          const nb = d.data();
          if (nb.deletedAt) continue;
          for (const p of (await getDocs(pgCol(d.id))).docs) {
            const pd = p.data();
            if (pd.deletedAt) continue;
            const text = pd.searchText ?? (() => { const pp = parsePage(pd); return textOf(pp.objects, pp.recs); })(); // older pages have no searchText yet
            idx.push({ nbId: d.id, nbName: nb.name, color: nb.color || "#6366f1", id: p.id, title: pd.title, icon: pd.icon || null, text });
          }
        }
        this._idx = idx; this._idxAt = Date.now();
      }
      const out = [];
      for (const p of this._idx) {
        const m = matchPage(p.title, p.text, q);
        if (m) out.push({ ...p, text: undefined, ...m });
      }
      return out.sort((a, b) => b.inTitle - a.inTitle).slice(0, 40);
    },
    async listTrash() {
      const now = Date.now(), items = [];
      const nbs = await getDocs(nbCol());
      for (const d of nbs.docs) {
        const nb = { id: d.id, ...d.data() };
        if (nb.deletedAt && now - nb.deletedAt > TRASH_MS) { await this.purgeNotebook(nb.id); continue; }
        if (nb.deletedAt) {
          const pages = await getDocs(pgCol(nb.id));
          items.push({ kind: "notebook", id: nb.id, name: nb.name, color: nb.color || "#6366f1", deletedAt: nb.deletedAt, count: pages.docs.filter((p) => !p.data().deletedAt).length });
          continue;
        }
        const trashed = await getDocs(query(pgCol(nb.id), where("deletedAt", ">", 0)));
        for (const p of trashed.docs) {
          const pd = p.data();
          if (now - pd.deletedAt > TRASH_MS) { await deleteDoc(p.ref); continue; }
          items.push({ kind: "page", id: p.id, nbId: nb.id, nbName: nb.name, color: nb.color || "#6366f1", title: pd.title, icon: pd.icon || null, deletedAt: pd.deletedAt });
        }
      }
      return items.sort((a, b) => b.deletedAt - a.deletedAt);
    },
    async loadPage(nbId, pageId) {
      if (nbId === SHARED_NB) { // someone else's live page
        const m = await getDoc(roomDoc(pageId));
        if (!m.exists()) throw new Error("This live page was removed by its owner.");
        const r = m.data();
        return { title: r.title || "Live page", icon: null, cover: null, objects: [], view: null, bg: r.bg || "dots", paper: r.paper || null, gap: r.gap || null, sheets: r.sheets || 0, recs: [], marks: [], roomId: pageId, joined: true };
      }
      const snap = await getDoc(doc(pgCol(nbId), pageId));
      return parsePage(snap.exists() ? snap.data() : {});
    },
    async savePage(nbId, pageId, data) {
      if (nbId === SHARED_NB) return; // live pages sync through the room
      this._idx = null;
      await updateDoc(doc(pgCol(nbId), pageId), {
        data: packData(data), cover: data.cover || null, icon: data.icon || null, updatedAt: Date.now(), searchText: textOf(data.objects, data.recs),
      });
      if (data.shareId) { // keep the read-only link up to date
        await setDoc(shareDoc(data.shareId), { data: packData({ ...data, recs: [] }), cover: data.cover || null, icon: data.icon || null, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      }
    },
    /* share links */
    async createShare(nbId, pageId, info) {
      const page = await this.loadPage(nbId, pageId);
      if (page.shareId) return page.shareId;
      const id = secretId();
      await setDoc(shareDoc(id), {
        owner: user.uid, nbName: info.nbName || "", title: info.title || page.title || "", icon: page.icon || null, cover: page.cover || null,
        data: packData({ ...page, recs: [] }), updatedAt: Date.now(),
      });
      await updateDoc(doc(pgCol(nbId), pageId), { shareId: id });
      return id;
    },
    async removeShare(nbId, pageId, shareId) {
      await deleteDoc(shareDoc(shareId)).catch(() => {});
      await updateDoc(doc(pgCol(nbId), pageId), { shareId: deleteField() });
    },
    /* live collaboration */
    async createRoom(nbId, pageId, info) {
      const page = await this.loadPage(nbId, pageId);
      if (page.roomId) return page.roomId;
      const id = secretId();
      await setDoc(roomDoc(id), {
        owner: user.uid, ownerName: user.displayName || user.email || "", title: info.title || page.title || "Live page", nbName: info.nbName || "",
        bg: page.bg, paper: page.paper || null, gap: page.gap || null, sheets: page.sheets || 0, createdAt: Date.now(), online: {},
      });
      await writeObjects(id, page.objects, [], page.objects, user.uid);
      await updateDoc(doc(pgCol(nbId), pageId), { roomId: id });
      return id;
    },
    async stopRoom(nbId, pageId, roomId) { // the owner ends live mode; the page keeps its latest content
      await updateDoc(doc(pgCol(nbId), pageId), { roomId: deleteField() });
      const objs = await getDocs(roomObjs(roomId));
      for (let i = 0; i < objs.docs.length; i += 400) { const b = writeBatch(db); objs.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit(); }
      await deleteDoc(roomDoc(roomId));
    },
    async joinRoom(roomId) {
      const m = await getDoc(roomDoc(roomId));
      if (!m.exists()) throw new Error("This live page link is not valid any more.");
      const r = m.data();
      if (r.owner !== user.uid) await setDoc(doc(db, "users", user.uid, "joined", roomId), { title: r.title || "Live page", ownerName: r.ownerName || "", at: Date.now() });
      return { ownerIsMe: r.owner === user.uid };
    },
    openRoom: (roomId) => openRoom(roomId, user),
  };
}

// Loaded only when Firebase keys exist (dynamic import from storage.js).
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, orderBy,
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

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function watchAuth(cb) {
  return onAuthStateChanged(auth, (user) => cb(user ? createCloudStore(user) : null, user));
}
export const signInGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const signOutUser = () => signOut(auth);

// Drawing data (objects/view/bg/paper/gap) is one JSON string; cover + icon are separate fields.
const packData = (d) => JSON.stringify({ objects: d.objects || [], view: d.view || null, bg: d.bg || "dots", paper: d.paper || null, gap: d.gap || null, sheets: d.sheets || 0 });

function parsePage(d) {
  let parsed = {};
  try { parsed = d.data ? JSON.parse(d.data) : {}; } catch { parsed = {}; }
  if (Array.isArray(parsed)) parsed = { objects: parsed };
  return {
    title: d.title || "", icon: d.icon || null, cover: d.cover || null,
    objects: parsed.objects || [], view: parsed.view || null, bg: parsed.bg || "dots",
    paper: parsed.paper || null, gap: parsed.gap || null, sheets: parsed.sheets || 0,
  };
}

export function createCloudStore(user) {
  const nbCol = () => collection(db, "users", user.uid, "notebooks");
  const pgCol = (nbId) => collection(db, "users", user.uid, "notebooks", nbId, "pages");
  return {
    kind: "cloud",
    async listNotebooks() {
      const snap = await getDocs(query(nbCol(), orderBy("createdAt")));
      return snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color || "#6366f1" }));
    },
    async createNotebook(name, color) {
      const id = uid();
      await setDoc(doc(nbCol(), id), { name, color, createdAt: Date.now() });
      return { id, name, color };
    },
    async updateNotebook(id, patch) { await updateDoc(doc(nbCol(), id), patch); },
    async deleteNotebook(id) {
      const pages = await getDocs(pgCol(id));
      await Promise.all(pages.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(nbCol(), id));
    },
    async listPages(nbId) {
      const snap = await getDocs(query(pgCol(nbId), orderBy("createdAt")));
      return snap.docs.map((d) => ({ id: d.id, title: d.data().title, icon: d.data().icon || null }));
    },
    async createPage(nbId, title, init = {}) {
      const id = uid();
      await setDoc(doc(pgCol(nbId), id), {
        title, createdAt: Date.now(), data: packData(init), cover: init.cover || null, icon: init.icon || null,
      });
      return { id, title, icon: init.icon || null };
    },
    async renamePage(nbId, pageId, title) { await updateDoc(doc(pgCol(nbId), pageId), { title }); },
    async deletePage(nbId, pageId) { await deleteDoc(doc(pgCol(nbId), pageId)); },
    async loadPage(nbId, pageId) {
      const snap = await getDoc(doc(pgCol(nbId), pageId));
      return parsePage(snap.exists() ? snap.data() : {});
    },
    async savePage(nbId, pageId, data) {
      await updateDoc(doc(pgCol(nbId), pageId), {
        data: packData(data), cover: data.cover || null, icon: data.icon || null, updatedAt: Date.now(),
      });
    },
  };
}

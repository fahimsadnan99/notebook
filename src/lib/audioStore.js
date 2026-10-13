// Lecture audio lives in this browser (IndexedDB): recordings are too big for a Firestore page record.
// The page itself only keeps the recording's id, length and transcript, which do sync.
const DB = "nb-audio", STORE = "clips";

function open() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out && "result" in out ? out.result : undefined); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}

export const saveAudio = (id, blob) => tx("readwrite", (s) => s.put(blob, id));
export const loadAudio = (id) => tx("readonly", (s) => s.get(id)).then((b) => b || null);
export const deleteAudio = (id) => tx("readwrite", (s) => s.delete(id));

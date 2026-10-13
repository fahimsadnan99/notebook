// Live collaboration helpers (no Firebase here, so they can be tested on their own).
// Objects are immutable: an edited object is a new object, so "changed" = a different reference.

// What changed between two versions of the page's object list.
export function diffObjects(prev, next) {
  const before = new Map(prev.map((o) => [o.id, o]));
  const now = new Set(next.map((o) => o.id));
  return {
    sets: next.filter((o) => before.get(o.id) !== o),
    dels: prev.filter((o) => !now.has(o.id)).map((o) => o.id),
  };
}

// Apply changes from someone else: [{ type: "set", obj } | { type: "del", id }]. New objects go on top.
export function applyChanges(list, changes) {
  if (!changes.length) return list;
  const out = list.slice(), at = new Map(out.map((o, i) => [o.id, i]));
  const gone = new Set();
  for (const c of changes) {
    if (c.type === "del") { gone.add(c.id); continue; }
    gone.delete(c.obj.id);
    if (at.has(c.obj.id)) out[at.get(c.obj.id)] = c.obj;
    else { at.set(c.obj.id, out.length); out.push(c.obj); }
  }
  return gone.size ? out.filter((o) => !gone.has(o.id)) : out;
}

// Random id that is hard to guess (used in share / live links).
export function secretId(len = 22) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

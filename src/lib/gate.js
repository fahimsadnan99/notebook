// Access code gate: the site asks for a code before showing any notes.
// The code itself is not stored here – only a slow PBKDF2 hash of it, so reading the source does not reveal it.
// To change the code: hash the new one with the same salt/iterations and replace CODE_HASH.
const SALT = "nbstudio-gate-v1";
const ITERATIONS = 200000;
const CODE_HASH = "63ca0d972bac7f5b88109cff77e909c950cf9f4bbf284fc19fb4658753fc39d2";

export const UNLOCK_DAYS = 7;
const KEY = "nb-unlock"; // { exp, k } in this browser / installed app only
const TRIES_KEY = "nb-unlock-tries"; // { n, until } – slows down guessing

async function hashCode(code) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(SALT), iterations: ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

// When this browser's unlock runs out (ms), or 0 when it is locked.
export function unlockedUntil() {
  const s = read(KEY);
  if (!s || s.k !== CODE_HASH.slice(0, 16) || !(s.exp > Date.now())) return 0;
  return s.exp;
}

// Seconds to wait before the next try (after 5 wrong codes in a row).
export function waitSeconds() {
  const t = read(TRIES_KEY);
  return t && t.until > Date.now() ? Math.ceil((t.until - Date.now()) / 1000) : 0;
}

// true = right code (this browser is now unlocked for UNLOCK_DAYS days).
export async function unlock(code) {
  if (waitSeconds()) return false;
  const ok = (await hashCode(String(code).trim())) === CODE_HASH;
  if (ok) {
    write(KEY, { exp: Date.now() + UNLOCK_DAYS * 24 * 3600 * 1000, k: CODE_HASH.slice(0, 16) });
    write(TRIES_KEY, null);
  } else {
    const t = read(TRIES_KEY) || { n: 0 };
    const n = (t.n || 0) + 1;
    write(TRIES_KEY, { n, until: n >= 5 ? Date.now() + Math.min(300, 30 * 2 ** (n - 5)) * 1000 : 0 });
  }
  return ok;
}

export function lock() { write(KEY, null); }

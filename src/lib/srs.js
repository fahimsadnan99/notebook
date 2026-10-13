// Spaced repetition (SM-2, the method Anki is based on): a card you know comes back after longer and
// longer gaps; a card you miss comes back soon.
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

export function newCard(q, a, src) {
  return { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), q, a, src: src || null, ease: 2.5, interval: 0, reps: 0, due: Date.now(), created: Date.now() };
}

// grade: "again" | "hard" | "good" | "easy". Returns the updated card.
export function grade(card, g, now = Date.now()) {
  let { ease = 2.5, interval = 0, reps = 0 } = card;
  if (g === "again") {
    return { ...card, ease: Math.max(1.3, ease - 0.2), interval: 0, reps: 0, due: now + 10 * MIN, lapses: (card.lapses || 0) + 1 };
  }
  if (g === "hard") { interval = Math.max(1, interval * 1.2); ease = Math.max(1.3, ease - 0.15); }
  else {
    interval = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease;
    if (g === "easy") { interval = reps === 0 ? 4 : interval * 1.3; ease += 0.15; }
  }
  interval = Math.round(interval * 10) / 10;
  return { ...card, ease, interval, reps: reps + 1, due: now + interval * DAY, last: now };
}

export const isDue = (c, now = Date.now()) => c.due <= now;

// "in 10 min", "in 3 days" – shown on the answer buttons.
export function nextLabel(card, g) {
  const ms = grade(card, g, 0).due;
  if (ms < DAY) return `${Math.round(ms / MIN)} min`;
  const d = Math.round(ms / DAY);
  return d < 31 ? `${d} day${d === 1 ? "" : "s"}` : `${Math.round(d / 30)} mo`;
}

// Fill-in-the-blank cards from typed notes: "Water boils at {{100 °C}}" -> "Water boils at ____" / "100 °C".
export function clozeCards(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const blanks = [...line.matchAll(/\{\{(.+?)\}\}/g)];
    for (const b of blanks) {
      const q = line.replace(b[0], "____").replace(/\{\{(.+?)\}\}/g, "$1").trim();
      out.push({ q, a: b[1].trim() });
    }
  }
  return out;
}

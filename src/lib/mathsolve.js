// Math notes: a typed line that ends with "=" gets its answer, e.g. "25 × 4 =" -> "25 × 4 = 100".
// Small safe parser (no eval). Supports + − × ÷ * / x ^ % ( ) √ sqrt π, decimals and Bangla digits.
const BN = "০১২৩৪৫৬৭৮৯";
const toLatin = (s) => s.replace(/[০-৯]/g, (d) => String(BN.indexOf(d)));
const toBangla = (s) => s.replace(/[0-9]/g, (d) => BN[+d]);

function tokenize(src) {
  const s = src
    .replace(/(\d)\s*[xX]\s*(?=[\d(√π])/g, "$1*") // "3 x 4" means times
    .replace(/[×✕]/g, "*").replace(/[÷]/g, "/").replace(/[−–]/g, "-").replace(/,/g, "")
    .replace(/sqrt/gi, "√").replace(/\bpi\b/gi, "π");
  const out = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: "n", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    if ("+-*/^()%√π".includes(c)) { out.push({ t: c }); i++; continue; }
    return null; // a letter or symbol we don't know: not a math line
  }
  return out;
}

function evaluate(tokens) {
  let i = 0;
  const peek = () => tokens[i], eat = (t) => (tokens[i] && tokens[i].t === t ? tokens[i++] : null);
  const startsValue = (tk) => tk && (tk.t === "n" || tk.t === "(" || tk.t === "√" || tk.t === "π");
  function expr() {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("-")) v -= term();
      else return v;
    }
  }
  function term() {
    let v = power();
    for (;;) {
      if (eat("*")) v *= power();
      else if (eat("/")) v /= power();
      else if (startsValue(peek())) v *= power(); // 2(3+1), 2π
      else return v;
    }
  }
  function power() {
    const b = unary();
    return eat("^") ? Math.pow(b, power()) : b;
  }
  function unary() {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    let v = primary();
    while (eat("%")) v /= 100;
    return v;
  }
  function primary() {
    const tk = peek();
    if (!tk) throw new Error("end");
    if (eat("n")) return tk.v;
    if (eat("π")) return Math.PI;
    if (eat("√")) return Math.sqrt(unary());
    if (eat("(")) { const v = expr(); if (!eat(")")) throw new Error(")"); return v; }
    throw new Error("token");
  }
  const v = expr();
  if (i !== tokens.length) throw new Error("rest");
  return v;
}

function format(v) {
  if (!Number.isFinite(v)) return null;
  const r = Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0) ? v.toExponential(6) : String(+v.toPrecision(12));
  return r.replace(/(\.\d*?)0+(e|$)/, "$1$2").replace(/\.(e|$)/, "$1");
}

// Solve one expression, or return null if it isn't a calculation.
export function solve(exprText) {
  const bangla = /[০-৯]/.test(exprText);
  const src = toLatin(exprText).trim().replace(/sqrt/gi, "√").replace(/\bpi\b/gi, "π");
  if (!/\d|π/.test(src) || !/[-+*/^%×÷xX√π−]/.test(src)) return null; // needs a number and an operator
  const tokens = tokenize(src);
  if (!tokens || !tokens.length) return null;
  try {
    const out = format(evaluate(tokens));
    return out === null ? null : bangla ? toBangla(out) : out;
  } catch { return null; }
}

// Fill in every line that ends with "=" and has no answer yet.
export function solveLines(text) {
  let changed = false;
  const lines = text.split("\n").map((line) => {
    const m = /^(.*?[^=<>!])\s*=\s*$/.exec(line);
    if (!m) return line;
    const left = m[1].includes("=") ? m[1].split("=").pop() : m[1]; // "a = 2+3 =" -> solve "2+3"
    const ans = solve(left);
    if (ans === null) return line;
    changed = true;
    return `${line.trimEnd()} ${ans}`;
  });
  return changed ? lines.join("\n") : text;
}

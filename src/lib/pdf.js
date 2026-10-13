// Tiny PDF writer: one full-page JPEG image per page. No dependencies.
// pages: [{ jpeg: Uint8Array, w, h }]  (w/h = image size in pixels)
// Each page is sized in points so the image fills it (A4 sheets come out as real A4 pages).
const enc = new TextEncoder();

export function makePdf(pages, { pageWidthPt = 595.28 } = {}) {
  const chunks = [];
  const offsets = [];
  let size = 0;
  const push = (data) => { const b = typeof data === "string" ? enc.encode(data) : data; chunks.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };

  // Object numbers: 1 catalog, 2 page tree, then 3 per page (page, content, image).
  const n = pages.length;
  const pageNum = (i) => 3 + i * 3;
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageNum(i)} 0 R`).join(" ")}] >>`));

  pages.forEach((pg, i) => {
    const W = pageWidthPt, H = +((pg.h / pg.w) * pageWidthPt).toFixed(2);
    const p = pageNum(i);
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${p + 1} 0 R /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> >>`));
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(p + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(p + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${pg.w} /Height ${pg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
      push(pg.jpeg);
      push("\nendstream");
    });
  });

  const total = 3 + n * 3;
  const xref = size;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

// Turn a PDF into one JPEG image per page, so each page can be written on with the pen.
// pdf.js is loaded only when a PDF is imported, so it does not slow down the app.
const MAX_BYTES = 650_000; // a page is saved as one record; Firestore allows ~1 MB per record

export async function pdfToImages(file, { maxPages = 100, width = 1300, onProgress } = {}) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const count = Math.min(pdf.numPages, maxPages);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    let w = width, quality = 0.82, src = "";
    // Shrink until the page image is small enough to save.
    for (let tries = 0; tries < 5; tries++) {
      const viewport = page.getViewport({ scale: w / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      src = canvas.toDataURL("image/jpeg", quality);
      if (src.length <= MAX_BYTES) break;
      w = Math.round(w * 0.8); quality = Math.max(0.55, quality - 0.08);
    }
    out.push({ src, ratio: base.height / base.width });
    page.cleanup();
    onProgress && onProgress(i, count);
  }
  return { pages: out, total: pdf.numPages };
}

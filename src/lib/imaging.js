// Small image helpers: load, shrink and crop (keeps saved pages small).
export const fileToDataUrl = (file) =>
  new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

export const blobToDataUrl = fileToDataUrl;

export const loadImage = (src) =>
  new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// Shrink so the longest side <= maxSide. Returns { src, w, h }.
export function scaleImage(img, { maxSide = 900, type = "image/jpeg", quality = 0.82 } = {}) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return { src: c.toDataURL(type, quality), w, h };
}

// Center-crop to a wide banner (like CSS background-size: cover).
export function cropToCover(img, W = 1600, H = 420, quality = 0.78) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  c.getContext("2d").drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return c.toDataURL("image/jpeg", quality);
}

export function downloadDataUrl(dataUrl, name) {
  const a = document.createElement("a");
  a.href = dataUrl; a.download = name; a.click();
}

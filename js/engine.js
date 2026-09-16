// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint PDF engine — thin wrappers over pdf.js (render/text) and pdf-lib (write).
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.0.375/build/pdf.min.mjs';
import { PDFDocument, rgb, degrees, StandardFonts, PageSizes } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.0.375/build/pdf.worker.min.mjs';

export { pdfjsLib, PDFDocument, rgb, degrees, StandardFonts, PageSizes };

const docCache = new WeakMap();

/** Load a File into { bytes, pdfjs doc, pageCount } */
export async function openPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
  return { file, name: file.name, size: file.size, bytes, doc, pageCount: doc.numPages };
}

/** Render one page to a canvas at a given scale (or fit width). */
export async function renderPage(doc, pageNumber, { scale, width, canvas } = {}) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const s = scale || (width ? width / base.width : 1);
  const viewport = page.getViewport({ scale: s });
  const c = canvas || document.createElement('canvas');
  c.width = Math.ceil(viewport.width); c.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport }).promise;
  return { canvas: c, viewport, page, scale: s, baseWidth: base.width, baseHeight: base.height };
}

/** Small thumbnail data URL (cached per doc+page). */
export async function thumbnail(doc, pageNumber, width = 160) {
  let map = docCache.get(doc);
  if (!map) { map = new Map(); docCache.set(doc, map); }
  const key = pageNumber + ':' + width;
  if (map.has(key)) return map.get(key);
  const { canvas } = await renderPage(doc, pageNumber, { width });
  const url = canvas.toDataURL('image/jpeg', 0.8);
  map.set(key, url);
  return url;
}

/** Extract positioned text items for a page (viewport coords, top-left origin). */
export async function textItems(page, viewport) {
  const tc = await page.getTextContent();
  const items = [];
  for (const item of tc.items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.hypot(tx[0], tx[1]);
    const width = item.width * viewport.scale;
    const height = (item.height || fontSize / viewport.scale) * viewport.scale;
    const st = tc.styles?.[item.fontName] || {};
    const family = /mono/i.test(st.fontFamily || '') ? 'Courier' : /serif/i.test(st.fontFamily || '') && !/sans/i.test(st.fontFamily || '') ? 'Times' : 'Helvetica';
    items.push({ str: item.str, x: tx[4], y: tx[5] - fontSize, baseline: tx[5], w: width, h: Math.max(height, fontSize), fontSize, fontName: item.fontName, family });
  }
  return items;
}

/** Group raw pdf.js items into line-level blocks. */
export function groupLines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find(l => Math.abs(l.y - it.y) < Math.max(l.fontSize, it.fontSize) * 0.45 && it.x - (l.x + l.w) < it.fontSize * 1.2 && it.x - (l.x + l.w) > -it.w * 0.5);
    if (line) {
      const gap = it.x - (line.x + line.w);
      line.str += (gap > it.fontSize * 0.2 && !line.str.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      line.w = Math.max(line.x + line.w, it.x + it.w) - line.x;
      line.h = Math.max(line.h, it.h); line.fontSize = Math.max(line.fontSize, it.fontSize);
    } else lines.push({ ...it });
  }
  return lines.map(l => ({ ...l, str: l.str.trim() })).filter(l => l.str);
}

export function download(bytes, filename, type = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function fmtSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

export function baseName(name) { return name.replace(/\.pdf$/i, ''); }

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Parse "1-3, 5, 8-10" into zero-based unique page indexes within [0,count). */
export function parseRanges(str, count) {
  const out = new Set();
  for (const part of String(str).split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    let a = +m[1], b = m[2] ? +m[2] : a;
    if (a > b) [a, b] = [b, a];
    for (let i = a; i <= b; i++) if (i >= 1 && i <= count) out.add(i - 1);
  }
  return [...out].sort((a, b) => a - b);
}

export async function canvasToBlob(canvas, type = 'image/png', q = 0.92) {
  return new Promise(r => canvas.toBlob(r, type, q));
}

export async function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

/** Rasterise selected pages of a pdf-lib doc via pdf.js and replace their content with the image (used for true redaction / flatten). */
export async function rasterizePages(pdfjsDoc, outDoc, pageIndexes, drawExtra, dpiScale = 2) {
  for (const idx of pageIndexes) {
    const { canvas, viewport } = await renderPage(pdfjsDoc, idx + 1, { scale: dpiScale });
    if (drawExtra) drawExtra(idx, canvas.getContext('2d'), viewport);
    const png = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    const img = await outDoc.embedJpg(await png.arrayBuffer());
    const page = outDoc.getPage(idx);
    const { width, height } = page.getSize();
    // Remove old content by replacing with a fresh page of the same size
    const newPage = outDoc.insertPage(idx, [width, height]);
    newPage.drawImage(img, { x: 0, y: 0, width, height });
    outDoc.removePage(idx + 1);
  }
}

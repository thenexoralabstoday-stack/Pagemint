// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Convert & optimise: PDF→images, images→PDF, compress, extract text, OCR.
import { PDFDocument, StandardFonts, PageSizes, renderPage, download, canvasToBlob, parseRanges, baseName, fmtSize, loadImage, pdfjsLib } from '../engine.js';
import { fileList } from '../app.js';

const C = '#10b981';
const svg = {
  toimg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  fromimg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 17l3-3 2 2 3-4"/></svg>',
  compress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14l4-4M8 10H4v4M20 10l-4 4M16 14h4v-4"/><path d="M4 4l16 16" opacity=".3"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  ocr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10M9 8h6M9 16h6"/></svg>',
};

/* ---------- PDF → IMAGES ---------- */
const toImages = {
  id: 'pdf-to-image', name: 'PDF to images', desc: 'Export pages as PNG or JPG at any resolution.', icon: svg.toimg, color: C, category: 'convert', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const fmt = h('select', { class: 'input' }, h('option', { value: 'png' }, 'PNG (lossless)'), h('option', { value: 'jpeg' }, 'JPG (smaller)'));
    const dpi = h('select', { class: 'input' }, h('option', { value: '1' }, '72 dpi · screen'), h('option', { value: '2', selected: true }, '144 dpi · sharp'), h('option', { value: '3' }, '216 dpi · print'), h('option', { value: '4.17' }, '300 dpi · press'));
    const pagesIn = h('input', { class: 'input', placeholder: 'All pages' });
    panelBody.append(h('h4', {}, 'Options'), h('div', { class: 'field' }, h('label', {}, 'Format'), fmt), h('div', { class: 'field' }, h('label', {}, 'Resolution'), dpi), h('div', { class: 'field' }, h('label', {}, 'Pages'), pagesIn));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Rendering', async prog => {
      const f = ctx.state.files[0]; const idx = pagesIn.value.trim() ? parseRanges(pagesIn.value, f.pageCount) : Array.from({ length: f.pageCount }, (_, i) => i);
      const zip = new JSZip(); const ext = fmt.value === 'png' ? 'png' : 'jpg';
      for (let i = 0; i < idx.length; i++) {
        const { canvas } = await renderPage(f.doc, idx[i] + 1, { scale: +dpi.value });
        const blob = await canvasToBlob(canvas, 'image/' + fmt.value, 0.92);
        if (idx.length === 1) { download(blob, `${baseName(f.name)}-page-${idx[i] + 1}.${ext}`, blob.type); return; }
        zip.file(`${baseName(f.name)}-page-${String(idx[i] + 1).padStart(3, '0')}.${ext}`, blob); prog((i + 1) / idx.length);
      }
      download(await zip.generateAsync({ type: 'blob' }), `${baseName(f.name)}-images.zip`, 'application/zip');
    }) }, 'Export images');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- IMAGES → PDF ---------- */
const fromImages = {
  id: 'image-to-pdf', name: 'Images to PDF', desc: 'Turn JPG, PNG and WEBP photos into a single PDF.', icon: svg.fromimg, color: C, category: 'convert', accepts: 'image', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const size = h('select', { class: 'input' }, h('option', { value: 'fit' }, 'Fit page to image'), h('option', { value: 'A4' }, 'A4'), h('option', { value: 'Letter' }, 'US Letter'));
    const orient = h('select', { class: 'input' }, h('option', { value: 'auto' }, 'Auto'), h('option', { value: 'portrait' }, 'Portrait'), h('option', { value: 'landscape' }, 'Landscape'));
    const margin = h('input', { class: 'input', type: 'number', value: 20, min: 0 });
    panelBody.append(h('h4', {}, 'Page setup'), h('div', { class: 'field' }, h('label', {}, 'Page size'), size), h('div', { class: 'field' }, h('label', {}, 'Orientation'), orient), h('div', { class: 'field' }, h('label', {}, 'Margin (pt)'), margin));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Building PDF', async prog => {
      const out = await PDFDocument.create(); const files = ctx.state.files;
      for (let i = 0; i < files.length; i++) {
        const f = files[i]; let bytes = f.bytes; let img;
        if (/\.png$/i.test(f.name)) img = await out.embedPng(bytes);
        else if (/\.jpe?g$/i.test(f.name)) img = await out.embedJpg(bytes);
        else { // webp/gif/bmp → re-encode via canvas
          const el = await loadImage(URL.createObjectURL(f.file)); const c = document.createElement('canvas'); c.width = el.naturalWidth; c.height = el.naturalHeight; c.getContext('2d').drawImage(el, 0, 0);
          img = await out.embedJpg(await (await canvasToBlob(c, 'image/jpeg', 0.92)).arrayBuffer());
        }
        const m = +margin.value || 0; let pw, ph;
        if (size.value === 'fit') { pw = img.width + 2 * m; ph = img.height + 2 * m; }
        else { [pw, ph] = PageSizes[size.value]; const land = orient.value === 'landscape' || (orient.value === 'auto' && img.width > img.height); if (land) [pw, ph] = [ph, pw]; }
        const page = out.addPage([pw, ph]); const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height); const w = img.width * s, hgt = img.height * s;
        page.drawImage(img, { x: (pw - w) / 2, y: (ph - hgt) / 2, width: w, height: hgt }); prog((i + 1) / files.length);
      }
      download(await out.save(), files.length === 1 ? baseName(files[0].name).replace(/\.[^.]+$/, '') + '.pdf' : 'images.pdf');
    }) }, 'Create PDF');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx) : ctx.fileDropzone({ hint: 'Drop images · drag to reorder' })); });
  },
};

/* ---------- COMPRESS ---------- */
const compress = {
  id: 'compress', name: 'Compress PDF', desc: 'Shrink files for email and upload limits.', icon: svg.compress, color: C, category: 'convert', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let level = 'medium';
    const levels = { light: { label: 'Light', note: 'Lossless. Rewrites the file structure; keeps text selectable. Typically 5–20% smaller.' }, medium: { label: 'Medium', note: 'Pages re-encoded as 144 dpi JPEG. Great for scans and image-heavy decks. Text becomes an image.' }, strong: { label: 'Strong', note: 'Pages re-encoded at 96 dpi, quality 60%. Smallest output, still readable on screen.' } };
    const note = h('p', { class: 'small muted' }, levels[level].note);
    const seg = h('div', { class: 'seg' }, ...Object.entries(levels).map(([id, l]) => h('button', { class: id === level ? 'active' : '', onclick: e => { level = id; seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); note.textContent = l.note; } }, l.label)));
    const result = h('div');
    panelBody.append(h('h4', {}, 'Compression level'), seg, note, result);
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Compressing', async prog => {
      const files = ctx.state.files; const zip = files.length > 1 ? new JSZip() : null; result.replaceChildren();
      for (let i = 0; i < files.length; i++) {
        const f = files[i]; let bytes;
        if (level === 'light') { const d = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); bytes = await d.save({ useObjectStreams: true }); }
        else {
          const scale = level === 'medium' ? 2 : 96 / 72, q = level === 'medium' ? 0.75 : 0.6; const out = await PDFDocument.create();
          for (let p = 1; p <= f.pageCount; p++) {
            const { canvas, baseWidth, baseHeight } = await renderPage(f.doc, p, { scale });
            const jpg = await out.embedJpg(await (await canvasToBlob(canvas, 'image/jpeg', q)).arrayBuffer());
            out.addPage([baseWidth, baseHeight]).drawImage(jpg, { x: 0, y: 0, width: baseWidth, height: baseHeight }); prog((i + p / f.pageCount) / files.length);
          }
          bytes = await out.save();
        }
        const saved = 1 - bytes.length / f.size;
        result.append(h('div', { class: 'small', style: { marginTop: '8px' } }, `${f.name}: ${fmtSize(f.size)} → ${fmtSize(bytes.length)} `, h('b', { style: { color: saved > 0 ? 'var(--ok)' : 'var(--warn)' } }, saved > 0 ? `−${Math.round(saved * 100)}%` : 'no gain')));
        const name = baseName(f.name) + '-compressed.pdf'; if (zip) zip.file(name, bytes); else download(bytes, name);
      }
      if (zip) download(await zip.generateAsync({ type: 'blob' }), 'compressed.zip', 'application/zip');
    }) }, 'Compress');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- EXTRACT TEXT ---------- */
export async function extractAllText(doc, onProgress) {
  const parts = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p); const tc = await page.getTextContent();
    let last = null, out = '';
    for (const it of tc.items) { if (!('str' in it)) continue; if (last && Math.abs(last.transform[5] - it.transform[5]) > 2) out += '\n'; else if (last && it.str && !out.endsWith(' ') && it.transform[4] - (last.transform[4] + last.width) > 2) out += ' '; out += it.str; last = it; }
    parts.push(out.trim()); onProgress && onProgress(p / doc.numPages);
  }
  return parts;
}
const extractText = {
  id: 'pdf-to-text', name: 'PDF to text', desc: 'Pull all text out, copy it or save as .txt.', icon: svg.text, color: C, category: 'convert', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let text = '';
    const out = h('div', { class: 'txt-out' }, 'Text will appear here.');
    const copy = h('button', { class: 'btn', disabled: true, onclick: () => navigator.clipboard.writeText(text).then(() => ctx.toast('Copied', 'ok')) }, 'Copy text');
    const save = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Saving', async () => download(new Blob([text], { type: 'text/plain' }), baseName(ctx.state.files[0].name) + '.txt', 'text/plain')) }, 'Download .txt');
    panelBody.append(h('h4', {}, 'About'), h('p', { class: 'small muted' }, 'Works on PDFs with a real text layer. For scans, use OCR.'));
    panelFoot.append(save, copy);
    ctx.onFilesChange(async files => {
      if (!files.length) { stageBody.replaceChildren(ctx.fileDropzone()); copy.disabled = save.disabled = true; return; }
      stageBody.replaceChildren(fileList(ctx, { reorder: false }), out); out.textContent = 'Extracting…';
      const parts = await extractAllText(files[0].doc); text = parts.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
      out.textContent = text || 'No text layer found. Try the OCR tool.'; copy.disabled = save.disabled = !text;
    });
  },
};

/* ---------- OCR ---------- */
let tessPromise = null;
function loadTesseract() {
  if (!tessPromise) tessPromise = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js'; s.onload = () => res(window.Tesseract); s.onerror = rej; document.head.append(s); });
  return tessPromise;
}
const ocr = {
  id: 'ocr', name: 'OCR scanned PDF', desc: 'Recognise text in scans and make the PDF searchable.', icon: svg.ocr, color: C, category: 'convert', accepts: 'pdf', multi: false, pro: true, feature: 'ocr',
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const lang = h('select', { class: 'input' }, ...[['eng', 'English'], ['deu', 'German'], ['fra', 'French'], ['spa', 'Spanish'], ['ita', 'Italian'], ['por', 'Portuguese'], ['pol', 'Polish'], ['rus', 'Russian'], ['ukr', 'Ukrainian'], ['tur', 'Turkish'], ['nld', 'Dutch'], ['jpn', 'Japanese'], ['chi_sim', 'Chinese (simplified)']].map(([v, l]) => h('option', { value: v }, l)));
    const mode = h('select', { class: 'input' }, h('option', { value: 'pdf' }, 'Searchable PDF (invisible text layer)'), h('option', { value: 'txt' }, 'Plain text (.txt)'));
    const out = h('div', { class: 'txt-out', hidden: true });
    panelBody.append(h('h4', {}, 'Options'), h('div', { class: 'field' }, h('label', {}, 'Language'), lang), h('div', { class: 'field' }, h('label', {}, 'Output'), mode), h('p', { class: 'small muted' }, 'Runs on your device with Tesseract. The language pack (~10 MB) is downloaded once.'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Recognising', async prog => {
      const f = ctx.state.files[0]; const T = await loadTesseract(); const worker = await T.createWorker(lang.value);
      const scale = 2; const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); const font = await src.embedFont(StandardFonts.Helvetica); const texts = [];
      try {
        for (let p = 1; p <= f.pageCount; p++) {
          const { canvas } = await renderPage(f.doc, p, { scale });
          const { data } = await worker.recognize(canvas); texts.push(data.text);
          if (mode.value === 'pdf') {
            const page = src.getPage(p - 1); const { height } = page.getSize();
            for (const w of data.words || []) {
              if (!w.text.trim() || w.confidence < 30) continue; const b = w.bbox; const hpt = (b.y1 - b.y0) / scale; const size = Math.max(4, hpt * 0.9);
              const clean = w.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
              if (!clean) continue;
              page.drawText(clean, { x: b.x0 / scale, y: height - b.y1 / scale + hpt * 0.2, size, font, opacity: 0 });
            }
          }
          prog(p / f.pageCount);
        }
      } finally { await worker.terminate(); }
      out.hidden = false; out.textContent = texts.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join('\n\n'); stageBody.append(out);
      if (mode.value === 'pdf') download(await src.save(), baseName(f.name) + '-searchable.pdf'); else download(new Blob([out.textContent], { type: 'text/plain' }), baseName(f.name) + '-ocr.txt', 'text/plain');
    }) }, 'Run OCR');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; out.hidden = true; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

export const convertTools = [toImages, fromImages, compress, extractText, ocr];

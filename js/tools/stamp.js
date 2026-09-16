// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Stamp & protect: watermark, page numbers, metadata, crop, flatten.
import { PDFDocument, StandardFonts, degrees, rgb, download, hexToRgb, parseRanges, baseName, rasterizePages } from '../engine.js';
import { fileList } from '../app.js';

const C = '#f59e0b';
const svg = {
  watermark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z"/><path d="M9 12l2 2 4-4"/></svg>',
  numbers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/></svg>',
  meta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>',
  crop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>',
  flatten: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17l9 4 9-4M3 12l9 4 9-4M3 7l9 4 9-4-9-4z"/></svg>',
};
function sanitize(s) { return (s || '').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?'); }

async function forEachFile(ctx, prog, fn, suffix) {
  const files = ctx.state.files; const zip = files.length > 1 ? new JSZip() : null;
  for (let i = 0; i < files.length; i++) {
    const doc = await PDFDocument.load(files[i].bytes, { ignoreEncryption: true });
    await fn(doc, files[i]); const bytes = await doc.save(); const name = baseName(files[i].name) + suffix + '.pdf';
    if (zip) zip.file(name, bytes); else download(bytes, name); prog((i + 1) / files.length);
  }
  if (zip) download(await zip.generateAsync({ type: 'blob' }), suffix.replace('-', '') + '.zip', 'application/zip');
}

/* ---------- WATERMARK ---------- */
const watermark = {
  id: 'watermark', name: 'Watermark', desc: 'Stamp text or a logo over every page.', icon: svg.watermark, color: C, category: 'stamp', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let imgFile = null;
    const text = h('input', { class: 'input', value: 'CONFIDENTIAL' });
    const size = h('input', { type: 'range', min: 12, max: 160, value: 60 });
    const color = h('input', { type: 'color', value: '#ef4444' });
    const opacity = h('input', { type: 'range', min: 5, max: 100, value: 25 });
    const rot = h('input', { type: 'range', min: -90, max: 90, value: -35 });
    const layout = h('select', { class: 'input' }, h('option', { value: 'center' }, 'Centered'), h('option', { value: 'tile' }, 'Tiled'), h('option', { value: 'tl' }, 'Top left'), h('option', { value: 'br' }, 'Bottom right'));
    const pagesIn = h('input', { class: 'input', placeholder: 'All pages' });
    const imgBtn = h('button', { class: 'btn btn-sm', onclick: () => ctx.pickFiles('.png,.jpg,.jpeg', false).then(f => { imgFile = f[0] || null; imgBtn.textContent = imgFile ? imgFile.name : 'Choose image…'; }) }, 'Choose image…');
    panelBody.append(h('h4', {}, 'Text watermark'), h('div', { class: 'field' }, h('label', {}, 'Text (leave empty for image only)'), text),
      h('div', { class: 'field' }, h('label', {}, 'Size'), size), h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, 'Colour'), color), h('div', { class: 'field' }, h('label', {}, 'Opacity'), opacity)),
      h('div', { class: 'field' }, h('label', {}, 'Rotation'), rot), h('div', { class: 'field' }, h('label', {}, 'Layout'), layout),
      h('h4', {}, 'Image watermark (optional)'), imgBtn, h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Pages'), pagesIn));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Stamping', prog => forEachFile(ctx, prog, async doc => {
      const font = await doc.embedFont(StandardFonts.HelveticaBold); const op = +opacity.value / 100; const col = hexToRgb(color.value);
      let img = null; if (imgFile) { const b = await imgFile.arrayBuffer(); img = /png$/i.test(imgFile.name) ? await doc.embedPng(b) : await doc.embedJpg(b); }
      const idx = pagesIn.value.trim() ? parseRanges(pagesIn.value, doc.getPageCount()) : doc.getPageIndices();
      for (const i of idx) {
        const page = doc.getPage(i); const { width, height } = page.getSize(); const t = sanitize(text.value); const fs = +size.value;
        const tw = t ? font.widthOfTextAtSize(t, fs) : 0;
        const stamp = (cx, cy) => {
          if (img) { const s = Math.min(width * 0.4 / img.width, height * 0.4 / img.height, 1); const w = img.width * s, hh = img.height * s; page.drawImage(img, { x: cx - w / 2, y: cy - hh / 2 + (t ? fs : 0), width: w, height: hh, opacity: op, rotate: degrees(+rot.value) }); }
          if (t) page.drawText(t, { x: cx - tw / 2, y: cy - fs / 3, size: fs, font, color: col, opacity: op, rotate: degrees(+rot.value) });
        };
        if (layout.value === 'center') stamp(width / 2, height / 2);
        else if (layout.value === 'tl') stamp(tw / 2 + 40, height - 60);
        else if (layout.value === 'br') stamp(width - tw / 2 - 40, 60);
        else { const stepX = Math.max(tw, 120) + 80, stepY = fs * 3 + 60; for (let y = 40; y < height + stepY; y += stepY) for (let x = 40; x < width + stepX; x += stepX) stamp(x, y); }
      }
    }, '-watermarked')) }, 'Apply watermark');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- PAGE NUMBERS ---------- */
const pageNumbers = {
  id: 'page-numbers', name: 'Page numbers', desc: 'Add numbers or "Page X of Y" in any corner.', icon: svg.numbers, color: C, category: 'stamp', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const fmt = h('select', { class: 'input' }, h('option', { value: '{n}' }, '1, 2, 3'), h('option', { value: 'Page {n}' }, 'Page 1'), h('option', { value: 'Page {n} of {total}' }, 'Page 1 of 10'), h('option', { value: '{n} / {total}' }, '1 / 10'), h('option', { value: '- {n} -' }, '- 1 -'));
    const pos = h('select', { class: 'input' }, ...[['bc', 'Bottom centre'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['tl', 'Top left']].map(([v, l]) => h('option', { value: v }, l)));
    const start = h('input', { class: 'input', type: 'number', value: 1 });
    const size = h('input', { class: 'input', type: 'number', value: 11, min: 6, max: 48 });
    const margin = h('input', { class: 'input', type: 'number', value: 28, min: 0 });
    const fontSel = h('select', { class: 'input' }, h('option', { value: 'Helvetica' }, 'Helvetica'), h('option', { value: 'TimesRoman' }, 'Times'), h('option', { value: 'Courier' }, 'Courier'));
    const pagesIn = h('input', { class: 'input', placeholder: 'All pages' });
    panelBody.append(h('h4', {}, 'Style'), h('div', { class: 'field' }, h('label', {}, 'Format'), fmt), h('div', { class: 'field' }, h('label', {}, 'Position'), pos), h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, 'Start at'), start), h('div', { class: 'field' }, h('label', {}, 'Size'), size), h('div', { class: 'field' }, h('label', {}, 'Margin'), margin)), h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Font'), fontSel), h('div', { class: 'field' }, h('label', {}, 'Pages'), pagesIn));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Numbering', prog => forEachFile(ctx, prog, async doc => {
      const font = await doc.embedFont(StandardFonts[fontSel.value]); const n = doc.getPageCount(); const idx = pagesIn.value.trim() ? parseRanges(pagesIn.value, n) : doc.getPageIndices(); const fs = +size.value, m = +margin.value;
      idx.forEach((i, k) => {
        const page = doc.getPage(i); const { width, height } = page.getSize(); const label = fmt.value.replace('{n}', String(+start.value + k)).replace('{total}', String(idx.length));
        const tw = font.widthOfTextAtSize(label, fs); const p = pos.value;
        const x = p.endsWith('c') ? (width - tw) / 2 : p.endsWith('l') ? m : width - m - tw; const y = p.startsWith('b') ? m : height - m - fs;
        page.drawText(label, { x, y, size: fs, font, color: rgb(0.2, 0.2, 0.2) });
      });
    }, '-numbered')) }, 'Add page numbers');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- METADATA ---------- */
const metadata = {
  id: 'metadata', name: 'Edit metadata', desc: 'Change title, author, keywords and hidden properties.', icon: svg.meta, color: C, category: 'stamp', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const fields = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer'].map(k => ({ k, input: h('input', { class: 'input' }) }));
    const strip = h('input', { type: 'checkbox' });
    panelBody.append(h('h4', {}, 'Properties'), ...fields.map(f => h('div', { class: 'field' }, h('label', {}, f.k), f.input)), h('label', { class: 'check' }, strip, 'Strip all metadata (privacy)'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Saving', async () => {
      const f = ctx.state.files[0]; const doc = await PDFDocument.load(f.bytes, { ignoreEncryption: true, updateMetadata: false });
      for (const { k, input } of fields) { const v = strip.checked ? '' : input.value; doc['set' + k](k === 'Keywords' ? v.split(',').map(s => s.trim()).filter(Boolean) : v); }
      if (strip.checked) { doc.setCreationDate(new Date(0)); doc.setModificationDate(new Date(0)); }
      download(await doc.save(), baseName(f.name) + '-meta.pdf');
    }) }, 'Save PDF');
    panelFoot.append(btn);
    ctx.onFilesChange(async files => {
      btn.disabled = !files.length; if (!files.length) { stageBody.replaceChildren(ctx.fileDropzone()); return; }
      stageBody.replaceChildren(fileList(ctx, { reorder: false }));
      try { const doc = await PDFDocument.load(files[0].bytes, { ignoreEncryption: true, updateMetadata: false });
        for (const { k, input } of fields) { const v = doc['get' + k](); input.value = Array.isArray(v) ? v.join(', ') : (v || ''); }
        stageBody.append(h('div', { class: 'feature', style: { marginTop: '14px' } }, h('h3', {}, 'Current metadata'), h('p', { class: 'small' }, `Created: ${doc.getCreationDate() || '—'} · Modified: ${doc.getModificationDate() || '—'} · Pages: ${doc.getPageCount()}`)));
      } catch (e) { ctx.toast('Could not read metadata: ' + e.message, 'err'); }
    });
  },
};

/* ---------- CROP ---------- */
const crop = {
  id: 'crop', name: 'Crop pages', desc: 'Trim margins from every page.', icon: svg.crop, color: C, category: 'stamp', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const ins = ['Top', 'Right', 'Bottom', 'Left'].map(k => ({ k, input: h('input', { class: 'input', type: 'number', value: 0, min: 0 }) }));
    const unit = h('select', { class: 'input' }, h('option', { value: 'mm' }, 'mm'), h('option', { value: 'pt' }, 'pt'), h('option', { value: '%' }, '%'));
    panelBody.append(h('h4', {}, 'Trim amounts'), h('div', { class: 'row' }, ...ins.map(i => h('div', { class: 'field' }, h('label', {}, i.k), i.input))), h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Unit'), unit), h('p', { class: 'small muted' }, 'Crop sets the visible box; the original content stays in the file and can be uncropped later.'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Cropping', prog => forEachFile(ctx, prog, async doc => {
      for (const page of doc.getPages()) {
        const { width, height } = page.getSize(); const conv = (v, dim) => unit.value === 'mm' ? v * 2.8346 : unit.value === '%' ? dim * v / 100 : v;
        const [t, r, b, l] = ins.map((i, k) => conv(+i.input.value || 0, k % 2 ? width : height));
        page.setCropBox(l, b, Math.max(10, width - l - r), Math.max(10, height - t - b));
      }
    }, '-cropped')) }, 'Crop');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- FLATTEN ---------- */
const flatten = {
  id: 'flatten', name: 'Flatten PDF', desc: 'Bake forms, annotations and layers into plain pages.', icon: svg.flatten, color: C, category: 'stamp', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let mode = 'forms';
    const seg = h('div', { class: 'seg' }, h('button', { class: 'active', onclick: e => { mode = 'forms'; seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); } }, 'Form fields only'), h('button', { onclick: e => { mode = 'raster'; seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); } }, 'Everything (rasterise)'));
    panelBody.append(h('h4', {}, 'Mode'), seg, h('p', { class: 'small muted', style: { marginTop: '10px' } }, '"Form fields only" keeps text selectable. "Everything" turns each page into an image, which also strips hidden layers and comments.'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Flattening', async prog => {
      const f = ctx.state.files[0]; const doc = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
      if (mode === 'forms') { try { doc.getForm().flatten(); } catch (e) { ctx.toast('No form fields found; saving as-is.'); } }
      else await rasterizePages(f.doc, doc, doc.getPageIndices(), null, 2);
      prog(1); download(await doc.save(), baseName(f.name) + '-flat.pdf');
    }) }, 'Flatten');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

export const stampTools = [watermark, pageNumbers, metadata, crop, flatten];

// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Organize tools: merge, split, organize (reorder/rotate/delete), rotate, extract pages.
import { PDFDocument, degrees, download, thumbnail, parseRanges, baseName, fmtSize } from '../engine.js';
import { fileList } from '../app.js';

const C = '#6366f1';
const svg = {
  merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><path d="M12 8v8M9 12h6"/></svg>',
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h6v16H4zM14 4h6v16h-6z"/><path d="M12 2v20" stroke-dasharray="2 2"/></svg>',
  organize: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  extract: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6"/><path d="M9 14h6M12 11v6"/></svg>',
};

function outName(ctx, suffix) { return baseName(ctx.state.files[0]?.name || 'document') + suffix + '.pdf'; }

/* ---------- MERGE ---------- */
const merge = {
  id: 'merge', name: 'Merge PDF', desc: 'Combine PDFs in the order you want.', icon: svg.merge, color: C, category: 'organize', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const nameIn = h('input', { class: 'input', value: 'merged.pdf' });
    panelBody.append(h('h4', {}, 'Output'), h('div', { class: 'field' }, h('label', {}, 'File name'), nameIn), h('p', { class: 'small muted' }, 'Drag files in the list to change their order.'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Merging', async prog => {
      const out = await PDFDocument.create();
      const files = ctx.state.files;
      for (let i = 0; i < files.length; i++) {
        const src = await PDFDocument.load(files[i].bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p)); prog((i + 1) / files.length);
      }
      download(await out.save(), nameIn.value || 'merged.pdf');
    }) }, 'Merge PDFs');
    panelFoot.append(btn, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.pickFiles('.pdf', true).then(f => f.length && ctx.addFiles(f)) }, '+ Add more files'));
    ctx.onFilesChange(files => {
      btn.disabled = files.length < 2; btn.textContent = files.length < 2 ? 'Add at least 2 PDFs' : `Merge ${files.length} PDFs`;
      stageBody.replaceChildren(files.length ? fileList(ctx) : ctx.fileDropzone({ hint: 'Drop 2 or more PDFs' }));
      if (files.length) stageBody.append(h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn-sm', onclick: () => ctx.pickFiles('.pdf', true).then(f => f.length && ctx.addFiles(f)) }, '+ Add files')));
    });
  },
};

/* ---------- SPLIT ---------- */
const split = {
  id: 'split', name: 'Split PDF', desc: 'By page ranges, every N pages, or one file per page.', icon: svg.split, color: C, category: 'organize', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let mode = 'ranges';
    const rangesIn = h('input', { class: 'input', placeholder: 'e.g. 1-3, 4-6, 7' });
    const everyIn = h('input', { class: 'input', type: 'number', min: 1, value: 1 });
    const modeSeg = h('div', { class: 'seg' }, ...[['ranges', 'Ranges'], ['every', 'Every N'], ['single', 'Each page']].map(([id, label]) => h('button', { class: id === mode ? 'active' : '', onclick: e => { mode = id; modeSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); rangeField.hidden = mode !== 'ranges'; everyField.hidden = mode !== 'every'; } }, label)));
    const rangeField = h('div', { class: 'field' }, h('label', {}, 'Ranges (each becomes a file)'), rangesIn);
    const everyField = h('div', { class: 'field', hidden: true }, h('label', {}, 'Pages per file'), everyIn);
    panelBody.append(h('h4', {}, 'Split mode'), modeSeg, h('div', { style: { height: '12px' } }), rangeField, everyField, h('p', { class: 'small muted' }, 'Multiple outputs are bundled in a ZIP.'));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Splitting', async prog => {
      const f = ctx.state.files[0]; const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); const n = src.getPageCount();
      let groups = [];
      if (mode === 'ranges') groups = rangesIn.value.split(',').map(s => parseRanges(s, n)).filter(g => g.length);
      else if (mode === 'every') { const k = Math.max(1, +everyIn.value || 1); for (let i = 0; i < n; i += k) groups.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j)); }
      else groups = Array.from({ length: n }, (_, i) => [i]);
      if (!groups.length) throw new Error('No valid ranges');
      const zip = new JSZip(); const base = baseName(f.name);
      for (let i = 0; i < groups.length; i++) {
        const out = await PDFDocument.create(); const pages = await out.copyPages(src, groups[i]); pages.forEach(p => out.addPage(p));
        const label = groups[i].length === 1 ? `page-${groups[i][0] + 1}` : `pages-${groups[i][0] + 1}-${groups[i][groups[i].length - 1] + 1}`;
        const bytes = await out.save();
        if (groups.length === 1) { download(bytes, `${base}-${label}.pdf`); return; }
        zip.file(`${base}-${label}.pdf`, bytes); prog((i + 1) / groups.length);
      }
      download(await zip.generateAsync({ type: 'blob' }), `${base}-split.zip`, 'application/zip');
    }) }, 'Split PDF');
    panelFoot.append(btn);
    ctx.onFilesChange(files => {
      btn.disabled = !files.length;
      if (!files.length) { stageBody.replaceChildren(ctx.fileDropzone()); return; }
      const f = files[0]; rangesIn.placeholder = `1-${f.pageCount}`;
      stageBody.replaceChildren(fileList(ctx, { reorder: false }), h('p', { class: 'small muted', style: { marginTop: '10px' } }, `${f.pageCount} pages. Choose a split mode on the right.`));
      pageGrid(ctx, f, { selectable: false }).then(g => stageBody.append(g));
    });
  },
};

/* ---------- Page grid helper ---------- */
export async function pageGrid(ctx, f, { selectable = true, onSelect } = {}) {
  const { h } = ctx;
  const grid = h('div', { class: 'page-grid', style: { marginTop: '16px' } });
  for (let i = 1; i <= f.pageCount; i++) {
    const img = h('img', { alt: 'page ' + i, loading: 'lazy' });
    const tile = h('div', { class: 'page-tile', style: { cursor: selectable ? 'pointer' : 'default' }, onclick: () => { if (!selectable) return; tile.classList.toggle('selected'); onSelect && onSelect(); } }, img, h('div', { class: 'num' }, String(i)));
    tile.dataset.page = i; grid.append(tile);
    thumbnail(f.doc, i, 180).then(u => img.src = u);
  }
  return grid;
}

/* ---------- ORGANIZE ---------- */
const organize = {
  id: 'organize', name: 'Organize pages', desc: 'Reorder, rotate, duplicate and delete pages visually.', icon: svg.organize, color: C, category: 'organize', accepts: 'pdf', multi: false, isNew: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let pages = []; // [{src: pageIndex, rot: 0|90|180|270, deleted}]
    const grid = h('div', { class: 'page-grid' });
    let dragIdx = null;
    function draw(f) {
      grid.replaceChildren();
      pages.forEach((p, i) => {
        const img = h('img', { alt: '', style: { transform: `rotate(${p.rot}deg)` } });
        thumbnail(f.doc, p.src + 1, 180).then(u => img.src = u);
        const tile = h('div', { class: 'page-tile' + (p.deleted ? ' deleted' : ''), draggable: true },
          img, h('div', { class: 'num' }, `${i + 1}  ·  src ${p.src + 1}`),
          h('div', { class: 'acts' },
            h('button', { title: 'Rotate', onclick: () => { p.rot = (p.rot + 90) % 360; draw(f); } }, '⟳'),
            h('button', { title: 'Duplicate', onclick: () => { pages.splice(i + 1, 0, { ...p }); draw(f); } }, '⧉'),
            h('button', { title: p.deleted ? 'Restore' : 'Delete', onclick: () => { p.deleted = !p.deleted; draw(f); } }, p.deleted ? '↺' : '✕')));
        tile.addEventListener('dragstart', () => { dragIdx = i; tile.classList.add('dragging'); });
        tile.addEventListener('dragend', () => tile.classList.remove('dragging'));
        tile.addEventListener('dragover', e => e.preventDefault());
        tile.addEventListener('drop', e => { e.preventDefault(); if (dragIdx == null || dragIdx === i) return; const [m] = pages.splice(dragIdx, 1); pages.splice(i, 0, m); draw(f); });
        grid.append(tile);
      });
      countLbl.textContent = `${pages.filter(p => !p.deleted).length} pages in output`;
    }
    const countLbl = h('p', { class: 'small muted' });
    panelBody.append(h('h4', {}, 'Quick actions'),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: () => { pages.forEach(p => p.rot = (p.rot + 90) % 360); draw(ctx.state.files[0]); } }, 'Rotate all ⟳'),
        h('button', { class: 'btn btn-sm', onclick: () => { pages.reverse(); draw(ctx.state.files[0]); } }, 'Reverse order'),
        h('button', { class: 'btn btn-sm', onclick: () => { pages.forEach((p, i) => p.deleted = i % 2 === 1); draw(ctx.state.files[0]); } }, 'Keep odd pages'),
        h('button', { class: 'btn btn-sm', onclick: () => { pages.forEach((p, i) => p.deleted = i % 2 === 0); draw(ctx.state.files[0]); } }, 'Keep even pages'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { init(ctx.state.files[0]); } }, 'Reset')),
      h('h4', {}, 'Tips'), h('p', { class: 'small muted' }, 'Drag tiles to reorder. Hover a page for rotate, duplicate and delete.'), countLbl);
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Building PDF', async prog => {
      const f = ctx.state.files[0]; const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); const out = await PDFDocument.create();
      const keep = pages.filter(p => !p.deleted); if (!keep.length) throw new Error('All pages deleted');
      const copied = await out.copyPages(src, keep.map(p => p.src));
      copied.forEach((pg, i) => { const base = pg.getRotation().angle; pg.setRotation(degrees((base + keep[i].rot) % 360)); out.addPage(pg); prog((i + 1) / copied.length); });
      download(await out.save(), outName(ctx, '-organized'));
    }) }, 'Save PDF');
    panelFoot.append(btn);
    function init(f) { pages = Array.from({ length: f.pageCount }, (_, i) => ({ src: i, rot: 0, deleted: false })); draw(f); }
    ctx.onFilesChange(files => {
      btn.disabled = !files.length;
      if (!files.length) { stageBody.replaceChildren(ctx.fileDropzone()); return; }
      init(files[0]); stageBody.replaceChildren(grid);
    });
  },
};

/* ---------- ROTATE ---------- */
const rotate = {
  id: 'rotate', name: 'Rotate PDF', desc: 'Rotate every page, or just some.', icon: svg.rotate, color: C, category: 'organize', accepts: 'pdf', multi: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let angle = 90;
    const seg = h('div', { class: 'seg' }, ...[90, 180, 270].map(a => h('button', { class: a === angle ? 'active' : '', onclick: e => { angle = a; seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); } }, a + '°')));
    const pagesIn = h('input', { class: 'input', placeholder: 'All pages (or e.g. 1-3, 5)' });
    panelBody.append(h('h4', {}, 'Rotation'), seg, h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Pages'), pagesIn));
    const btn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Rotating', async prog => {
      const files = ctx.state.files; const zip = files.length > 1 ? new JSZip() : null;
      for (let i = 0; i < files.length; i++) {
        const doc = await PDFDocument.load(files[i].bytes, { ignoreEncryption: true }); const n = doc.getPageCount();
        const idx = pagesIn.value.trim() ? parseRanges(pagesIn.value, n) : doc.getPageIndices();
        idx.forEach(k => { const p = doc.getPage(k); p.setRotation(degrees((p.getRotation().angle + angle) % 360)); });
        const bytes = await doc.save(); const name = baseName(files[i].name) + '-rotated.pdf';
        if (zip) zip.file(name, bytes); else download(bytes, name);
        prog((i + 1) / files.length);
      }
      if (zip) download(await zip.generateAsync({ type: 'blob' }), 'rotated.zip', 'application/zip');
    }) }, 'Rotate');
    panelFoot.append(btn);
    ctx.onFilesChange(files => { btn.disabled = !files.length; stageBody.replaceChildren(files.length ? fileList(ctx, { reorder: false }) : ctx.fileDropzone()); });
  },
};

/* ---------- EXTRACT / DELETE PAGES ---------- */
const extract = {
  id: 'extract', name: 'Extract or delete pages', desc: 'Click pages to select, then keep or remove them.', icon: svg.extract, color: C, category: 'organize', accepts: 'pdf', multi: false,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const rangesIn = h('input', { class: 'input', placeholder: 'e.g. 1-3, 7' });
    const lbl = h('p', { class: 'small muted' }, 'No pages selected');
    let grid = null;
    function selected() { return grid ? [...grid.querySelectorAll('.page-tile.selected')].map(t => +t.dataset.page - 1) : []; }
    function sync() { const s = selected(); lbl.textContent = s.length ? `${s.length} page(s) selected` : 'No pages selected'; }
    rangesIn.oninput = () => { if (!grid) return; const f = ctx.state.files[0]; const set = new Set(parseRanges(rangesIn.value, f.pageCount)); grid.querySelectorAll('.page-tile').forEach(t => t.classList.toggle('selected', set.has(+t.dataset.page - 1))); sync(); };
    panelBody.append(h('h4', {}, 'Select pages'), h('div', { class: 'field' }, h('label', {}, 'Or type ranges'), rangesIn), lbl,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-sm', onclick: () => { grid?.querySelectorAll('.page-tile').forEach(t => t.classList.add('selected')); sync(); } }, 'Select all'), h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { grid?.querySelectorAll('.page-tile').forEach(t => t.classList.remove('selected')); sync(); } }, 'Clear')));
    async function build(keep) {
      const f = ctx.state.files[0]; const src = await PDFDocument.load(f.bytes, { ignoreEncryption: true }); const sel = new Set(selected());
      const idx = src.getPageIndices().filter(i => keep ? sel.has(i) : !sel.has(i)); if (!idx.length) throw new Error('Nothing to output');
      const out = await PDFDocument.create(); (await out.copyPages(src, idx)).forEach(p => out.addPage(p));
      download(await out.save(), outName(ctx, keep ? '-extracted' : '-trimmed'));
    }
    const b1 = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Extracting', () => build(true)) }, 'Extract selected');
    const b2 = h('button', { class: 'btn btn-danger', disabled: true, onclick: () => ctx.run('Deleting', () => build(false)) }, 'Delete selected');
    panelFoot.append(b1, b2);
    ctx.onFilesChange(async files => {
      b1.disabled = b2.disabled = !files.length;
      if (!files.length) { grid = null; stageBody.replaceChildren(ctx.fileDropzone()); return; }
      grid = await pageGrid(ctx, files[0], { onSelect: sync }); stageBody.replaceChildren(h('p', { class: 'small muted' }, 'Click pages to select them.'), grid);
    });
  },
};

export const pageTools = [merge, split, organize, rotate, extract];

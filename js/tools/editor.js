// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint Editor — edit existing text, add text, whiteout, highlight, shapes, freehand, signatures, images, true redaction.
import { PDFDocument, StandardFonts, rgb, renderPage, textItems, groupLines, download, hexToRgb, baseName, rasterizePages } from '../engine.js';
import { BlendMode } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

const C = '#ec4899';
const I = {
  editor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 3l7 17 2.5-6.5L20 11z"/></svg>',
  edittext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5h14M12 5v14M8 19h8"/><path d="M19 15v6M16 18h6"/></svg>',
  whiteout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16l10-10 7 7-6 6"/><path d="M6.5 12.5l5 5"/></svg>',
  highlight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4z"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>',
  draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17c3-6 6-6 9 0s6 6 9 0"/></svg>',
  sign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 19c4 0 3-8 6-8s2 8 5 8 2-6 4-6 2 6 3 6"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  redact: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 9h12M6 13h8" stroke-width="3"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>',
};
const FONT = { Helvetica: 'Helvetica, Arial, sans-serif', Times: '"Times New Roman", Times, serif', Courier: '"Courier New", Courier, monospace' };
const sanitize = s => (s || '').replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');

export const editorTool = {
  id: 'editor', name: 'PDF Editor', desc: 'Edit text, add text, sign, highlight, draw, insert images and redact.', icon: I.editor, color: C, category: 'edit', accepts: 'pdf', multi: false, isNew: true,
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    const ed = { pages: [], mode: 'select', selected: null, zoom: 1, undo: [], pen: { color: '#ef4444', width: 3 }, text: { size: 14, color: '#000000', family: 'Helvetica' }, pending: null };
    const stack = h('div', { class: 'pages-stack' });
    const toolbar = h('div', { class: 'editor-toolbar' });
    const props = h('div');
    const MODES = [['select', 'Select'], ['edittext', 'Edit text'], ['text', 'Add text'], ['whiteout', 'Whiteout'], ['highlight', 'Highlight'], ['rect', 'Box'], ['draw', 'Draw'], ['sign', 'Sign'], ['image', 'Image'], ['redact', 'Redact']];
    const modeBtns = {};
    for (const [id, label] of MODES) {
      modeBtns[id] = h('button', { class: 'tool-btn' + (id === ed.mode ? ' active' : ''), title: label, html: I[id] + `<span>${label}</span>`, onclick: () => setMode(id) });
      toolbar.append(modeBtns[id]);
    }
    const undoBtn = h('button', { class: 'tool-btn', title: 'Undo (Ctrl+Z)', html: I.undo, onclick: undo });
    const zoomLbl = h('span', { class: 'small muted', style: { minWidth: '44px', textAlign: 'center' } }, '100%');
    toolbar.append(h('span', { class: 'sep' }), undoBtn, h('span', { class: 'sep' }),
      h('button', { class: 'tool-btn', onclick: () => setZoom(ed.zoom - 0.15) }, '−'), zoomLbl, h('button', { class: 'tool-btn', onclick: () => setZoom(ed.zoom + 0.15) }, '+'));

    panelBody.append(props);
    const saveBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ctx.run('Saving PDF', exportPdf) }, 'Download PDF');
    const resetBtn = h('button', { class: 'btn btn-ghost btn-sm', onclick: () => ctx.state.files[0] && load(ctx.state.files[0]) }, 'Discard changes');
    panelFoot.append(saveBtn, resetBtn);

    /* ---------- mode / zoom / props ---------- */
    async function setMode(m) {
      if (m === 'sign') { const png = await signatureModal(ctx); if (!png) return; ed.pending = png; }
      if (m === 'image') { const [f] = await ctx.pickFiles('.png,.jpg,.jpeg,.webp', false); if (!f) return; ed.pending = await fileToPng(f); }
      ed.mode = m; select(null);
      Object.entries(modeBtns).forEach(([id, b]) => b.classList.toggle('active', id === m));
      for (const p of ed.pages) { p.overlay.className = 'overlay mode-' + m + (['text', 'whiteout', 'highlight', 'rect', 'redact', 'sign', 'image'].includes(m) ? ' crosshair' : ''); p.draw.classList.toggle('on', m === 'draw'); }
      renderProps();
    }
    function setZoom(z) { ed.zoom = Math.min(3, Math.max(0.4, z)); stack.style.zoom = ed.zoom; zoomLbl.textContent = Math.round(ed.zoom * 100) + '%'; }
    function renderProps() {
      const o = ed.selected; props.replaceChildren();
      const tips = { select: 'Click an object to select it. Drag to move, use the corner handle to resize, Delete to remove.', edittext: 'Click any existing line of text to retype it. The original is covered and re-set in a matching font.', text: 'Click anywhere on a page to add a new text box.', whiteout: 'Drag a box to cover content with white.', highlight: 'Drag over text to highlight it.', rect: 'Drag to draw a box outline.', draw: 'Draw freehand with the mouse or a pen.', sign: 'Click where the signature should go.', image: 'Click where the image should go.', redact: 'Drag over sensitive content. On export the page is rasterised so the text is really gone.' };
      props.append(h('h4', {}, 'Mode: ' + MODES.find(m => m[0] === ed.mode)[1]), h('p', { class: 'small muted' }, tips[ed.mode]));
      if (ed.mode === 'draw' || (o && o.type === 'draw')) {
        props.append(h('h4', {}, 'Pen'), h('div', { class: 'row' }, h('input', { type: 'color', value: ed.pen.color, oninput: e => ed.pen.color = e.target.value }), h('input', { type: 'range', min: 1, max: 20, value: ed.pen.width, style: { flex: 1 }, oninput: e => ed.pen.width = +e.target.value })));
      }
      if (ed.mode === 'text' || (o && (o.type === 'text' || o.type === 'existing'))) {
        const t = o ? o : ed.text; const apply = () => { if (o) styleText(o); };
        props.append(h('h4', {}, o ? 'Selected text' : 'New text style'),
          h('div', { class: 'row' },
            h('div', { class: 'field' }, h('label', {}, 'Size'), h('input', { class: 'input', type: 'number', min: 4, max: 200, value: Math.round(t.size ?? t.fontSize), oninput: e => { if (o) { o.size = +e.target.value; apply(); } else ed.text.size = +e.target.value; } })),
            h('div', { class: 'field' }, h('label', {}, 'Colour'), h('input', { type: 'color', value: t.color, oninput: e => { if (o) { o.color = e.target.value; apply(); } else ed.text.color = e.target.value; } }))),
          h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Font'), h('select', { class: 'input', onchange: e => { if (o) { o.family = e.target.value; apply(); } else ed.text.family = e.target.value; } }, ...Object.keys(FONT).map(f => h('option', { value: f, selected: (t.family || 'Helvetica') === f }, f)))),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!t.bold, onchange: e => { if (o) { o.bold = e.target.checked; apply(); } else ed.text.bold = e.target.checked; } }), 'Bold'));
      }
      if (o && o.type === 'rect') props.append(h('h4', {}, 'Box'), h('div', { class: 'row' }, h('input', { type: 'color', value: o.color, oninput: e => { o.color = e.target.value; o.el.style.borderColor = o.color; } }), h('input', { type: 'range', min: 1, max: 12, value: o.stroke, oninput: e => { o.stroke = +e.target.value; o.el.style.borderWidth = o.stroke + 'px'; } })));
      if (o && o.type === 'highlight') props.append(h('h4', {}, 'Highlight colour'), h('div', { class: 'row' }, ...['#ffe600', '#7cff5c', '#5cd9ff', '#ff8ad4', '#ffb35c'].map(c => h('button', { class: 'btn btn-icon', style: { background: c, borderColor: o.color === c ? '#000' : 'transparent' }, onclick: () => { o.color = c; o.el.style.background = hexA(c, .45); renderProps(); } }))));
      if (o) props.append(h('div', { style: { marginTop: '14px' } }, h('button', { class: 'btn btn-danger btn-sm', onclick: () => removeObj(o) }, 'Delete object')));
      const n = ed.pages.reduce((a, p) => a + p.objects.filter(x => x.type !== 'existing' || x.edited).length + p.paths.length, 0);
      props.append(h('h4', {}, 'Document'), h('p', { class: 'small muted' }, `${ed.pages.length} pages · ${n} change${n === 1 ? '' : 's'}`), h('p', { class: 'small muted' }, h('span', { class: 'kbd' }, 'Del'), ' remove · ', h('span', { class: 'kbd' }, 'Esc'), ' deselect · ', h('span', { class: 'kbd' }, 'Ctrl+Z'), ' undo'));
    }
    function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }

    /* ---------- load & render ---------- */
    async function load(f) {
      ed.pages = []; ed.undo = []; stack.replaceChildren(); select(null);
      stageBody.replaceChildren(toolbar, stack);
      const maxW = Math.min(820, stageBody.clientWidth - 40);
      for (let n = 1; n <= f.pageCount; n++) {
        const { canvas, viewport, page, scale, baseWidth, baseHeight } = await renderPage(f.doc, n, { width: maxW });
        canvas.className = 'base';
        const overlay = h('div', { class: 'overlay mode-select' });
        const draw = h('canvas', { class: 'drawcanvas', width: canvas.width, height: canvas.height });
        const wrap = h('div', { class: 'pdf-page', style: { width: canvas.width + 'px', height: canvas.height + 'px' } }, canvas, overlay, draw);
        const p = { n, wrap, overlay, draw, scale, baseWidth, baseHeight, w: canvas.width, h: canvas.height, objects: [], paths: [] };
        ed.pages.push(p); stack.append(wrap);
        wireOverlay(p); wireDraw(p);
        const lines = groupLines(await textItems(page, viewport));
        for (const l of lines) addObj(p, { type: 'existing', x: l.x, y: l.y, w: l.w, h: l.h, size: l.fontSize, baseline: l.baseline, family: l.family, color: '#000000', text: l.str, original: l.str, ox: l.x, oy: l.y, ow: l.w, oh: l.h }, { silent: true });
      }
      saveBtn.disabled = false; setMode('select');
    }

    /* ---------- objects ---------- */
    function addObj(p, o, { silent } = {}) {
      o.page = p; o.id = Math.random().toString(36).slice(2);
      const el = h('div', { class: 'obj obj-' + (o.type === 'existing' ? 'text obj-existing' : o.type) });
      o.el = el; place(o);
      if (o.type === 'text' || o.type === 'existing') { o.textEl = h('span', { class: 'txt' }, o.text); el.append(o.textEl); styleText(o); el.addEventListener('dblclick', () => editText(o)); o.textEl.addEventListener('blur', () => commitText(o)); o.textEl.addEventListener('input', () => { if (o.type === 'existing') el.classList.add('edited'); }); }
      if (o.type === 'rect') { el.style.borderColor = o.color; el.style.borderWidth = o.stroke + 'px'; }
      if (o.type === 'highlight') el.style.background = hexA(o.color, .45);
      if (o.type === 'image') el.append(h('img', { src: o.src, alt: '' }));
      el.append(h('div', { class: 'handle', onpointerdown: e => startResize(e, o) }), h('button', { class: 'del', onclick: e => { e.stopPropagation(); removeObj(o); } }, '✕'));
      el.addEventListener('pointerdown', e => onObjDown(e, o));
      p.overlay.append(el); p.objects.push(o);
      if (!silent) ed.undo.push(() => removeObj(o, true));
      return o;
    }
    function place(o) { Object.assign(o.el.style, { left: o.x + 'px', top: o.y + 'px', width: o.w ? o.w + 'px' : '', height: o.h && o.type !== 'text' && o.type !== 'existing' ? o.h + 'px' : '' }); }
    function styleText(o) { Object.assign(o.el.style, { fontSize: o.size + 'px', color: o.type === 'existing' && !o.edited ? '' : o.color, fontFamily: FONT[o.family] || FONT.Helvetica, fontWeight: o.bold ? '700' : '400', width: o.type === 'existing' ? '' : (o.w ? o.w + 'px' : '') }); if (o.type === 'existing') o.el.style.minWidth = o.ow + 'px'; }
    function removeObj(o, noUndo) { o.el.remove(); o.page.objects = o.page.objects.filter(x => x !== o); if (ed.selected === o) select(null); if (!noUndo) ed.undo.push(() => { o.page.overlay.append(o.el); o.page.objects.push(o); }); renderProps(); }
    function select(o) { if (ed.selected) ed.selected.el.classList.remove('selected'); ed.selected = o; if (o) o.el.classList.add('selected'); renderProps(); }
    function editText(o) { if (o.type === 'existing') { o.edited = true; o.el.classList.add('edited'); styleText(o); } o.el.classList.add('editing'); o.textEl.contentEditable = 'true'; o.textEl.focus(); const r = document.createRange(); r.selectNodeContents(o.textEl); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    function commitText(o) { o.el.classList.remove('editing'); o.textEl.contentEditable = 'false'; o.text = o.textEl.innerText.replace(/\n$/, ''); if (o.type === 'existing' && o.text === o.original && Math.abs(o.x - o.ox) < .5 && Math.abs(o.y - o.oy) < .5) { o.edited = false; o.el.classList.remove('edited'); styleText(o); } else if (o.type === 'text' && !o.text.trim()) removeObj(o, true); renderProps(); }
    function undo() { const u = ed.undo.pop(); if (u) u(); renderProps(); }

    /* ---------- pointer interactions ---------- */
    function local(e, p) { const r = p.overlay.getBoundingClientRect(); return { x: (e.clientX - r.left) / ed.zoom, y: (e.clientY - r.top) / ed.zoom }; }
    function onObjDown(e, o) {
      if (o.textEl && o.textEl.isContentEditable) return;
      if (o.type === 'existing' && !o.edited && ed.mode !== 'edittext' && ed.mode !== 'select') return;
      e.stopPropagation();
      if (ed.mode === 'edittext' && o.type === 'existing' && !o.edited) { select(o); editText(o); return; }
      if (ed.mode !== 'select' && ed.mode !== 'edittext') { setMode('select'); }
      select(o);
      const start = local(e, o.page); const ox = o.x, oy = o.y; let moved = false;
      const move = ev => { const c = local(ev, o.page); o.x = ox + c.x - start.x; o.y = oy + c.y - start.y; moved = true; place(o); };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); if (moved) { if (o.type === 'existing') { o.edited = true; o.el.classList.add('edited'); styleText(o); } ed.undo.push(() => { o.x = ox; o.y = oy; place(o); }); } };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    }
    function startResize(e, o) {
      e.stopPropagation(); e.preventDefault(); const start = local(e, o.page); const ow = o.el.offsetWidth, oh = o.el.offsetHeight, os = o.size;
      const move = ev => { const c = local(ev, o.page); o.w = Math.max(20, ow + c.x - start.x); if (o.type === 'text' || o.type === 'existing') { o.size = Math.max(4, os * (o.w / ow)); styleText(o); o.w = null; } else if (o.type === 'image') { o.h = oh * (o.w / ow); } else o.h = Math.max(10, oh + c.y - start.y); place(o); };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); renderProps(); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    }
    function wireOverlay(p) {
      p.overlay.addEventListener('pointerdown', e => {
        if (e.target !== p.overlay) return;
        const c = local(e, p);
        if (ed.mode === 'select' || ed.mode === 'edittext') { select(null); return; }
        if (ed.mode === 'text') { const o = addObj(p, { type: 'text', x: c.x, y: c.y - ed.text.size / 2, size: ed.text.size, color: ed.text.color, family: ed.text.family, bold: ed.text.bold, text: '' }); select(o); editText(o); return; }
        if ((ed.mode === 'sign' || ed.mode === 'image') && ed.pending) { const img = ed.pending; const w = Math.min(220, p.w * 0.4); const o = addObj(p, { type: 'image', x: c.x - w / 2, y: c.y - (w * img.height / img.width) / 2, w, h: w * img.height / img.width, src: img.src }); select(o); setMode('select'); return; }
        if (['whiteout', 'highlight', 'rect', 'redact'].includes(ed.mode)) {
          const type = ed.mode; const o = addObj(p, { type, x: c.x, y: c.y, w: 1, h: 1, color: type === 'highlight' ? '#ffe600' : '#ef4444', stroke: 2 }, { silent: true });
          const move = ev => { const m = local(ev, p); o.x = Math.min(c.x, m.x); o.y = Math.min(c.y, m.y); o.w = Math.abs(m.x - c.x); o.h = Math.abs(m.y - c.y); place(o); };
          const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); if (o.w < 4 || o.h < 4) removeObj(o, true); else { ed.undo.push(() => removeObj(o, true)); select(o); } renderProps(); };
          document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
        }
      });
    }
    function wireDraw(p) {
      const cx = p.draw.getContext('2d'); let path = null;
      const pt = e => { const r = p.draw.getBoundingClientRect(); return [(e.clientX - r.left) / ed.zoom, (e.clientY - r.top) / ed.zoom]; };
      p.draw.addEventListener('pointerdown', e => { if (ed.mode !== 'draw') return; p.draw.setPointerCapture(e.pointerId); path = { color: ed.pen.color, width: ed.pen.width, pts: [pt(e)] }; });
      p.draw.addEventListener('pointermove', e => { if (!path) return; path.pts.push(pt(e)); redraw(p); });
      const end = () => { if (!path) return; if (path.pts.length > 1) { p.paths.push(path); ed.undo.push(() => { p.paths = p.paths.filter(x => x !== path); redraw(p); }); } path = null; redraw(p); renderProps(); };
      p.draw.addEventListener('pointerup', end); p.draw.addEventListener('pointercancel', end);
      function redraw(pg) { cx.clearRect(0, 0, pg.w, pg.h); for (const s of [...pg.paths, path].filter(Boolean)) { cx.strokeStyle = s.color; cx.lineWidth = s.width; cx.lineCap = cx.lineJoin = 'round'; cx.beginPath(); s.pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke(); } }
    }
    const onKey = e => {
      if (e.target.isContentEditable) { if (e.key === 'Escape') e.target.blur(); return; }
      if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selected) { removeObj(ed.selected); e.preventDefault(); }
      if (e.key === 'Escape') { select(null); setMode('select'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    const prevTeardown = ctx.onFilesChange; // keep listener cleanup with the workspace teardown
    ctx.onFilesChange(files => { if (!files.length) { saveBtn.disabled = true; stageBody.replaceChildren(ctx.fileDropzone({ hint: 'PDF · you can also drop a file anywhere' })); props.replaceChildren(); return; } load(files[0]); });
    // remove key listener when workspace is torn down
    const obs = new MutationObserver(() => { if (!document.body.contains(stageBody)) { document.removeEventListener('keydown', onKey); obs.disconnect(); } });
    obs.observe(document.getElementById('view'), { childList: true });

    /* ---------- export ---------- */
    async function exportPdf(prog) {
      const f = ctx.state.files[0]; const doc = await PDFDocument.load(f.bytes, { ignoreEncryption: true });
      const fonts = {}; const font = async (family, bold) => { const key = (family || 'Helvetica') + (bold ? 'B' : ''); if (!fonts[key]) { const map = { Helvetica: bold ? 'HelveticaBold' : 'Helvetica', Times: bold ? 'TimesRomanBold' : 'TimesRoman', Courier: bold ? 'CourierBold' : 'Courier' }; fonts[key] = await doc.embedFont(StandardFonts[map[family] || map.Helvetica]); } return fonts[key]; };
      // 1) true redaction: rasterise affected pages with black boxes burnt in
      const redacted = ed.pages.filter(p => p.objects.some(o => o.type === 'redact'));
      for (const p of redacted) {
        const boxes = p.objects.filter(o => o.type === 'redact');
        await rasterizePages(f.doc, doc, [p.n - 1], (idx, g, vp) => { const k = vp.scale / p.scale; g.fillStyle = '#000'; boxes.forEach(b => g.fillRect(b.x * k, b.y * k, b.w * k, b.h * k)); }, 2.5);
      }
      // 2) everything else
      for (let i = 0; i < ed.pages.length; i++) {
        const p = ed.pages[i]; const page = doc.getPage(p.n - 1); const { height } = page.getSize(); const k = 1 / p.scale;
        const Y = y => height - y * k; // css top → pdf y
        for (const o of p.objects) {
          if (o.type === 'redact') continue;
          if (o.type === 'existing' && !o.edited) continue;
          if (o.type === 'existing') {
            page.drawRectangle({ x: o.ox * k - 1, y: Y(o.oy + o.oh) - 1, width: o.ow * k + 2, height: o.oh * k + 2, color: rgb(1, 1, 1) });
            const fnt = await font(o.family, o.bold); const text = sanitize(o.text);
            if (text.trim()) page.drawText(text, { x: o.x * k, y: Y(o.y + (o.baseline - o.oy)), size: o.size * k, font: fnt, color: hexToRgb(o.color) });
          } else if (o.type === 'text') {
            const fnt = await font(o.family, o.bold); const lines = sanitize(o.text).split('\n'); const fs = o.size * k; const lh = fs * 1.2;
            lines.forEach((ln, j) => ln.trim() && page.drawText(ln, { x: (o.x + 4) * k, y: Y(o.y + 2 + o.size * 0.92) - j * lh, size: fs, font: fnt, color: hexToRgb(o.color) }));
          } else if (o.type === 'whiteout') page.drawRectangle({ x: o.x * k, y: Y(o.y + o.h), width: o.w * k, height: o.h * k, color: rgb(1, 1, 1) });
          else if (o.type === 'highlight') page.drawRectangle({ x: o.x * k, y: Y(o.y + o.h), width: o.w * k, height: o.h * k, color: hexToRgb(o.color), opacity: 0.45, blendMode: BlendMode.Multiply });
          else if (o.type === 'rect') page.drawRectangle({ x: o.x * k, y: Y(o.y + o.h), width: o.w * k, height: o.h * k, borderColor: hexToRgb(o.color), borderWidth: o.stroke * k });
          else if (o.type === 'image') { const img = await doc.embedPng(o.src); page.drawImage(img, { x: o.x * k, y: Y(o.y + o.h), width: o.w * k, height: o.h * k }); }
        }
        if (p.paths.length) { const img = await doc.embedPng(p.draw.toDataURL('image/png')); page.drawImage(img, { x: 0, y: 0, width: p.w * k, height: p.h * k }); }
        prog((i + 1) / ed.pages.length);
      }
      download(await doc.save(), baseName(f.name) + '-edited.pdf');
    }
  },
};

/* ---------- helpers: images & signature ---------- */
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function fileToPng(file) { const img = await loadImg(URL.createObjectURL(file)); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); return { src: c.toDataURL('image/png'), width: c.width, height: c.height }; }
function trimCanvas(c) {
  const g = c.getContext('2d'); const { data } = g.getImageData(0, 0, c.width, c.height); let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0) return null; const o = document.createElement('canvas'); o.width = x1 - x0 + 8; o.height = y1 - y0 + 8; o.getContext('2d').drawImage(c, x0 - 4, y0 - 4, o.width, o.height, 0, 0, o.width, o.height); return o;
}
function removeWhite(c) { const g = c.getContext('2d'); const im = g.getImageData(0, 0, c.width, c.height); const d = im.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 235) d[i + 3] = 0; else if (l > 180) d[i + 3] = Math.round((235 - l) / 55 * 255); } g.putImageData(im, 0, 0); }

export function signatureModal(ctx) {
  const { h } = ctx;
  return new Promise(resolve => {
    let tab = 'draw'; let uploaded = null;
    const pad = h('canvas', { class: 'sig-pad', width: 1000, height: 400 }); const g = pad.getContext('2d'); g.lineWidth = 5; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#111';
    let drawing = false; const pt = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
    pad.onpointerdown = e => { drawing = true; pad.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...pt(e)); };
    pad.onpointermove = e => { if (drawing) { g.lineTo(...pt(e)); g.stroke(); } };
    pad.onpointerup = pad.onpointercancel = () => drawing = false;
    const typed = h('input', { class: 'input', placeholder: 'Type your name', style: { fontFamily: '"Dancing Script", "Segoe Script", cursive', fontSize: '28px' } });
    const upBtn = h('button', { class: 'btn', onclick: () => ctx.pickFiles('.png,.jpg,.jpeg', false).then(async f => { if (!f[0]) return; uploaded = await loadImg(URL.createObjectURL(f[0])); upPrev.src = uploaded.src; upPrev.hidden = false; }) }, 'Choose image of your signature');
    const upPrev = h('img', { hidden: true, style: { maxWidth: '100%', maxHeight: '160px', marginTop: '10px', border: '1px solid var(--line)', borderRadius: '8px', background: '#fff' } });
    const cleanBg = h('input', { type: 'checkbox', checked: true });
    const panes = { draw: h('div', {}, pad, h('button', { class: 'btn btn-sm btn-ghost', style: { marginTop: '8px' }, onclick: () => g.clearRect(0, 0, pad.width, pad.height) }, 'Clear')), type: h('div', {}, typed, h('p', { class: 'small muted' }, 'Rendered in a handwriting font.')), upload: h('div', {}, upBtn, upPrev, h('label', { class: 'check', style: { marginTop: '10px' } }, cleanBg, 'Remove white background')) };
    const body = h('div', {});
    const seg = h('div', { class: 'seg', style: { marginBottom: '14px' } }, ...['draw', 'type', 'upload'].map(t => h('button', { class: t === tab ? 'active' : '', onclick: e => { tab = t; seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === e.target)); Object.entries(panes).forEach(([k, p]) => p.hidden = k !== tab); } }, t[0].toUpperCase() + t.slice(1))));
    Object.entries(panes).forEach(([k, p]) => p.hidden = k !== tab);
    body.append(seg, ...Object.values(panes), h('div', { class: 'row', style: { marginTop: '18px', justifyContent: 'flex-end' } }, h('button', { class: 'btn', onclick: () => { m.close(); resolve(null); } }, 'Cancel'), h('button', { class: 'btn btn-primary', onclick: () => {
      let c = null;
      if (tab === 'draw') c = trimCanvas(pad);
      else if (tab === 'type') { if (!typed.value.trim()) return; c = document.createElement('canvas'); c.width = 1200; c.height = 300; const cg = c.getContext('2d'); cg.font = '120px "Dancing Script", "Segoe Script", cursive'; cg.fillStyle = '#111'; cg.textBaseline = 'middle'; cg.fillText(typed.value, 30, 150); c = trimCanvas(c); }
      else if (uploaded) { c = document.createElement('canvas'); c.width = uploaded.naturalWidth; c.height = uploaded.naturalHeight; c.getContext('2d').drawImage(uploaded, 0, 0); if (cleanBg.checked) removeWhite(c); c = trimCanvas(c) || c; }
      if (!c) { ctx.toast('Draw, type or upload a signature first.', 'err'); return; }
      m.close(); resolve({ src: c.toDataURL('image/png'), width: c.width, height: c.height });
    } }, 'Use signature')));
    const m = ctx.modal('Add your signature', body, { onClose: () => resolve(null) });
  });
}

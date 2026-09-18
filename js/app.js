// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint — premium app shell: router, tool registry, workspace, landing, pricing, account.
import { openPdf, thumbnail, fmtSize } from './engine.js';
import { PLANS, PRICES, IS_LOCAL, currentPlan, isPro, usageToday, checkAllowed, recordTask, billing, session } from './billing.js';
import { LEGAL } from './legal.js';
import { TOOLS, CATEGORIES } from './tools/index.js';

const view = document.getElementById('view');
const hiddenFile = document.getElementById('hiddenFile');

/* ---------- utilities ---------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
export function toast(msg, type = '') {
  const t = h('div', { class: 'toast ' + type }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3600);
}
export function pickFiles(accept = '.pdf', multiple = true) {
  return new Promise(res => {
    hiddenFile.accept = accept; hiddenFile.multiple = multiple; hiddenFile.value = '';
    hiddenFile.onchange = () => res([...hiddenFile.files]);
    hiddenFile.click();
  });
}
export function modal(title, body, { onClose } = {}) {
  const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(); } });
  const m = h('div', { class: 'modal' }, h('h3', {}, title), body);
  bg.append(m); document.body.append(bg);
  function close() { bg.remove(); onClose && onClose(); }
  return { close, el: m };
}
function icon(svg) { return h('span', { class: 'ico', html: svg }); }

/* ---------- theme ---------- */
const themeBtn = document.getElementById('themeBtn');
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('pagemint.theme', t); }
applyTheme(localStorage.getItem('pagemint.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtn.onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- plan chip ---------- */
function renderPlanChip() {
  const p = currentPlan();
  document.getElementById('planLabel').textContent = p.id === 'free' ? `Free · ${Math.max(0, p.tasksPerDay - usageToday())}/${p.tasksPerDay} left today` : p.name;
  document.getElementById('planChip').classList.toggle('pro', p.id !== 'free');
  document.getElementById('upgradeBtn').hidden = p.id !== 'free';
}
document.addEventListener('plan-change', renderPlanChip);
renderPlanChip();

/* ---------- shared workspace state ---------- */
export const state = { files: [] }; // [{file,name,size,bytes,doc,pageCount}]

async function ingest(rawFiles, tool) {
  const accept = tool?.accepts || 'pdf';
  const wanted = rawFiles.filter(f => accept === 'any' || (accept === 'pdf' ? /\.pdf$/i.test(f.name) : /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)));
  if (!wanted.length) { toast(accept === 'image' ? 'Please choose image files.' : 'Please choose PDF files.', 'err'); return; }
  const reason = checkAllowed({ files: wanted });
  if (reason) { showPaywall(reason); return; }
  for (const f of wanted) {
    try {
      if (/\.pdf$/i.test(f.name)) state.files.push(await openPdf(f));
      else state.files.push({ file: f, name: f.name, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()), doc: null, pageCount: 1, isImage: true });
    } catch (e) { console.error(e); toast(`Couldn't open ${f.name}: ${e.message}`, 'err'); }
  }
  if (!tool?.multi && state.files.length > 1) state.files = state.files.slice(-1);
  document.dispatchEvent(new CustomEvent('files-change'));
}

export function showPaywall(reason) {
  const body = h('div', { class: 'paywall' },
    h('div', { class: 'big' }, '🔒'),
    h('p', {}, reason),
    h('p', { class: 'small muted' }, 'Pro: unlimited tasks, 500 MB files, batch processing and AI tools. Cancel anytime.'),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('a', { class: 'btn btn-primary', href: '#/pricing', onclick: () => m.close() }, 'See plans'),
      h('button', { class: 'btn', onclick: () => m.close() }, 'Not now')));
  const m = modal('Upgrade to continue', body);
}

/* ---------- premium grain overlay ---------- */
function ensurePremiumGrain() {
  let grain = document.getElementById('premiumGrain');
  if (!grain) {
    grain = document.createElement('div');
    grain.id = 'premiumGrain';
    grain.className = 'app-premium-grain';
    grain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(grain);
  }
  return grain;
}

/* ---------- landing ---------- */
function toolCard(t) {
  return h('a', { class: 'tool-card', href: '#/tool/' + t.id },
    h('span', { class: 'ico', style: { background: t.color }, html: t.icon }),
    h('h3', {}, t.name), h('p', {}, t.desc),
    t.pro ? h('span', { class: 'badge badge-pro' }, 'Pro') : t.isNew ? h('span', { class: 'badge badge-new' }, 'New') : null);
}
function renderLanding() {
  ensurePremiumGrain();
  const dz = h('div', { class: 'dropzone-hero', onclick: () => pickFiles('.pdf').then(f => { if (f.length) { state.files = []; ingest(f, { multi: true }).then(() => navigate('#/tool/editor')); } }) },
    h('div', { style: { fontSize: '40px' } }, '📄'),
    h('h3', { style: { margin: '8px 0 4px' } }, 'Drop a PDF here to start editing'),
    h('p', { class: 'muted small', style: { margin: 0 } }, 'or click to browse · processed locally in your browser'));
  wireDrop(dz, f => { state.files = []; ingest(f, { multi: true }).then(() => navigate('#/tool/editor')); });
  const cats = CATEGORIES.map(c => [h('div', { class: 'cat-title' }, c.name), h('div', { class: 'tool-grid' }, TOOLS.filter(t => t.category === c.id).map(toolCard))]);
  view.replaceChildren(
    h('section', { class: 'hero' },
      h('h1', {}, 'Every PDF tool. ', h('span', { class: 'grad-text' }, 'Zero uploads.')),
      h('p', {}, 'Edit, sign, merge, split, compress, redact and convert PDFs right in your browser. Your documents never touch a server, so they are yours alone.'),
      h('div', { class: 'hero-cta' }, h('a', { class: 'btn btn-primary btn-lg', href: '#/tool/editor' }, 'Open the editor'), h('a', { class: 'btn btn-lg', href: '#/tools' }, 'Browse all tools')),
      dz,
      h('div', { class: 'trust' }, h('span', {}, '🔒 Local processing'), h('span', {}, '⚡ No queue, no waiting'), h('span', {}, '🚫 No watermarks'), h('span', {}, '📱 Works on mobile'))),
    h('section', { class: 'section' }, h('h2', {}, 'All tools'), h('p', { class: 'lead' }, 'Everything the big PDF sites do, without sending your files anywhere.'), ...cats.flat()),
    h('section', { class: 'section' }, h('h2', {}, 'Why Pagemint'),
      h('div', { class: 'features' },
        feature('🔐', 'Private by design', 'Competitors upload your file to their servers and keep it for hours. Pagemint runs entirely on your device.'),
        feature('🖊️', 'Real text editing', 'Click any line and retype it. Size and colour are matched; the text is re-set in a standard font.'),
        feature('⬛', 'True redaction', 'Redacted areas are rasterised out of the file, not just covered with a box.'),
        feature('🤖', 'AI that reads for you', 'Summarise, extract tables, ask questions across a 300-page contract in seconds.'),
        feature('💸', 'Honest pricing', 'A free tier that is actually useful, a weekly pass for one-off jobs, and no surprise renewals.'),
        feature('⚡', 'No queue', 'Large files process instantly because there is no server roundtrip.'))));
}
function feature(ico, title, text) { return h('div', { class: 'feature' }, h('div', { class: 'ico' }, ico), h('h3', {}, title), h('p', {}, text)); }

function wireDrop(el, onFiles) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); onFiles([...e.dataTransfer.files]); });
}

/* ---------- tools index ---------- */
function renderToolsIndex() {
  ensurePremiumGrain();
  view.replaceChildren(h('section', { class: 'section' }, h('h2', {}, 'All tools'), h('p', { class: 'lead' }, 'Pick a tool, drop your files, download. That is it.'),
    ...CATEGORIES.map(c => [h('div', { class: 'cat-title' }, c.name), h('div', { class: 'tool-grid' }, TOOLS.filter(t => t.category === c.id).map(toolCard))]).flat()));
}

/* ---------- workspace ---------- */
let currentTool = null; let teardown = null;
function renderWorkspace(toolId) {
  ensurePremiumGrain();
  const tool = TOOLS.find(t => t.id === toolId);
  if (!tool) return navigate('#/tools');
  if (teardown) { try { teardown(); } catch {} teardown = null; }
  currentTool = tool;
  if (tool.pro && !isPro()) { showPaywall(`${tool.name} is a Pro tool.`); }
  if (!tool.multi && state.files.length > 1) state.files = state.files.slice(0, 1);
  if (tool.accepts !== 'any') state.files = state.files.filter(f => tool.accepts === 'image' ? f.isImage : !f.isImage);

  const search = h('input', { class: 'input search', placeholder: 'Search tools…', oninput: e => { const q = e.target.value.toLowerCase(); sidebar.querySelectorAll('a').forEach(a => a.hidden = q && !a.textContent.toLowerCase().includes(q)); } });
  const sidebar = h('aside', { class: 'sidebar' }, search,
    ...CATEGORIES.map(c => [h('div', { class: 'cat' }, c.name), ...TOOLS.filter(t => t.category === c.id).map(t => h('a', { href: '#/tool/' + t.id, class: t.id === tool.id ? 'active' : '' }, h('span', { class: 'ico', style: { background: t.color }, html: t.icon }), t.name, t.pro ? h('span', { class: 'badge badge-pro', style: { marginLeft: 'auto' } }, 'Pro') : null))]).flat());
  const stageBody = h('div', { class: 'stage-body' });
  const stage = h('section', { class: 'stage' }, h('div', { class: 'stage-head' }, h('span', { class: 'ico', style: { background: tool.color, width: '32px', height: '32px', borderRadius: '9px', display: 'grid', placeItems: 'center', color: '#fff' }, html: tool.icon }), h('div', {}, h('h2', {}, tool.name), h('div', { class: 'desc' }, tool.desc))), stageBody);
  const panelBody = h('div', { class: 'panel-body' });
  const panelFoot = h('div', { class: 'panel-foot' });
  const panel = h('aside', { class: 'panel' }, panelBody, panelFoot);
  view.replaceChildren(h('div', { class: 'workspace' }, sidebar, stage, panel));

  const ctx = {
    tool, state, h, toast, modal, pickFiles, stageBody, panelBody, panelFoot,
    addFiles: files => ingest(files, tool),
    removeFile: i => { state.files.splice(i, 1); document.dispatchEvent(new CustomEvent('files-change')); },
    clearFiles: () => { state.files = []; document.dispatchEvent(new CustomEvent('files-change')); },
    /** Wrap a download-producing action with plan checks + usage accounting. */
    async run(label, fn) {
      const reason = checkAllowed({ files: state.files.map(f => f.file), feature: tool.feature });
      if (reason) { showPaywall(reason); return; }
      const bar = h('div', { class: 'progress' }, h('div'));
      const status = h('div', { class: 'small muted', style: { marginTop: '6px' } }, label + '…');
      panelFoot.prepend(status); panelFoot.prepend(bar);
      try {
        await fn(p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; });
        recordTask(); toast('Done — your download has started.', 'ok');
      } catch (e) { console.error(e); toast('Failed: ' + e.message, 'err'); }
      finally { bar.remove(); status.remove(); }
    },
    fileDropzone(opts = {}) { return fileDropzone(ctx, opts); },
    onFilesChange(fn) { const handler = () => fn(state.files); document.addEventListener('files-change', handler); const prev = teardown; teardown = () => { document.removeEventListener('files-change', handler); prev && prev(); }; handler(); },
  };
  tool.mount(ctx);
}

/** Standard dropzone + file list for the stage. */
function fileDropzone(ctx, { hint } = {}) {
  const t = ctx.tool;
  const accept = t.accepts === 'image' ? '.png,.jpg,.jpeg,.webp,.gif,.bmp' : t.accepts === 'any' ? '.pdf,.png,.jpg,.jpeg,.webp' : '.pdf';
  const dz = h('div', { class: 'dropzone', onclick: () => pickFiles(accept, !!t.multi).then(f => f.length && ctx.addFiles(f)) },
    h('div', { class: 'big' }, t.accepts === 'image' ? '🖼️' : '📄'),
    h('h3', {}, t.multi ? 'Drop files here' : 'Drop a file here'),
    h('p', { class: 'muted', style: { margin: 0 } }, hint || (t.accepts === 'image' ? 'PNG, JPG, WEBP' : 'PDF') + ' · or click to browse'),
    h('p', { class: 'small muted' }, `Free: up to ${PLANS.free.maxFileMB} MB and ${PLANS.free.tasksPerDay} tasks/day · Pro: ${PLANS.pro.maxFileMB} MB, unlimited`));
  wireDrop(dz, f => ctx.addFiles(f));
  return dz;
}

/** Reusable file list with reorder + remove (for merge-like tools). */
export function fileList(ctx, { reorder = true } = {}) {
  const list = h('div', { class: 'file-list' });
  let dragIdx = null;
  ctx.state.files.forEach((f, i) => {
    const img = h('img', { class: 'thumb', alt: '' });
    if (f.doc) thumbnail(f.doc, 1, 88).then(u => img.src = u); else if (f.isImage) img.src = URL.createObjectURL(f.file);
    const item = h('div', { class: 'file-item', draggable: reorder },
      reorder ? h('span', { class: 'muted', style: { cursor: 'grab' } }, '⋮⋮') : null, img,
      h('div', { class: 'grow' }, h('div', { class: 'name' }, f.name), h('div', { class: 'meta' }, `${fmtSize(f.size)}${f.doc ? ' · ' + f.pageCount + ' page' + (f.pageCount > 1 ? 's' : '') : ''}`)),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => ctx.removeFile(i) }, '✕'));
    if (reorder) {
      item.addEventListener('dragstart', () => { dragIdx = i; item.classList.add('dragging'); });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', e => e.preventDefault());
      item.addEventListener('drop', e => { e.preventDefault(); if (dragIdx == null || dragIdx === i) return; const [m] = ctx.state.files.splice(dragIdx, 1); ctx.state.files.splice(i, 0, m); document.dispatchEvent(new CustomEvent('files-change')); });
    }
    list.append(item);
  });
  return list;
}

/* ---------- contact ---------- */
function renderContact() {
  ensurePremiumGrain();
  const nameIn = h('input', { class: 'input', type: 'text', placeholder: 'Your name' });
  const emailIn = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com' });
  const msgIn = h('textarea', { class: 'input', placeholder: 'How can we help?' });
  const box = h('section', { class: 'contact-wrap' },
    h('div', { class: 'contact-card' },
      h('h2', {}, 'Contact Nexora Labs'),
      h('p', { class: 'lead' }, 'Send us a message and we will get back to you.'),
      h('div', { class: 'field' }, h('label', {}, 'Name'), nameIn),
      h('div', { class: 'field' }, h('label', {}, 'Email'), emailIn),
      h('div', { class: 'field' }, h('label', {}, 'Message'), msgIn),
      h('button', { class: 'btn btn-primary btn-full', onclick: async () => {
        const name = nameIn.value.trim();
        const email = emailIn.value.trim();
        const message = msgIn.value.trim();
        if (!name || !email || !message) return toast('Please fill all fields', 'err');
        try {
          await billing.api('/api/contact', { method: 'POST', body: JSON.stringify({ name, email, message }) });
          toast('Message sent! We will get back to you soon.', 'ok');
          nameIn.value = ''; emailIn.value = ''; msgIn.value = '';
        } catch (e) { toast(`${e.message}. You can also email ${SUPPORT_EMAIL}.`, 'err'); }
      } }, 'Send message'),
      h('p', { class: 'small muted', style: { textAlign: 'center', marginTop: '14px' } }, 'Or email ', h('a', { href: 'mailto:' + SUPPORT_EMAIL, style: { textDecoration: 'underline' } }, SUPPORT_EMAIL))));
  view.replaceChildren(box);
}

/* ---------- account ---------- */
function renderAccount() {
  ensurePremiumGrain();
  const s = session.get(); const p = currentPlan();
  const emailIn = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', value: s.email || '' });
  const box = h('section', { class: 'account-section' },
    h('h2', { style: { marginBottom: '8px' } }, 'Account'),
    h('p', { class: 'lead', style: { marginBottom: '20px' } }, s.email ? `Signed in as ${s.email}` : 'Sign in with a magic link to sync your plan across devices.'),
    h('div', { class: 'account-card' },
      h('h3', { style: { margin: '0 0 8px 0' } }, `Current plan: ${p.name}`),
      h('p', { style: { margin: '0', color: 'var(--ink-2)' } }, p.id === 'free' ? `${usageToday()} of ${p.tasksPerDay} free tasks used today.` : `Unlimited tasks. ${s.expires ? 'Renews ' + new Date(s.expires).toLocaleDateString() : ''}`),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        p.id === 'free' ? h('a', { class: 'btn btn-primary', href: '#/pricing' }, 'Upgrade') : h('button', { class: 'btn', onclick: () => billing.portal().catch(e => toast(e.message, 'err')) }, 'Manage billing'),
        s.email ? h('button', { class: 'btn btn-ghost', onclick: () => { session.clear(); renderAccount(); } }, 'Sign out') : null)),
    !s.email ? h('div', { class: 'account-card', style: { marginTop: '14px' } },
      h('h3', { style: { margin: '0 0 12px 0' } }, 'Sign in'),
      h('div', { class: 'field' }, h('label', {}, 'Email'), emailIn),
      h('button', { class: 'btn btn-primary', onclick: async () => {
        try { await billing.requestLogin(emailIn.value); toast('Magic link sent. Check your inbox.', 'ok'); }
        catch (e) { toast('Auth server not reachable: ' + e.message, 'err'); }
      } }, 'Send magic link')) : null,
    // Development only: never shown on the live site.
    IS_LOCAL ? h('p', { class: 'small muted', style: { marginTop: '20px' } }, 'Developer? ', h('button', { class: 'btn btn-sm', onclick: () => { billing.devUnlock(); toast('Dev Pro unlocked for 24h', 'ok'); renderAccount(); } }, 'Unlock Pro locally (dev)')) : null);
  view.replaceChildren(box);
}

/* ---------- pricing ---------- */
function renderPricing() {
  ensurePremiumGrain();
  let yearly = true;
  const wrap = h('section', { class: 'section', style: { textAlign: 'center' } });
  function draw() {
    const proPrice = yearly ? (PRICES.pro.yearly / 12).toFixed(0) : PRICES.pro.monthly;
    wrap.replaceChildren(
      h('h2', {}, 'Simple, honest pricing'),
      h('p', { class: 'lead' }, 'Free for everyday use. Pro when you need more. No dark patterns, cancel in one click.'),
      h('div', { class: 'billing-toggle' },
        h('div', { class: 'seg' },
          h('button', { class: yearly ? '' : 'active', onclick: () => { yearly = false; draw(); } }, 'Monthly'),
          h('button', { class: yearly ? 'active' : '', onclick: () => { yearly = true; draw(); } }, 'Yearly')),
        h('span', { class: 'save-pill' }, 'Save 33% yearly')),
      h('div', { class: 'pricing' },
        priceCard('Free', 0, '', ['3 tasks per day', 'Files up to 25 MB', 'All core tools', 'No watermark, ever', 'no:Batch processing', 'no:AI tools'], h('a', { class: 'btn', href: '#/tools' }, 'Start free')),
        priceCard('Pro', proPrice, yearly ? `billed $${PRICES.pro.yearly}/year` : 'billed monthly', ['Unlimited tasks', 'Files up to 500 MB', 'Batch up to 50 files', 'AI summarise, chat and extract', 'Email support'], h('button', { class: 'btn btn-primary', onclick: () => startCheckout('pro', yearly ? 'yearly' : 'monthly') }, 'Go Pro'), true),
        h('div', { class: 'price-card' },
          h('div', { class: 'tier' }, 'Teams'),
          h('div', { class: 'price' }, 'Let’s talk'),
          h('div', { class: 'small muted' }, 'Pro for 3 or more people'),
          h('ul', {}, h('li', {}, 'Everything in Pro'), h('li', {}, 'One invoice for the whole team'), h('li', {}, 'Volume pricing')),
          h('a', { class: 'btn', href: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Pagemint for teams')}` }, 'Email us'))),
      h('div', { style: { marginTop: '18px' } },
        h('p', { class: 'muted small' }, 'One-off job? ', h('button', { class: 'btn btn-sm', onclick: () => startCheckout('pro', 'weekly') }, `Get a 7-day Pro pass for $${PRICES.pro.weekly}`), ' · does not auto-renew.')),
      h('div', { class: 'faq', style: { textAlign: 'left' } },
        faq('Do my files get uploaded?', 'No. Every tool except AI runs completely in your browser. The AI tools send only the extracted text to our server, never the file itself, and nothing is stored after the reply.'),
        faq('Can I cancel anytime?', 'Yes. Manage or cancel from your account page and you keep Pro until the end of the period you paid for. Yearly plans are refundable within 14 days. See the refund policy for details.'),
        faq('What counts as a task?', 'One download. Editing, previewing and re-running a tool without downloading is free.'),
        faq('Is there a student or non-profit discount?', 'Yes, 50% off Pro. Email us from your institutional address.')));
  }
  draw();
  view.replaceChildren(wrap);
}
function priceCard(tier, price, sub, feats, cta, featured) {
  return h('div', { class: 'price-card' + (featured ? ' featured' : '') },
    featured ? h('span', { class: 'badge badge-new', style: { position: 'absolute', top: '-11px', left: '24px' } }, 'Most popular') : null,
    h('div', { class: 'tier' }, tier),
    h('div', { class: 'price' }, price === 0 ? '$0' : `$${price}`, h('small', {}, price === 0 ? '' : ' /month')),
    h('div', { class: 'small muted' }, sub || ' '),
    h('ul', {}, feats.map(f => f.startsWith('no:') ? h('li', { class: 'no' }, f.slice(3)) : h('li', {}, f))),
    cta);
}
function faq(q, a) { return h('details', {}, h('summary', {}, q), h('p', {}, a)); }
async function startCheckout(plan, interval) {
  try { await billing.checkout(plan, interval); }
  catch (e) { toast('Checkout could not start: ' + e.message, 'err'); }
}

/* ---------- legal ---------- */
const SUPPORT_EMAIL = 'thenexoralabstoday@gmail.com';
function renderLegal(kind) {
  ensurePremiumGrain();
  const doc = LEGAL[kind];
  view.replaceChildren(h('article', { class: 'legal' },
    h('h1', {}, doc.title),
    h('p', { class: 'small muted' }, 'Last updated ' + doc.updated),
    ...doc.sections.map(([heading, ...paras]) => [h('h2', {}, heading), ...paras.map(p => h('p', {}, p))]).flat(),
    h('p', { class: 'muted' }, 'Questions? Email ', h('a', { href: 'mailto:' + SUPPORT_EMAIL }, SUPPORT_EMAIL), '.')));
}

/* ---------- router ---------- */
export function navigate(hash) { location.hash = hash; }
function route() {
  const hash = location.hash || '#/';
  const params = new URLSearchParams(location.search);
  if (params.get('login')) { billing.completeLogin(params.get('login')).then(() => { toast('Signed in', 'ok'); history.replaceState({}, '', location.pathname + location.hash); }).catch(e => toast(e.message, 'err')); }
  if (params.get('checkout') === 'success') {
    const sid = params.get('session_id');
    history.replaceState({}, '', location.pathname + '#/account');
    (sid ? billing.claim(sid) : billing.refresh())
      .then(() => { toast('Payment received. Welcome to Pro!', 'ok'); if (location.hash === '#/account') renderAccount(); })
      .catch(() => toast('Payment received. Sign in with the email you paid with to unlock Pro.', 'ok'));
  }
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', hash.startsWith('#/' + a.dataset.nav)));
  if (teardown && !hash.startsWith('#/tool/')) { try { teardown(); } catch {} teardown = null; }
  if (hash === '#/' || hash === '') renderLanding();
  else if (hash === '#/tools') renderToolsIndex();
  else if (hash === '#/pricing') renderPricing();
  else if (hash === '#/account') renderAccount();
  else if (hash === '#/contact') renderContact();
  else if (hash === '#/terms') renderLegal('terms');
  else if (hash === '#/privacy') renderLegal('privacy');
  else if (hash === '#/refunds') renderLegal('refunds');
  else if (hash.startsWith('#/tool/')) renderWorkspace(hash.slice(7));
  else renderLanding();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
billing.refresh();
route();

// Global drag-drop anywhere routes to the current tool or the editor.
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  if (e.target.closest('.dropzone, .dropzone-hero')) return;
  e.preventDefault();
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  if (currentTool && location.hash.startsWith('#/tool/')) ingest(files, currentTool);
  else { state.files = []; ingest(files, { multi: true }).then(() => navigate('#/tool/editor')); }
});

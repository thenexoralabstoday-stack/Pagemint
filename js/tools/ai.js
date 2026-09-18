// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// AI tools — text is extracted in the browser, only the text goes to the Pagemint server (never the file).
import { download, baseName } from '../engine.js';
import { API_BASE, billing, isPro } from '../billing.js';
import { extractAllText } from './convert.js';
import { fileList } from '../app.js';

const C = '#8b5cf6';
const svg = { ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/><path d="M5 17l.8 2 2 .8-2 .8L5 22l-.8-1.4-2-.8 2-.8z"/></svg>' };

const QUICK = [
  ['Summarise', 'Write a concise summary of this document in 5–8 bullet points, then one sentence on who it is for.'],
  ['Key facts', 'List every concrete fact: names, dates, amounts, deadlines, obligations. Use a table where helpful.'],
  ['Action items', 'Extract all action items, decisions and deadlines as a checklist with owners if mentioned.'],
  ['Explain simply', 'Explain this document in plain language a 12-year-old could follow. Flag anything unusual or risky.'],
  ['Tables → CSV', 'Find every table in the text and output each as CSV inside a code block, with a one-line caption.'],
  ['Translate → English', 'Translate the whole document into natural English, preserving headings and structure.'],
];

const chat = {
  id: 'ai-chat', name: 'AI summarise & chat', desc: 'Summarise, extract, translate or ask questions about a PDF.', icon: svg.ai, color: C, category: 'ai', accepts: 'pdf', multi: false, pro: true, feature: 'ai',
  mount(ctx) {
    const { h, stageBody, panelBody, panelFoot } = ctx;
    let text = ''; const history = [];
    const thread = h('div', { class: 'ai-chat' });
    const input = h('textarea', { class: 'input', rows: 3, placeholder: 'Ask anything about this document…' });
    const send = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => ask(input.value) }, 'Ask');
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
    panelBody.append(h('h4', {}, 'Quick actions'), h('div', { class: 'row' }, ...QUICK.map(([l, p]) => h('button', { class: 'btn btn-sm', onclick: () => ask(p, l) }, l))),
      h('h4', {}, 'Privacy'), h('p', { class: 'small muted' }, 'Only extracted text is sent to the Pagemint AI endpoint. The PDF itself never leaves your device and nothing is stored after the reply.'));
    const exportBtn = h('button', { class: 'btn', disabled: true, onclick: () => download(new Blob([history.map(m => `${m.role === 'user' ? 'You' : 'AI'}: ${m.content}`).join('\n\n')], { type: 'text/markdown' }), baseName(ctx.state.files[0].name) + '-ai-notes.md', 'text/markdown') }, 'Export conversation');
    panelFoot.append(input, send, exportBtn);
    async function ask(q, label) {
      if (!q.trim() || !text) return;
      if (!isPro()) { ctx.toast('AI tools need Pro.', 'err'); location.hash = '#/pricing'; return; }
      input.value = ''; const userMsg = { role: 'user', content: q }; history.push(userMsg);
      thread.append(h('div', { class: 'msg user' }, label || q)); const pending = h('div', { class: 'msg ai' }, 'Thinking…'); thread.append(pending); pending.scrollIntoView({ behavior: 'smooth' });
      send.disabled = true;
      try {
        const { answer } = await billing.api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ document: text, messages: history }) });
        history.push({ role: 'assistant', content: answer }); pending.textContent = answer; exportBtn.disabled = false;
      } catch (e) { history.pop(); pending.textContent = 'Error: ' + e.message + (API_BASE ? '' : ' (no API server configured)'); pending.style.color = 'var(--danger)'; }
      finally { send.disabled = false; }
    }
    ctx.onFilesChange(async files => {
      thread.replaceChildren(); history.length = 0; text = ''; send.disabled = true;
      if (!files.length) { stageBody.replaceChildren(ctx.fileDropzone()); return; }
      stageBody.replaceChildren(fileList(ctx, { reorder: false }), thread);
      thread.append(h('div', { class: 'msg ai' }, 'Reading document…'));
      const parts = await extractAllText(files[0].doc); text = parts.map((t, i) => `[Page ${i + 1}]\n${t}`).join('\n\n');
      thread.replaceChildren(h('div', { class: 'msg ai' }, text.trim() ? `Ready. I read ${files[0].pageCount} pages (${Math.round(text.length / 4).toLocaleString()} tokens). Pick a quick action or ask a question.` : 'This PDF has no text layer (it is probably a scan), so the AI tools cannot read it.'));
      send.disabled = !text.trim();
    });
  },
};

export const aiTools = [chat];

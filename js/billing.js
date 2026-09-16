// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint billing / plan gating.
// Free tier limits are enforced client-side for UX; the server re-checks anything that costs money (AI, OCR queue, storage).
export const API_BASE = (window.PAGEMINT_API || '').replace(/\/$/, '') || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'http://localhost:4242' : '');

export const PLANS = {
  free:  { id: 'free',  name: 'Free',  tasksPerDay: 3,        maxFileMB: 25,   maxFiles: 3,  ai: false, ocr: false, batch: false },
  pro:   { id: 'pro',   name: 'Pro',   tasksPerDay: Infinity, maxFileMB: 500,  maxFiles: 50, ai: true,  ocr: true,  batch: true },
  team:  { id: 'team',  name: 'Team',  tasksPerDay: Infinity, maxFileMB: 2048, maxFiles: 200, ai: true, ocr: true,  batch: true },
};

export const PRICES = {
  pro:  { monthly: 9,  yearly: 72,  weekly: 5 },   // yearly = $6/mo
  team: { monthly: 7,  yearly: 60 },               // per seat, min 3 seats
};

const KEY = 'pagemint.session';
const USAGE_KEY = 'pagemint.usage';

function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

export const session = {
  get() { return read(KEY, { plan: 'free', email: null, token: null, expires: null }); },
  set(s) { write(KEY, s); document.dispatchEvent(new CustomEvent('plan-change')); },
  clear() { localStorage.removeItem(KEY); document.dispatchEvent(new CustomEvent('plan-change')); },
};

export function currentPlan() {
  const s = session.get();
  if (s.expires && Date.now() > s.expires) return PLANS.free;
  return PLANS[s.plan] || PLANS.free;
}
export function isPro() { return currentPlan().id !== 'free'; }

function today() { return new Date().toISOString().slice(0, 10); }
export function usageToday() {
  const u = read(USAGE_KEY, {});
  return u.date === today() ? (u.count || 0) : 0;
}
export function recordTask() {
  const u = read(USAGE_KEY, {});
  write(USAGE_KEY, { date: today(), count: u.date === today() ? (u.count || 0) + 1 : 1 });
  document.dispatchEvent(new CustomEvent('plan-change'));
}

/** Returns null if allowed, or a reason string. */
export function checkAllowed({ files = [], feature } = {}) {
  const p = currentPlan();
  if (feature === 'ai' && !p.ai) return 'AI tools are part of Pagemint Pro.';
  if (feature === 'ocr' && !p.ocr) return 'OCR is part of Pagemint Pro.';
  if (feature === 'batch' && !p.batch) return 'Batch processing is part of Pagemint Pro.';
  if (files.length > p.maxFiles) return `Free plan handles up to ${p.maxFiles} files at once. Pro handles ${PLANS.pro.maxFiles}.`;
  const big = files.find(f => f.size > p.maxFileMB * 1048576);
  if (big) return `"${big.name}" is over the ${p.maxFileMB} MB free limit. Pro allows ${PLANS.pro.maxFileMB} MB.`;
  if (p.tasksPerDay !== Infinity && usageToday() >= p.tasksPerDay) return `You've used your ${p.tasksPerDay} free tasks for today. Go Pro for unlimited.`;
  return null;
}

async function api(path, opts = {}) {
  const s = session.get();
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(s.token ? { Authorization: 'Bearer ' + s.token } : {}), ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export const billing = {
  api,
  /** Start Stripe Checkout for a plan + interval. */
  async checkout(plan, interval) {
    const s = session.get();
    const { url } = await api('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, interval, email: s.email }) });
    location.href = url;
  },
  /** Send a magic link. */
  async requestLogin(email) { return api('/api/auth/magic', { method: 'POST', body: JSON.stringify({ email }) }); },
  /** Exchange a magic token for a session. */
  async completeLogin(token) {
    const me = await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
    session.set({ plan: me.plan, email: me.email, token: me.sessionToken, expires: me.expires });
    return me;
  },
  async refresh() {
    const s = session.get();
    if (!s.token) return;
    try { const me = await api('/api/me'); session.set({ ...s, plan: me.plan, expires: me.expires }); } catch { /* offline: keep cached */ }
  },
  async portal() { const { url } = await api('/api/billing/portal', { method: 'POST' }); location.href = url; },
  /** Local dev helper — pretend to be Pro without a server. */
  devUnlock() { session.set({ plan: 'pro', email: 'dev@localhost', token: null, expires: Date.now() + 86400e3 }); },
};

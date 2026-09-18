// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint server — serves the app and its API from one origin.
// Stateless: plans come from Stripe, sign-ins are signed tokens, so the server can be
// restarted or redeployed (e.g. on Render's free tier) without losing any customer.
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { createPlanResolver } from './plans.js';
import { signToken, readToken } from './tokens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
dotenv.config({ path: path.join(here, '.env') });

const env = process.env;
const PORT = Number(env.PORT || 4242);
const APP_URL = (env.APP_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const MAIL_FROM = env.MAIL_FROM || 'Pagemint <onboarding@resend.dev>';
const CONTACT_TO = env.CONTACT_TO || 'thenexoralabstoday@gmail.com';
const AI_DAILY_LIMIT = Number(env.AI_DAILY_LIMIT || 200);

const SESSION_SECRET = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!env.SESSION_SECRET) console.warn('SESSION_SECRET is not set: everyone is signed out whenever the server restarts.');

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
const plans = createPlanResolver(stripe);
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY or an `ant auth login` profile

// Only Pro is sold. Team seats are not built yet, so there is no Team checkout.
const PRICE = {
  'pro:monthly': env.STRIPE_PRICE_PRO_MONTHLY,
  'pro:yearly': env.STRIPE_PRICE_PRO_YEARLY,
  'pro:weekly': env.STRIPE_PRICE_PRO_WEEKLY,
};

const DAY = 86400e3;
const SESSION_DAYS = 90;
const MAGIC_MINUTES = 15;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render terminates TLS in front of us; needed for real client IPs
app.use((_, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
app.use(cors({ origin: true }));

/** Express 4 does not catch rejected promises: without this one failed Stripe call crashes the process. */
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Tiny sliding-window limiter, keyed by whatever the caller passes. */
const hits = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  const ok = recent.length < max;
  if (ok) recent.push(now);
  hits.set(key, recent);
  return ok;
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const validEmail = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254;

async function sendMail({ to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
  return true;
}

function issueSession(email) {
  return signToken(SESSION_SECRET, { kind: 'session', email, exp: Date.now() + SESSION_DAYS * DAY });
}

/* ---------- Stripe webhook: raw body, and only used to refresh cached plans ---------- */
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  try { stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  plans.forget(); // the next lookup re-reads Stripe, so a cancellation or renewal shows up at once
  res.json({ received: true });
});

app.use(express.json({ limit: '8mb' }));

/* ---------- auth ---------- */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const session = readToken(SESSION_SECRET, token, 'session');
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  req.email = session.email;
  next();
}

app.post('/api/auth/magic', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!allow('magic:' + email, 3, 15 * 60e3) || !allow('magic-ip:' + req.ip, 20, 60 * 60e3)) {
    return res.status(429).json({ error: 'Too many sign-in requests. Try again in a few minutes.' });
  }
  const token = signToken(SESSION_SECRET, { kind: 'magic', email, exp: Date.now() + MAGIC_MINUTES * 60e3 });
  const link = `${APP_URL}/?login=${encodeURIComponent(token)}#/account`;
  const sent = await sendMail({
    to: email,
    subject: 'Your Pagemint sign-in link',
    html: `<p>Click to sign in to Pagemint (valid ${MAGIC_MINUTES} minutes):</p><p><a href="${escapeHtml(link)}">Sign in to Pagemint</a></p><p>If you did not ask for this, ignore this email.</p>`,
  });
  if (!sent) console.log(`\n[magic link for ${email}]\n${link}\n`);
  res.json({ ok: true });
}));

app.post('/api/auth/verify', wrap(async (req, res) => {
  const magic = readToken(SESSION_SECRET, req.body.token, 'magic');
  if (!magic) return res.status(400).json({ error: 'This sign-in link has expired. Request a new one.' });
  const p = await plans.get(magic.email);
  res.json({ email: magic.email, plan: p.plan, sessionToken: issueSession(magic.email), expires: p.expires });
}));

app.get('/api/me', auth, wrap(async (req, res) => {
  const p = await plans.get(req.email);
  res.json({ email: req.email, plan: p.plan, expires: p.expires });
}));

/* ---------- billing ---------- */
app.post('/api/billing/checkout', wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet.' });
  const { plan = 'pro', interval = 'monthly', email } = req.body;
  const price = PRICE[`${plan}:${interval}`];
  if (!price) return res.status(400).json({ error: 'That plan is not available.' });
  const oneOff = interval === 'weekly';
  const session = await stripe.checkout.sessions.create({
    mode: oneOff ? 'payment' : 'subscription',
    line_items: [{ price, quantity: 1 }],
    customer_email: validEmail(String(email || '')) ? email : undefined,
    // A one-off payment only gets a Customer record if asked; plans are looked up by customer.
    ...(oneOff ? { customer_creation: 'always' } : { subscription_data: { metadata: { plan } } }),
    allow_promotion_codes: true,
    metadata: { plan, interval },
    success_url: `${APP_URL}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#/account`,
    cancel_url: `${APP_URL}/#/pricing`,
    automatic_tax: { enabled: false },
  });
  res.json({ url: session.url });
}));

/** After Checkout, sign the buyer in on this device using the email they paid with. */
app.post('/api/billing/claim', wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet.' });
  const id = String(req.body.sessionId || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: 'Invalid checkout session' });
  const cs = await stripe.checkout.sessions.retrieve(id);
  const paid = cs.status === 'complete' && ['paid', 'no_payment_required'].includes(cs.payment_status);
  const fresh = Date.now() - cs.created * 1000 < DAY;
  const email = (cs.customer_details?.email || cs.customer_email || '').toLowerCase();
  if (!paid || !fresh || !email) return res.status(400).json({ error: 'Checkout not completed' });
  plans.forget(email);
  const p = await plans.get(email);
  res.json({ email, plan: p.plan, sessionToken: issueSession(email), expires: p.expires });
}));

app.post('/api/billing/portal', auth, wrap(async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments are not configured yet.' });
  const { customerId } = await plans.get(req.email);
  if (!customerId) return res.status(400).json({ error: 'No billing account for this email yet.' });
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${APP_URL}/#/account` });
  res.json({ url: session.url });
}));

/* ---------- AI ---------- */
const SYSTEM = `You are Pagemint's document assistant. The user has loaded a PDF; its extracted text is provided as the document.
Answer strictly from the document. If the answer is not in it, say so. Quote page numbers like (p. 3) when citing.
Be concise and well structured: bullets and tables where they help, plain prose otherwise. Never invent figures.`;

const aiUsage = new Map(); // email -> { date, count }; resets on restart, which only ever errs in the customer's favour

app.post('/api/ai/chat', auth, wrap(async (req, res) => {
  const { plan } = await plans.get(req.email);
  if (plan === 'free') return res.status(402).json({ error: 'AI tools require Pro' });
  const today = new Date().toISOString().slice(0, 10);
  const usage = aiUsage.get(req.email)?.date === today ? aiUsage.get(req.email) : { date: today, count: 0 };
  if (usage.count >= AI_DAILY_LIMIT) return res.status(429).json({ error: 'Daily AI limit reached' });
  const { document = '', messages = [] } = req.body;
  if (!document.trim() || !messages.length) return res.status(400).json({ error: 'document and messages are required' });
  if (document.length > 2_500_000) return res.status(413).json({ error: 'Document too large for a single AI request. Split it first.' });
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-5',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: `<document>\n${document}\n</document>`, cache_control: { type: 'ephemeral' } },
      ],
      messages: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) })),
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'The assistant declined this request.' });
    const answer = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    usage.count++; aiUsage.set(req.email, usage);
    res.json({ answer, usage: msg.usage });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'AI is busy, try again in a moment' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'AI key not configured on server' });
    console.error(e); res.status(500).json({ error: 'AI request failed' });
  }
}));

/* ---------- contact ---------- */
app.post('/api/contact', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 200);
  const email = String(req.body?.email || '').trim().slice(0, 254);
  const message = String(req.body?.message || '').trim().slice(0, 5000);
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (!allow('contact:' + req.ip, 5, 60 * 60e3)) return res.status(429).json({ error: 'Too many messages. Please email us directly.' });

  // Always logged, so a message survives even if email delivery is not configured.
  console.log('[contact]', JSON.stringify({ name, email, message, receivedAt: new Date().toISOString() }));
  try {
    await sendMail({
      to: CONTACT_TO,
      replyTo: email,
      subject: `Pagemint contact: ${name}`,
      html: `<p><b>${escapeHtml(name)}</b> &lt;${escapeHtml(email)}&gt;</p><p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    });
  } catch (e) { console.error('contact email failed:', e.message); }
  res.json({ ok: true });
}));

app.get('/api/health', (_, res) => res.json({
  ok: true,
  stripe: !!stripe,
  prices: Object.fromEntries(Object.entries(PRICE).map(([k, v]) => [k, !!v])),
  email: !!env.RESEND_API_KEY,
  persistentSessions: !!env.SESSION_SECRET,
}));

app.use('/api', (_, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- the app itself ----------
   Only the front end is exposed. The server folder, docs, tests and dotfiles are never served. */
app.use('/css', express.static(path.join(root, 'css'), { maxAge: '1h' }));
app.use('/js', express.static(path.join(root, 'js'), { maxAge: '1h' }));
app.get(['/', '/index.html'], (_, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(root, 'index.html')));
app.use((_, res) => res.status(404).send('Not found'));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => console.log(`Pagemint on ${APP_URL} (port ${PORT}, stripe: ${!!stripe})`));

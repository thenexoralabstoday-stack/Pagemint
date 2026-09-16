// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Pagemint API — auth (magic link), Stripe billing, AI endpoint. Node 20+, ES modules.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db.js';

const {
  PORT = 4242, APP_URL = 'http://localhost:8080', STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, STRIPE_PRICE_PRO_WEEKLY, STRIPE_PRICE_TEAM_MONTHLY, STRIPE_PRICE_TEAM_YEARLY,
  RESEND_API_KEY, MAIL_FROM = 'Pagemint <login@pagemint.app>', AI_DAILY_LIMIT = 200,
} = process.env;

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY or an `ant auth login` profile
const app = express();
app.use(cors({ origin: true }));

/* ---------- Stripe webhook must see the raw body ---------- */
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).end();
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  const ev = event.data.object;
  if (event.type === 'checkout.session.completed') {
    const email = (ev.customer_details?.email || ev.customer_email || '').toLowerCase();
    const plan = ev.metadata?.plan || 'pro';
    const user = db.user(email);
    user.stripeCustomerId = ev.customer; user.plan = plan;
    if (ev.mode === 'payment') user.expires = Date.now() + 7 * 86400e3;   // weekly pass
    else { user.subscriptionId = ev.subscription; user.expires = null; }
    db.save();
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const user = db.findByCustomer(ev.customer);
    if (user) {
      const active = ['active', 'trialing', 'past_due'].includes(ev.status) && event.type !== 'customer.subscription.deleted';
      user.plan = active ? (ev.metadata?.plan || user.plan || 'pro') : 'free';
      user.expires = active ? (ev.current_period_end * 1000) : null;
      db.save();
    }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '8mb' }));

/* ---------- auth ---------- */
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = db.data.sessions[token];
  if (!s || s.exp < Date.now()) return res.status(401).json({ error: 'Not signed in' });
  req.user = db.user(s.email); req.email = s.email; next();
}
function effectivePlan(user) { if (!user) return 'free'; if (user.expires && user.expires < Date.now()) return 'free'; return user.plan || 'free'; }

app.post('/api/auth/magic', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  const token = crypto.randomBytes(24).toString('hex');
  db.data.magic[token] = { email, exp: Date.now() + 15 * 60e3 }; db.save();
  const link = `${APP_URL}/?login=${token}#/account`;
  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: MAIL_FROM, to: email, subject: 'Your Pagemint sign-in link', html: `<p>Click to sign in (valid 15 minutes):</p><p><a href="${link}">${link}</a></p>` }) });
  } else console.log(`\n[magic link for ${email}]\n${link}\n`);
  res.json({ ok: true });
});
app.post('/api/auth/verify', (req, res) => {
  const m = db.data.magic[req.body.token];
  if (!m || m.exp < Date.now()) return res.status(400).json({ error: 'Link expired' });
  delete db.data.magic[req.body.token];
  const sessionToken = crypto.randomBytes(32).toString('hex');
  db.data.sessions[sessionToken] = { email: m.email, exp: Date.now() + 90 * 86400e3 };
  const user = db.user(m.email); db.save();
  res.json({ email: m.email, plan: effectivePlan(user), sessionToken, expires: user.expires });
});
app.get('/api/me', auth, (req, res) => res.json({ email: req.email, plan: effectivePlan(req.user), expires: req.user.expires }));

/* ---------- billing ---------- */
const PRICE = { 'pro:monthly': STRIPE_PRICE_PRO_MONTHLY, 'pro:yearly': STRIPE_PRICE_PRO_YEARLY, 'pro:weekly': STRIPE_PRICE_PRO_WEEKLY, 'team:monthly': STRIPE_PRICE_TEAM_MONTHLY, 'team:yearly': STRIPE_PRICE_TEAM_YEARLY };
app.post('/api/billing/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured (set STRIPE_SECRET_KEY)' });
  const { plan = 'pro', interval = 'monthly', email } = req.body;
  const price = PRICE[`${plan}:${interval}`];
  if (!price) return res.status(400).json({ error: 'Unknown plan' });
  const weekly = interval === 'weekly';
  const session = await stripe.checkout.sessions.create({
    mode: weekly ? 'payment' : 'subscription',
    line_items: [{ price, quantity: plan === 'team' ? 3 : 1, ...(plan === 'team' ? { adjustable_quantity: { enabled: true, minimum: 3, maximum: 200 } } : {}) }],
    customer_email: email || undefined,
    allow_promotion_codes: true,
    ...(weekly ? {} : { subscription_data: { metadata: { plan } } }),
    metadata: { plan, interval },
    success_url: `${APP_URL}/?checkout=success`,
    cancel_url: `${APP_URL}/#/pricing`,
    automatic_tax: { enabled: false },
  });
  res.json({ url: session.url });
});
app.post('/api/billing/portal', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  if (!req.user.stripeCustomerId) return res.status(400).json({ error: 'No billing account yet' });
  const session = await stripe.billingPortal.sessions.create({ customer: req.user.stripeCustomerId, return_url: `${APP_URL}/#/account` });
  res.json({ url: session.url });
});

/* ---------- AI ---------- */
const SYSTEM = `You are Pagemint's document assistant. The user has loaded a PDF; its extracted text is provided as the document.
Answer strictly from the document. If the answer is not in it, say so. Quote page numbers like (p. 3) when citing.
Be concise and well structured: bullets and tables where they help, plain prose otherwise. Never invent figures.`;

app.post('/api/ai/chat', auth, async (req, res) => {
  if (effectivePlan(req.user) === 'free') return res.status(402).json({ error: 'AI tools require Pro' });
  const today = new Date().toISOString().slice(0, 10);
  req.user.ai = req.user.ai?.date === today ? req.user.ai : { date: today, count: 0 };
  if (req.user.ai.count >= +AI_DAILY_LIMIT) return res.status(429).json({ error: 'Daily AI limit reached' });
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
    req.user.ai.count++; db.save();
    res.json({ answer, usage: msg.usage });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'AI is busy, try again in a moment' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: 'AI key not configured on server' });
    console.error(e); res.status(500).json({ error: 'AI request failed' });
  }
});

app.get('/api/health', (_, res) => res.json({ ok: true, stripe: !!stripe }));

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required' });
  const entry = { name, email, message, receivedAt: new Date().toISOString() };
  try {
    const logPath = path.join(process.cwd(), 'data', 'contact.json');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const arr = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
    arr.push(entry);
    fs.writeFileSync(logPath, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('contact log failed', e);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Pagemint API on http://localhost:${PORT} (app: ${APP_URL})`));

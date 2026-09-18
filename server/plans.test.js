// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Run: node --test server/
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlan, periodEnd, PASS_DAYS } from './plans.js';
import { signToken, readToken } from './tokens.js';

const NOW = Date.UTC(2026, 8, 18);
const secs = ms => Math.floor(ms / 1000);

/** Minimal stand-in for the three Stripe list calls resolvePlan uses. */
function fakeStripe({ customers = [], subs = {}, sessions = {} }) {
  return {
    customers: { list: async ({ email }) => ({ data: customers.filter(c => c.email === email) }) },
    subscriptions: { list: async ({ customer }) => ({ data: subs[customer] || [] }) },
    checkout: { sessions: { list: async ({ customer }) => ({ data: sessions[customer] || [] }) } },
  };
}

test('no Stripe client or no email is free', async () => {
  assert.equal((await resolvePlan(null, 'a@b.co', NOW)).plan, 'free');
  assert.equal((await resolvePlan(fakeStripe({}), '', NOW)).plan, 'free');
});

test('unknown customer is free', async () => {
  const r = await resolvePlan(fakeStripe({}), 'nobody@x.co', NOW);
  assert.deepEqual(r, { plan: 'free', expires: null, customerId: null });
});

test('active subscription is Pro, renewal read from the item (current Stripe API)', async () => {
  const end = NOW + 20 * 86400e3;
  const stripe = fakeStripe({
    customers: [{ id: 'cus_1', email: 'a@b.co' }],
    subs: { cus_1: [{ status: 'active', metadata: { plan: 'pro' }, items: { data: [{ current_period_end: secs(end) }] } }] },
  });
  const r = await resolvePlan(stripe, 'a@b.co', NOW);
  assert.equal(r.plan, 'pro');
  assert.equal(r.expires, secs(end) * 1000);
  assert.equal(r.customerId, 'cus_1');
});

test('renewal date also works on older API versions', () => {
  assert.equal(periodEnd({ current_period_end: 100 }), 100000);
  assert.equal(periodEnd({ items: { data: [{ current_period_end: 200 }] }, current_period_end: 100 }), 200000);
  assert.equal(periodEnd({}), null);
});

test('cancelled subscription is free', async () => {
  const stripe = fakeStripe({
    customers: [{ id: 'cus_1', email: 'a@b.co' }],
    subs: { cus_1: [{ status: 'canceled', metadata: { plan: 'pro' } }] },
  });
  assert.equal((await resolvePlan(stripe, 'a@b.co', NOW)).plan, 'free');
});

test('7-day pass bought 2 days ago is Pro until day 7', async () => {
  const bought = NOW - 2 * 86400e3;
  const stripe = fakeStripe({
    customers: [{ id: 'cus_1', email: 'a@b.co' }],
    sessions: { cus_1: [{ mode: 'payment', payment_status: 'paid', created: secs(bought), metadata: { plan: 'pro' } }] },
  });
  const r = await resolvePlan(stripe, 'a@b.co', NOW);
  assert.equal(r.plan, 'pro');
  assert.equal(r.expires, secs(bought) * 1000 + PASS_DAYS * 86400e3);
});

test('7-day pass bought 8 days ago has expired', async () => {
  const stripe = fakeStripe({
    customers: [{ id: 'cus_1', email: 'a@b.co' }],
    sessions: { cus_1: [{ mode: 'payment', payment_status: 'paid', created: secs(NOW - 8 * 86400e3) }] },
  });
  assert.equal((await resolvePlan(stripe, 'a@b.co', NOW)).plan, 'free');
});

test('unpaid checkout grants nothing', async () => {
  const stripe = fakeStripe({
    customers: [{ id: 'cus_1', email: 'a@b.co' }],
    sessions: { cus_1: [{ mode: 'payment', payment_status: 'unpaid', created: secs(NOW) }] },
  });
  assert.equal((await resolvePlan(stripe, 'a@b.co', NOW)).plan, 'free');
});

test('subscription on a second customer record for the same email still counts', async () => {
  const stripe = fakeStripe({
    customers: [{ id: 'cus_old', email: 'a@b.co' }, { id: 'cus_new', email: 'a@b.co' }],
    subs: { cus_new: [{ status: 'trialing', metadata: {}, items: { data: [{ current_period_end: secs(NOW + 86400e3) }] } }] },
  });
  const r = await resolvePlan(stripe, 'a@b.co', NOW);
  assert.equal(r.plan, 'pro');
  assert.equal(r.customerId, 'cus_new');
});

test('tokens: valid, tampered, wrong kind, expired', () => {
  const s = 'secret';
  const t = signToken(s, { kind: 'session', email: 'a@b.co', exp: NOW + 1000 });
  assert.equal(readToken(s, t, 'session', NOW).email, 'a@b.co');
  assert.equal(readToken('other-secret', t, 'session', NOW), null);
  assert.equal(readToken(s, t, 'magic', NOW), null);
  assert.equal(readToken(s, t, 'session', NOW + 2000), null);
  const [body] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ kind: 'session', email: 'evil@x.co', exp: NOW + 1000 })).toString('base64url');
  assert.equal(readToken(s, `${forged}.${t.split('.')[1]}`, 'session', NOW), null);
  assert.equal(readToken(s, body, 'session', NOW), null);
  assert.equal(readToken(s, 'garbage', 'session', NOW), null);
});

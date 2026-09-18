// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// A customer's plan is read from Stripe rather than stored locally. Stripe already
// holds the subscriptions and payments, so there is no second copy to drift out
// of sync or to lose when the server's disk is reset.

const DAY = 86400e3;
export const PASS_DAYS = 7;
const ACTIVE = new Set(['active', 'trialing', 'past_due']);
const KNOWN_PLANS = new Set(['pro', 'team']);

const FREE = Object.freeze({ plan: 'free', expires: null, customerId: null });

/** Newer Stripe API versions report the billing period on each item; older ones on the subscription. */
export function periodEnd(sub) {
  const seconds = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end;
  return seconds ? seconds * 1000 : null;
}

const planName = p => (KNOWN_PLANS.has(p) ? p : 'pro');

/**
 * Resolve the plan for an email address.
 * An active subscription wins; otherwise the latest unexpired 7-day pass; otherwise free.
 */
export async function resolvePlan(stripe, email, now = Date.now()) {
  if (!stripe || !email) return { ...FREE };

  const { data: customers } = await stripe.customers.list({ email, limit: 20 });
  let pass = null;

  for (const customer of customers) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 20 });
    const live = subs.data.find(s => ACTIVE.has(s.status));
    if (live) return { plan: planName(live.metadata?.plan), expires: periodEnd(live), customerId: customer.id };

    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 20 });
    for (const cs of sessions.data) {
      if (cs.mode !== 'payment' || cs.payment_status !== 'paid') continue;
      const expires = cs.created * 1000 + PASS_DAYS * DAY;
      if (expires > now && (!pass || expires > pass.expires)) {
        pass = { plan: planName(cs.metadata?.plan), expires, customerId: customer.id };
      }
    }
  }

  return pass || { ...FREE, customerId: customers[0]?.id ?? null };
}

/** Wraps resolvePlan with a short in-memory cache so page loads don't each hit Stripe. */
export function createPlanResolver(stripe, { ttlMs = 60e3 } = {}) {
  const cache = new Map();
  return {
    async get(email) {
      const hit = cache.get(email);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      const value = await resolvePlan(stripe, email);
      cache.set(email, { value, at: Date.now() });
      return value;
    },
    forget(email) { email ? cache.delete(email) : cache.clear(); },
  };
}

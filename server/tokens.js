// Copyright (c) 2026 Nexora Labs. All rights reserved.
// Contact: thenexoralabstoday@gmail.com

// Stateless signed tokens (HMAC-SHA256). Sign-in links and sessions are verified
// by signature instead of being stored, so the server keeps nothing that a
// restart or redeploy could wipe.
import crypto from 'node:crypto';

const mac = (secret, body) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

/** Returns the payload if the signature, kind and expiry all check out, otherwise null. */
export function readToken(secret, token, kind, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;

  const given = Buffer.from(sig);
  const expected = Buffer.from(mac(secret, body));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (payload?.kind !== kind || typeof payload.exp !== 'number' || payload.exp < now) return null;
  return payload;
}

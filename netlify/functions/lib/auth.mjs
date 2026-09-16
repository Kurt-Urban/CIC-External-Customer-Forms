/* ============================================================
   auth.mjs - admin password check, signed session tokens,
   and a blob-backed rate limiter.

   The password never leaves the server: the browser posts it
   once, gets back a short-lived HMAC token, and uses that.
   ============================================================ */

import crypto from 'node:crypto';
import { store, STORES } from './store.mjs';

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export function adminPassword() {
  return process.env.ADMIN_PASSWORD || '';
}

function signingSecret() {
  // A dedicated secret is better: changing the password then does not
  // invalidate every open session. Falls back to deriving one.
  return process.env.ADMIN_SECRET || ('derived:' + adminPassword());
}

/** Constant-time string comparison that tolerates length differences. */
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function issueToken() {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = b64url(String(exp));
  const sig = b64url(crypto.createHmac('sha256', signingSecret()).update(payload).digest());
  return { token: payload + '.' + sig, expiresAt: exp };
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;

  const expected = b64url(crypto.createHmac('sha256', signingSecret()).update(payload).digest());
  let sigOk = false;
  try {
    sigOk = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
  if (!sigOk) return false;

  const exp = Number(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  return Number.isFinite(exp) && exp > Date.now();
}

export function bearerFrom(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

export function isAuthed(req) {
  return verifyToken(bearerFrom(req));
}

/* ---------- page tokens (spam protection) ----------

   Every page the API hands out is stamped with a signed token
   recording which page it was and when it was issued. A submission
   must present that token, so a spammer cannot POST blindly: it has
   to request a real page first, and then wait a moment like a human
   filling the thing in. Stateless - nothing to store or expire. */

function pageSecret() {
  return process.env.ADMIN_SECRET || ('page:' + (process.env.ADMIN_PASSWORD || 'cic'));
}

export function issuePageToken(data) {
  const payload = b64url(JSON.stringify({ ...data, t: Date.now() }));
  const sig = b64url(crypto.createHmac('sha256', pageSecret()).update(payload).digest());
  return payload + '.' + sig;
}

/**
 * @returns {{ ok: boolean, reason?: string, data?: object }}
 */
export function verifyPageToken(token, opts = {}) {
  const minAgeMs = opts.minAgeMs == null ? 2500 : opts.minAgeMs;
  const maxAgeMs = opts.maxAgeMs == null ? 12 * 60 * 60 * 1000 : opts.maxAgeMs;

  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, reason: 'missing' };
  }
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return { ok: false, reason: 'malformed' };

  const expected = b64url(crypto.createHmac('sha256', pageSecret()).update(payload).digest());
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return { ok: false, reason: 'bad-signature' };
    }
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const age = Date.now() - Number(data.t || 0);
  if (!Number.isFinite(age)) return { ok: false, reason: 'malformed' };
  if (age < minAgeMs) return { ok: false, reason: 'too-fast' };
  if (age > maxAgeMs) return { ok: false, reason: 'expired' };

  return { ok: true, data };
}

/* ---------- rate limiting ---------- */

export function clientIP(req, context) {
  if (context && context.ip) return context.ip;
  const fwd = req.headers.get('x-nf-client-connection-ip') ||
              req.headers.get('x-forwarded-for') || '';
  return fwd.split(',')[0].trim() || 'unknown';
}

/**
 * Sliding-window limiter backed by the blob store.
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
export async function rateLimit(bucket, ip, max, windowMs) {
  const key = bucket + '/' + Buffer.from(String(ip)).toString('hex').slice(0, 40);
  const now = Date.now();
  let hits = [];

  try {
    const s = await store(STORES.rate);
    const existing = await s.get(key, { type: 'json' });
    if (Array.isArray(existing)) hits = existing.filter((t) => now - t < windowMs);

    if (hits.length >= max) {
      const retryAfter = Math.ceil((windowMs - (now - hits[0])) / 1000);
      return { allowed: false, remaining: 0, retryAfter: Math.max(retryAfter, 1) };
    }

    hits.push(now);
    await s.setJSON(key, hits);
  } catch {
    // Storage trouble must not lock people out of the form entirely.
    return { allowed: true, remaining: max, retryAfter: 0 };
  }

  return { allowed: true, remaining: max - hits.length, retryAfter: 0 };
}

/* ---------- response helpers ---------- */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function errorJSON(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJSON(req, maxBytes) {
  const text = await req.text();
  if (maxBytes && text.length > maxBytes) {
    const err = new Error('Payload too large.');
    err.status = 413;
    throw err;
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    const err = new Error('Body is not valid JSON.');
    err.status = 400;
    throw err;
  }
}

/** Short human-friendly reference, e.g. 7K3-9B2. */
export function makeRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (n) => Array.from(crypto.randomFillSync(new Uint8Array(n)))
    .map((b) => alphabet[b % alphabet.length]).join('');
  return pick(3) + '-' + pick(3);
}

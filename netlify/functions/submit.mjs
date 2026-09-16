/* Public: accept a filled-in page and file it.

   The page the answers came from is re-generated here from its seed,
   so the questions are known server-side. Nothing about the questions
   is taken from the client - only the answers are. */

import crypto from 'node:crypto';
import { getForm, getBank } from './lib/forms-repo.mjs';
import { store, STORES } from './lib/store.mjs';
import {
  json, errorJSON, readJSON, makeRef, rateLimit, clientIP, verifyPageToken,
} from './lib/auth.mjs';
import { generatePage, pageQuestions } from '../../public/assets/generator.js';
import { LIMITS, normOption, inputFields } from '../../public/assets/schema.js';

const MAX_PER_HOUR = 60;
const MAX_PER_DAY = 400;

/** Coerce one answer to whatever its declared field type allows. */
function coerce(field, value) {
  const cap = Math.min(Number(field.maxLength) || LIMITS.answerChars, LIMITS.answerChars);

  switch (field.type) {
    case 'checkbox':
      return value === true || value === 'true' || value === 'on';

    case 'checkboxes': {
      const allowed = new Set((field.options || []).map((o) => normOption(o).value));
      const arr = Array.isArray(value) ? value : [];
      return arr.map(String).filter((v) => allowed.has(v)).slice(0, LIMITS.options);
    }

    case 'radio':
    case 'select': {
      const allowed = new Set((field.options || []).map((o) => normOption(o).value));
      const v = String(value == null ? '' : value);
      return allowed.has(v) ? v : '';
    }

    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : '';
    }

    default:
      return String(value == null ? '' : value).slice(0, cap);
  }
}

function isEmpty(field, v) {
  if (field.type === 'checkbox') return v !== true;
  if (field.type === 'checkboxes') return !Array.isArray(v) || v.length === 0;
  return String(v == null ? '' : v).trim() === '';
}

async function bumpQueue(formId) {
  try {
    const s = await store(STORES.meta);
    const key = 'queue/' + formId + '.json';
    const current = await s.get(key, { type: 'json' });
    const n = (Number(current && current.n) || 0) + 1;
    await s.setJSON(key, { n });
    return n;
  } catch {
    return null;
  }
}

/** Reject a body-for-body repeat from the same client. */
async function isReplay(fingerprint, digest) {
  try {
    const s = await store(STORES.rate);
    const key = 'last/' + fingerprint + '.json';
    const prev = await s.get(key, { type: 'json' });
    await s.setJSON(key, { digest, at: Date.now() });
    return !!(prev && prev.digest === digest && Date.now() - Number(prev.at) < 10 * 60 * 1000);
  } catch {
    return false;
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') return errorJSON('Method not allowed.', 405);

  const ip = clientIP(req, context);
  const fingerprint = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 12);

  /* --- spam layer 1: rate limits --- */
  const perHour = await rateLimit('submit-h', ip, MAX_PER_HOUR, 60 * 60 * 1000);
  if (!perHour.allowed) {
    return json({ error: 'The Office is processing your filings at capacity. Try again shortly.' },
      429, { 'retry-after': String(perHour.retryAfter) });
  }
  const perDay = await rateLimit('submit-d', ip, MAX_PER_DAY, 24 * 60 * 60 * 1000);
  if (!perDay.allowed) {
    return json({ error: 'Daily filing allowance exhausted. The drawer is full.' },
      429, { 'retry-after': String(perDay.retryAfter) });
  }

  let body;
  try {
    body = await readJSON(req, LIMITS.submissionBytes);
  } catch (err) {
    return errorJSON(err.message, err.status || 400);
  }

  /* --- spam layer 2: honeypot (answer as if it worked) --- */
  if (body._hp) return json({ ok: true, ref: makeRef(), queue: 0 });

  /* --- spam layer 3: the page must have been issued by us --- */
  const tok = verifyPageToken(body.pageToken);
  if (!tok.ok) {
    const messages = {
      'too-fast': 'This sheet was returned faster than it can be read. Please complete it properly.',
      expired: 'This sheet has gone stale. Reload the page and begin again.',
      missing: 'This sheet carries no registry stamp and cannot be accepted.',
      malformed: 'This sheet carries an unreadable registry stamp.',
      'bad-signature': 'This sheet was not issued by this office.',
    };
    return errorJSON(messages[tok.reason] || 'This sheet cannot be accepted.', 400);
  }

  const form = await getForm(String(body.formId || ''));
  if (!form) return errorJSON('No such form is on file.', 404);
  if (tok.data.f !== form.id) return errorJSON('Registry stamp does not match this form.', 400);

  /* --- reconstruct exactly what was asked --- */
  let page;
  if (form.mode === 'generated') {
    const bank = await getBank(form.bankId);
    if (!bank) return errorJSON('The question bank for this form is not on file.', 500);
    page = generatePage(bank, form, tok.data.s, tok.data.p);
  } else {
    page = form;
  }

  const questions = form.mode === 'generated'
    ? pageQuestions(page)
    : inputFields(page).map((f) => ({ name: f.name, label: f.label || f.name, type: f.type, field: f }));

  const incoming = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const entries = [];
  const missing = [];
  let answered = 0;

  for (const q of questions) {
    const v = coerce(q.field, incoming[q.name]);
    const empty = isEmpty(q.field, v);
    if (!empty) answered++;

    if (page.enforceRequired !== false && q.field.required && !q.field.disabled && empty) {
      missing.push(q.label);
    }

    entries.push({
      name: q.name,
      section: q.section || '',
      question: q.label,
      type: q.type,
      answer: v,
    });
  }

  if (missing.length) {
    return errorJSON(
      'Filing incomplete. The following are required: ' + missing.slice(0, 6).join('; ') +
      (missing.length > 6 ? '; and ' + (missing.length - 6) + ' more.' : ''),
      422,
    );
  }

  /* --- spam layer 4: an entirely blank sheet is not a filing --- */
  if (questions.length && answered === 0) {
    return errorJSON('This sheet is blank. The Office files blank sheets, but not on request.', 422);
  }

  /* --- spam layer 5: identical repeat submissions --- */
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify(entries.map((e) => [e.name, e.answer])))
    .digest('hex');
  if (await isReplay(fingerprint, digest)) {
    return errorJSON('An identical sheet was filed moments ago. It has not been filed twice.', 409);
  }

  const ref = makeRef();
  const receivedAt = new Date().toISOString();
  const queue = await bumpQueue(form.id);

  const record = {
    ref,
    formId: form.id,
    formCode: page.code || form.code,
    formTitle: page.title || form.title,
    mode: form.mode,
    seed: tok.data.s || null,
    page: tok.data.p == null ? null : tok.data.p,
    receivedAt,
    queue,
    answered,
    entries,
    // Coarse, non-reversible marker so repeat abuse can be spotted
    // without keeping anyone's address on file.
    fingerprint,
    userAgent: String(req.headers.get('user-agent') || '').slice(0, 200),
  };

  try {
    const s = await store(STORES.submissions);
    await s.setJSON(form.id + '/' + receivedAt.replace(/[:.]/g, '-') + '-' + ref + '.json', record);
  } catch (err) {
    return errorJSON('The filing cabinet refused this document. ' + (err.message || ''), 500);
  }

  return json({ ok: true, ref, queue, page: record.page });
};

export const config = { path: '/api/submit' };

/* Private: everything behind the password.

   One endpoint, dispatching on an "action" in the body. The password
   is checked here and never reaches the browser bundle; a successful
   login returns a short-lived signed token used for everything else. */

import { store, STORES } from './lib/store.mjs';
import {
  json, errorJSON, readJSON, adminPassword, safeEqual,
  issueToken, isAuthed, rateLimit, clientIP,
} from './lib/auth.mjs';
import {
  allForms, allBanks, getForm, getBank, summarize,
  saveDocument, deleteDocument, restoreSeed,
} from './lib/forms-repo.mjs';
import { bankReach } from '../../public/assets/schema.js';

const LIST_CAP = 2000;
const MAX_BODY = 2 * 1024 * 1024;

/* ---------- submissions ---------- */

async function listSubmissionKeys(formId) {
  const s = await store(STORES.submissions);
  const { blobs } = await s.list(formId ? { prefix: formId + '/' } : {});
  return blobs
    .map((b) => b.key)
    .filter((k) => k.endsWith('.json'))
    .sort()
    .reverse()            // keys start with an ISO timestamp, so this is newest-first
    .slice(0, LIST_CAP);
}

async function readSubmissions(keys) {
  const s = await store(STORES.submissions);
  const out = [];
  for (const key of keys) {
    const rec = await s.get(key, { type: 'json' });
    if (rec) out.push({ ...rec, key });
  }
  return out;
}

function summaryLine(rec) {
  const first = (rec.entries || []).find((e) => {
    if (typeof e.answer === 'boolean') return e.answer;
    if (Array.isArray(e.answer)) return e.answer.length;
    return String(e.answer || '').trim();
  });
  if (!first) return '(no answers given)';
  const v = Array.isArray(first.answer) ? first.answer.join(', ') : String(first.answer);
  return first.question + ' — ' + v;
}

function csvCell(v) {
  const s = Array.isArray(v) ? v.join(' | ') : v === true ? 'yes' : v === false ? 'no' : String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Generated pages ask different questions each time, so a fixed
 * column-per-question CSV is not possible. One row per answer is.
 */
function toCSV(records) {
  const head = ['ref', 'received_at', 'form_id', 'form_code', 'page', 'section', 'question', 'type', 'answer'];
  const rows = [head.join(',')];
  for (const r of records) {
    for (const e of r.entries || []) {
      rows.push([
        r.ref, r.receivedAt, r.formId, r.formCode, r.page == null ? '' : r.page,
        e.section, e.question, e.type, e.answer,
      ].map(csvCell).join(','));
    }
  }
  return rows.join('\r\n');
}

/* ---------- handler ---------- */

export default async (req, context) => {
  if (req.method !== 'POST') return errorJSON('Method not allowed.', 405);

  let body;
  try {
    body = await readJSON(req, MAX_BODY);
  } catch (err) {
    return errorJSON(err.message, err.status || 400);
  }

  const action = String(body.action || '');
  const ip = clientIP(req, context);

  /* --- login --- */
  if (action === 'login') {
    const configured = adminPassword();
    if (!configured) {
      return errorJSON('No ADMIN_PASSWORD is configured for this site. Set it in the Netlify environment variables.', 503);
    }

    const limit = await rateLimit('login', ip, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return json({ error: 'Too many attempts. Wait and try again.' }, 429,
        { 'retry-after': String(limit.retryAfter) });
    }

    if (!safeEqual(String(body.password || ''), configured)) {
      return errorJSON('Incorrect password.', 401);
    }

    const { token, expiresAt } = issueToken();
    return json({ ok: true, token, expiresAt });
  }

  /* --- everything else needs a valid token --- */
  if (!isAuthed(req)) return errorJSON('Not authorised.', 401);

  switch (action) {
    case 'ping':
      return json({ ok: true });

    case 'list_forms': {
      const [forms, banks] = await Promise.all([allForms(), allBanks()]);
      return json({
        forms: forms.map(summarize),
        banks: banks.map((b) => ({
          id: b.id,
          name: b.name || b.id,
          description: b.description || '',
          source: b.source,
          ...bankReach(b),
        })),
      });
    }

    case 'get_document': {
      const id = String(body.id || '');
      const doc = body.kind === 'bank' ? await getBank(id) : await getForm(id);
      if (!doc) return errorJSON('Not found.', 404);
      return json({ document: doc });
    }

    case 'save_document': {
      const result = await saveDocument(body.document);
      if (!result.ok) {
        return json({ ok: false, errors: result.errors, warnings: result.warnings }, 422);
      }
      return json({ ok: true, kind: result.kind, id: result.doc.id, warnings: result.warnings });
    }

    case 'delete_document': {
      await deleteDocument(String(body.id || ''), body.kind);
      return json({ ok: true });
    }

    case 'restore_document': {
      await restoreSeed(String(body.id || ''), body.kind);
      return json({ ok: true });
    }

    case 'list_submissions': {
      const formId = body.formId ? String(body.formId) : '';
      const offset = Math.max(0, Number(body.offset) || 0);
      const limit = Math.min(100, Math.max(1, Number(body.limit) || 25));

      const keys = await listSubmissionKeys(formId);
      const slice = keys.slice(offset, offset + limit);
      const records = await readSubmissions(slice);

      return json({
        total: keys.length,
        offset,
        limit,
        submissions: records.map((r) => ({
          key: r.key,
          ref: r.ref,
          formId: r.formId,
          formCode: r.formCode,
          formTitle: r.formTitle,
          page: r.page,
          receivedAt: r.receivedAt,
          queue: r.queue,
          answered: r.answered,
          count: (r.entries || []).length,
          summary: summaryLine(r),
          entries: r.entries || [],
        })),
      });
    }

    case 'delete_submission': {
      const s = await store(STORES.submissions);
      await s.delete(String(body.key || ''));
      return json({ ok: true });
    }

    case 'export': {
      const formId = body.formId ? String(body.formId) : '';
      const keys = await listSubmissionKeys(formId);
      const records = await readSubmissions(keys);

      if (body.format === 'csv') {
        return new Response(toCSV(records), {
          status: 200,
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'cache-control': 'no-store',
            'content-disposition': 'attachment; filename="cic-submissions' +
              (formId ? '-' + formId : '') + '.csv"',
          },
        });
      }
      return json({ exportedAt: new Date().toISOString(), count: records.length, submissions: records });
    }

    case 'stats': {
      const keys = await listSubmissionKeys('');
      const byForm = {};
      for (const k of keys) {
        const id = k.split('/')[0];
        byForm[id] = (byForm[id] || 0) + 1;
      }
      return json({ total: keys.length, byForm });
    }

    default:
      return errorJSON('Unknown action "' + action + '".', 400);
  }
};

export const config = { path: '/api/admin' };

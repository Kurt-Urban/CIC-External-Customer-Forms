/* ============================================================
   forms-repo.mjs - where form definitions and question banks
   come from.

   Two sources, merged:
     1. seed documents committed to /forms/*.json (bundled at build)
     2. documents uploaded through the admin page (Netlify Blobs)

   An uploaded document with the same id shadows the seed, so a
   seed can be edited without touching the repo. Deleting a seed
   records a tombstone instead of trying to unlink a bundled file.
   ============================================================ */

import { store, STORES } from './store.mjs';
import { SEED_FORMS, SEED_BANKS } from './seed-forms.mjs';
import { validateForm, validateBank, normalizeForm } from '../../../public/assets/schema.js';

const TOMBSTONE_KEY = 'deleted-seeds.json';

async function tombstones() {
  try {
    const s = await store(STORES.meta);
    const list = await s.get(TOMBSTONE_KEY, { type: 'json' });
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function setTombstones(list) {
  const s = await store(STORES.meta);
  await s.setJSON(TOMBSTONE_KEY, list);
}

/** Everything in the uploaded-documents store, forms and banks alike. */
async function uploaded() {
  const forms = [];
  const banks = [];
  try {
    const s = await store(STORES.forms);
    const { blobs } = await s.list();
    for (const b of blobs) {
      if (!b.key.endsWith('.json')) continue;
      const doc = await s.get(b.key, { type: 'json' });
      if (!doc || typeof doc !== 'object') continue;
      if (doc.kind === 'bank') banks.push(doc);
      else forms.push(doc);
    }
  } catch {
    // No blob store yet (first deploy) - seeds only.
  }
  return { forms, banks };
}

/* ---------- forms ---------- */

export async function allForms() {
  const [up, dead] = await Promise.all([uploaded(), tombstones()]);

  const byId = new Map();
  for (const f of SEED_FORMS) {
    if (dead.includes(f.id)) continue;
    byId.set(f.id, { ...normalizeForm(f), source: 'seed' });
  }
  for (const f of up.forms) {
    const n = normalizeForm(f);
    byId.set(n.id, { ...n, source: 'uploaded' });
  }

  return Array.from(byId.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.code.localeCompare(b.code, 'en', { numeric: true });
  });
}

export async function getForm(id) {
  const forms = await allForms();
  return forms.find((f) => f.id === id) || null;
}

/** Compact record for the public index and the admin list. */
export function summarize(form) {
  return {
    id: form.id,
    code: form.code,
    title: form.title,
    indexBlurb: form.indexBlurb || '',
    chip: form.chip || (form.mode === 'generated' ? 'CONTINUOUS' : 'REQUIRED'),
    order: form.order,
    mode: form.mode,
    bankId: form.bankId || null,
    hidden: !!form.hidden,
    source: form.source,
  };
}

/* ---------- banks ---------- */

export async function allBanks() {
  const [up, dead] = await Promise.all([uploaded(), tombstones()]);

  const byId = new Map();
  for (const b of SEED_BANKS) {
    if (dead.includes('bank:' + b.id)) continue;
    byId.set(b.id, { ...b, source: 'seed' });
  }
  for (const b of up.banks) {
    if (!b.id) continue;
    byId.set(b.id, { ...b, source: 'uploaded' });
  }
  return Array.from(byId.values());
}

export async function getBank(id) {
  const banks = await allBanks();
  return banks.find((b) => b.id === id) || null;
}

/* ---------- writes ---------- */

/** Save a form or a bank; the document's "kind" decides which. */
export async function saveDocument(raw) {
  const isBank = raw && raw.kind === 'bank';
  const result = isBank ? validateBank(raw) : validateForm(raw);
  if (!result.ok) return { ...result, kind: isBank ? 'bank' : 'form' };

  const doc = isBank ? result.bank : result.form;
  const s = await store(STORES.forms);
  await s.setJSON((isBank ? 'bank-' : '') + doc.id + '.json', doc);

  // Re-adding a previously deleted seed clears its tombstone.
  const dead = await tombstones();
  const marker = isBank ? 'bank:' + doc.id : doc.id;
  if (dead.includes(marker)) await setTombstones(dead.filter((x) => x !== marker));

  return { ...result, kind: isBank ? 'bank' : 'form', doc };
}

export async function deleteDocument(id, kind) {
  const isBank = kind === 'bank';
  const s = await store(STORES.forms);
  await s.delete((isBank ? 'bank-' : '') + id + '.json');

  const seeds = isBank ? SEED_BANKS : SEED_FORMS;
  if (seeds.some((d) => d.id === id)) {
    const marker = isBank ? 'bank:' + id : id;
    const dead = await tombstones();
    if (!dead.includes(marker)) await setTombstones(dead.concat(marker));
  }
  return true;
}

/** Undo a delete: drop the tombstone and any uploaded override. */
export async function restoreSeed(id, kind) {
  const isBank = kind === 'bank';
  const marker = isBank ? 'bank:' + id : id;
  const dead = await tombstones();
  await setTombstones(dead.filter((x) => x !== marker));
  const s = await store(STORES.forms);
  await s.delete((isBank ? 'bank-' : '') + id + '.json');
  return true;
}

export { SEED_FORMS, SEED_BANKS };

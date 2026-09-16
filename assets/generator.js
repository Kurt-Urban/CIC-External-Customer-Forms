/* ============================================================
   generator.js - builds one page of paperwork from a question bank.

   Deterministic: the same (bank, seed, pageIndex) always produces
   exactly the same page. The app draws a fresh random seed for every
   new sheet, and remembers it, so a reload shows the same sheet
   rather than a different one.
   ============================================================ */

import { letterSuffix } from './schema.js';

/* ---------- deterministic RNG ---------- */

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRnd(seed, pageIndex) {
  return mulberry32(hash32(String(seed) + '::' + pageIndex));
}

/* ---------- picking helpers ---------- */

function pickOne(rnd, arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(rnd() * arr.length)];
}

/** Deterministic Fisher-Yates; returns a new array. */
function shuffled(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickMany(rnd, arr, n) {
  return shuffled(rnd, arr || []).slice(0, n);
}

function intBetween(rnd, lo, hi) {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/* ---------- slot expansion ---------- */

/**
 * Expand {{slot}} placeholders from bank.slots. A slot may itself
 * contain slots, so expansion repeats a bounded number of times.
 */
function expand(rnd, text, slots) {
  let out = String(text == null ? '' : text);
  for (let pass = 0; pass < 4 && out.includes('{{'); pass++) {
    out = out.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, key) => {
      const pool = slots && slots[key];
      if (!Array.isArray(pool) || !pool.length) return m;
      return String(pickOne(rnd, pool));
    });
  }
  return out;
}

function expandQuestion(rnd, q, slots) {
  const out = { ...q };
  out.label = expand(rnd, q.label, slots);
  if (q.placeholder) out.placeholder = expand(rnd, q.placeholder, slots);
  if (q.help) out.help = expand(rnd, q.help, slots);
  if (q.text) out.text = expand(rnd, q.text, slots);
  if (Array.isArray(q.options)) {
    out.options = q.options.map((o) => {
      if (o && typeof o === 'object') {
        return { value: o.value, label: expand(rnd, o.label != null ? o.label : o.value, slots) };
      }
      return expand(rnd, o, slots);
    });
  }
  return out;
}

/* ---------- stable field names ---------- */

/**
 * A page's field names must be stable between the browser and the
 * server, and unique within the page. Derived from position, which
 * is deterministic, rather than from the (expanded) label text.
 */
function fieldName(pageIndex, si, fi) {
  return 'p' + pageIndex + 's' + (si + 1) + 'q' + (fi + 1);
}

/* ---------- page generation ---------- */

/**
 * Build one page of paperwork.
 *
 * @param {object} bank      question bank document
 * @param {object} base      the parent form ({ id, code, org, department, ... })
 * @param {string} seed      per-session seed
 * @param {number} pageIndex 0 for the first page, then 1, 2, 3 ...
 * @returns {object} a form definition the renderer can consume
 */
export function generatePage(bank, base, seed, pageIndex) {
  const rnd = makeRnd(seed, pageIndex);
  const slots = bank.slots || {};
  const cfg = bank.page || {};

  const minSections = cfg.minSections || 3;
  const maxSections = cfg.maxSections || 4;
  const minPerSection = cfg.minQuestionsPerSection || 2;
  const maxPerSection = cfg.maxQuestionsPerSection || 4;
  const maxLong = cfg.maxLongAnswers == null ? 1 : cfg.maxLongAnswers;

  const sectionCount = intBetween(rnd, minSections, maxSections);
  const sectionTitles = pickMany(rnd, bank.sectionTitles || ['Particulars'], sectionCount);

  // Draw the page's questions up front so none repeats within a page.
  const pool = shuffled(rnd, bank.questions || []);
  let cursor = 0;
  let longUsed = 0;

  const sections = [];
  for (let si = 0; si < sectionCount; si++) {
    const want = intBetween(rnd, minPerSection, maxPerSection);
    const fields = [];

    while (fields.length < want && cursor < pool.length) {
      const q = pool[cursor++];
      const isLong = q.type === 'textarea';
      if (isLong && longUsed >= maxLong) continue; // keep it to one page
      if (isLong) longUsed++;

      const f = expandQuestion(rnd, q, slots);
      f.name = fieldName(pageIndex, si, fields.length);
      delete f.tags;
      fields.push(f);
    }

    if (!fields.length) continue;

    // Pair up short text fields into two-column rows for a denser page.
    fields.forEach((f, i) => {
      const compact = ['text', 'date', 'number', 'signature'].includes(f.type);
      const nextF = fields[i + 1];
      const nextCompact = nextF && ['text', 'date', 'number', 'signature'].includes(nextF.type);
      if (compact && nextCompact && f.width !== 'full' && rnd() < 0.7) {
        f.width = 'half';
        nextF.width = 'half';
      }
    });

    const sec = {
      title: expand(rnd, sectionTitles[si] || 'Particulars', slots),
      fields,
    };
    if (rnd() < 0.45 && (bank.sectionNotes || []).length) {
      sec.note = expand(rnd, pickOne(rnd, bank.sectionNotes), slots);
    }
    sections.push(sec);
  }

  const code = base.code + (pageIndex > 0 ? letterSuffix(pageIndex) : '');

  const officeUse = pickMany(rnd, bank.officeUse || [], 3).map((o) => ({
    label: expand(rnd, o.label, slots),
    value: expand(rnd, o.value, slots),
  }));

  return {
    id: base.id,
    code,
    title: expand(rnd, pickOne(rnd, bank.titles) || base.title, slots),
    subtitle: expand(rnd, pickOne(rnd, bank.subtitles) || '', slots),
    org: base.org,
    department: expand(rnd, pickOne(rnd, bank.departments) || base.department, slots),
    revision: 'REV. ' + intBetween(rnd, 2, 141) + ' · PAGE ' + (pageIndex + 1),
    meta: [expand(rnd, pickOne(rnd, bank.metaLines) || '', slots)].filter(Boolean),
    instructions: expand(rnd, pickOne(rnd, bank.instructions) || '', slots),
    sections,
    officeUse,
    officeUseTitle: pickOne(rnd, bank.officeUseTitles || ['For Office Use Only']),
    finePrint: expand(rnd, pickOne(rnd, bank.finePrint) || '', slots),
    submitLabel: expand(rnd, pickOne(rnd, bank.submitLabels) || 'SAVE COPY & FILE', slots),
    enforceRequired: base.enforceRequired !== false,
    // Each page is a different document, so it gets a different template.
    style: { seed: String(seed) + '::' + pageIndex },
    receipt: {
      stamp: pickOne(rnd, bank.stamps || ['RECEIVED']),
      message: expand(rnd, pickOne(rnd, bank.receiptMessages) ||
        'Filed as **{{code}}**, reference **{{ref}}**.', slots),
      footnotes: pickMany(rnd, bank.receiptFootnotes || [], 4)
        .map((f) => expand(rnd, f, slots)),
      next: { mode: 'generate', label: pickOne(rnd, bank.nextLabels || ['Continue to Form {{next}} →']) },
    },
    transmittal: expand(rnd, pickOne(rnd, bank.transmittals) || '', slots),
  };
}

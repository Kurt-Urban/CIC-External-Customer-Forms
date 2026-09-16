/* ============================================================
   generator.js - builds one sheet of paperwork from the bank.

   The bank is a list of *topics* - things the Office wants to know -
   each written many ways. Two rules shape every sheet:

   1. No repeats. A wording already shown to this visitor (on GC-1 or
      any earlier sheet) is never shown again. Unused wordings are used
      first; once a visitor has seen them all, old wordings come back
      with a bureaucratic prefix or suffix so the text is still new.

   2. Redundancy. The same topic keeps coming back in different words,
      and most sheets deliberately ask one or two things twice.

   Deterministic: the same (bank, seed, pageIndex, used) always
   produces the same sheet.
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

function pickOne(rnd, arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(rnd() * arr.length)];
}

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

/* ---------- text ---------- */

/** The comparison key for "have they seen this question before?" */
export function normText(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasSlots(s) {
  return /\{\{[a-zA-Z0-9_]+\}\}/.test(String(s || ''));
}

/**
 * Expand {{slot}} placeholders from bank.slots. Slot values may contain
 * further slots, so expansion repeats a bounded number of times.
 * Unknown names (e.g. {{code}}, filled in after saving) are left alone.
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

const FIELD_KEYS = ['type', 'options', 'placeholder', 'help', 'min', 'max', 'rows', 'minWords', 'maxLength', 'disabled'];

/** Merge a phrasing (string or object) over its topic's defaults. */
function phrasingSpec(topic, phrasing) {
  const own = typeof phrasing === 'string' ? { label: phrasing } : phrasing;
  const spec = { label: own.label, type: own.type || topic.type || 'text' };
  for (const k of FIELD_KEYS) {
    if (k === 'type') continue;
    const v = own[k] !== undefined ? own[k] : topic[k];
    if (v !== undefined) spec[k] = v;
  }
  return spec;
}

function specHasSlots(spec) {
  return hasSlots(spec.label) || hasSlots(spec.placeholder) || hasSlots(spec.help) ||
    (Array.isArray(spec.options) && spec.options.some((o) => hasSlots(typeof o === 'object' ? o.label : o)));
}

function expandSpec(rnd, spec, slots) {
  const f = { ...spec };
  f.label = expand(rnd, spec.label, slots);
  if (spec.placeholder) f.placeholder = expand(rnd, spec.placeholder, slots);
  if (spec.help) f.help = expand(rnd, spec.help, slots);
  if (Array.isArray(spec.options)) {
    f.options = spec.options.map((o) => (o && typeof o === 'object'
      ? { value: o.value, label: expand(rnd, o.label != null ? o.label : o.value, slots) }
      : expand(rnd, o, slots)));
  }
  return f;
}

/** Re-word an already-used question just enough to be a new question. */
function restate(rnd, label, bank, slots) {
  const pre = bank.restatePrefixes || [];
  const suf = bank.restateSuffixes || [];
  const roll = rnd();
  let out = label;
  if ((roll < 0.45 || !suf.length) && pre.length) {
    out = expand(rnd, pickOne(rnd, pre), slots) + ' ' + lowerFirst(label);
  } else if (roll < 0.9 || !pre.length) {
    out = label + ' ' + expand(rnd, pickOne(rnd, suf), slots);
  } else {
    out = expand(rnd, pickOne(rnd, pre), slots) + ' ' + lowerFirst(label) + ' ' +
      expand(rnd, pickOne(rnd, suf), slots);
  }
  return out;
}

function lowerFirst(s) {
  // "Name of declaring party" -> "name of declaring party", but keep "I ..." and acronyms.
  if (/^(I\b|[A-Z]{2,})/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/* ---------- sheet generation ---------- */

/**
 * @param {object} bank      question bank (forms/bank.json)
 * @param {object} base      the parent form ({ id, code, org, department, ... })
 * @param {string} seed      random seed for this sheet
 * @param {number} pageIndex 1 for GC-1a, 2 for GC-1b ...
 * @param {{ phrasings?: string[], texts?: string[], interjections?: string[] }} used
 *        what this visitor has already been shown
 * @returns {object} a form definition, with `usage` listing what it consumed
 */
export function generatePage(bank, base, seed, pageIndex, used) {
  const rnd = mulberry32(hash32(String(seed) + '::' + pageIndex));
  const slots = bank.slots || {};
  const cfg = bank.page || {};
  const topics = bank.topics || [];

  const minSections = cfg.minSections || 3;
  const maxSections = cfg.maxSections || 4;
  const minPer = cfg.minQuestionsPerSection || 2;
  const maxPer = cfg.maxQuestionsPerSection || 3;
  const maxFields = cfg.maxFields || 15;
  const maxLong = cfg.maxLongAnswers == null ? 1 : cfg.maxLongAnswers;
  const echoChance = cfg.echoChance == null ? 0.9 : cfg.echoChance;
  const interjectionChance = cfg.interjectionChance == null ? 0.35 : cfg.interjectionChance;

  const seenPhrasing = new Set((used && used.phrasings) || []);
  const seenText = new Set((used && used.texts) || []);
  const seenInterjection = new Set((used && used.interjections) || []);
  const usage = { phrasings: [], texts: [], interjections: [] };

  // Every wording in the bank, as a candidate.
  const all = [];
  topics.forEach((t, ti) => {
    (t.phrasings || []).forEach((p, pi) => {
      all.push({ ti, pi, key: t.id + '#' + pi, long: phrasingSpec(t, p).type === 'textarea' });
    });
  });
  const fresh = shuffled(rnd, all.filter((c) => !seenPhrasing.has(c.key)));
  const recycled = shuffled(rnd, all);
  let recycledAt = 0;
  let longUsed = 0;

  const onPageKeys = new Set();
  const fits = (c) => !(c.long && longUsed >= maxLong) && !onPageKeys.has(c.key);

  function take(accept, freshOnly) {
    for (let i = 0; i < fresh.length; i++) {
      if (accept(fresh[i]) && fits(fresh[i])) return { c: fresh.splice(i, 1)[0], reused: false };
    }
    if (freshOnly) return null;
    for (let n = 0; n < recycled.length; n++) {
      const c = recycled[(recycledAt + n) % recycled.length];
      if (accept(c) && fits(c)) {
        recycledAt = (recycledAt + n + 1) % recycled.length;
        return { c, reused: true };
      }
    }
    return null;
  }

  function build(pick) {
    const topic = topics[pick.c.ti];
    const spec = phrasingSpec(topic, topic.phrasings[pick.c.pi]);

    let field = expandSpec(rnd, spec, slots);
    let key = normText(field.label);

    // A slot-bearing wording can usually find an unseen variant by itself.
    for (let t = 0; seenText.has(key) && specHasSlots(spec) && t < 8; t++) {
      field = expandSpec(rnd, spec, slots);
      key = normText(field.label);
    }

    // Otherwise restate it until it is new.
    if (pick.reused || seenText.has(key)) {
      const plain = field.label;
      for (let t = 0; t < 40; t++) {
        field.label = restate(rnd, plain, bank, slots);
        key = normText(field.label);
        if (!seenText.has(key)) break;
      }
      for (let n = 2; seenText.has(key); n++) {
        field.label = plain + ' (entry ' + n + ')';
        key = normText(field.label);
      }
    }

    seenText.add(key);
    usage.texts.push(key);
    onPageKeys.add(pick.c.key);
    if (!seenPhrasing.has(pick.c.key)) {
      seenPhrasing.add(pick.c.key);
      usage.phrasings.push(pick.c.key);
    }
    if (field.type === 'textarea') longUsed++;
    field.topic = topic.id;
    return field;
  }

  /* --- sections, each topic once --- */

  const sectionCount = intBetween(rnd, minSections, maxSections);
  const titles = pickMany(rnd, bank.sectionTitles || ['Particulars'], sectionCount);
  const onPage = new Set();
  const sections = [];
  let total = 0;

  for (let si = 0; si < sectionCount && total < maxFields; si++) {
    const want = Math.min(intBetween(rnd, minPer, maxPer), maxFields - total);
    const fields = [];
    while (fields.length < want) {
      const pick = take((c) => !onPage.has(topics[c.ti].id));
      if (!pick) break;
      onPage.add(topics[pick.c.ti].id);
      fields.push(build(pick));
    }
    if (!fields.length) continue;
    total += fields.length;

    const sec = { title: expand(rnd, titles[si] || 'Particulars', slots), fields };
    if (rnd() < 0.4 && (bank.sectionNotes || []).length) {
      sec.note = expand(rnd, pickOne(rnd, bank.sectionNotes), slots);
    }
    sections.push(sec);
  }

  /* --- echoes: ask something already on this sheet again, differently --- */

  if (sections.length && rnd() < echoChance) {
    const echoes = rnd() < 0.35 ? 2 : 1;
    const asked = shuffled(rnd, sections.flatMap((s, si) => s.fields.map((f) => ({ topic: f.topic, si }))));
    let added = 0;
    // Prefer a wording the visitor has never seen; once a topic has none
    // left, a restated older wording still asks the same thing differently.
    const plan = asked.map((a) => ({ a, freshOnly: true })).concat(asked.map((a) => ({ a, freshOnly: false })));
    const echoed = new Set();
    for (const { a, freshOnly } of plan) {
      if (added >= echoes || total >= maxFields + 1) break;
      if (echoed.has(a.topic)) continue;
      const pick = take((c) => topics[c.ti].id === a.topic, freshOnly);
      if (!pick) continue;
      echoed.add(a.topic);
      const field = build(pick);
      // Put the echo somewhere else, preferably later, so it reads as a new question.
      const later = sections.map((_, i) => i).filter((i) => i > a.si);
      const other = sections.map((_, i) => i).filter((i) => i !== a.si);
      const target = later.length ? pickOne(rnd, later) : other.length ? pickOne(rnd, other) : a.si;
      const list = sections[target].fields;
      list.splice(intBetween(rnd, target === a.si ? list.length : 0, list.length), 0, field);
      total++;
      added++;
    }
  }

  /* --- an occasional note from the Office --- */

  const pool = bank.interjections || [];
  if (pool.length && sections.length && rnd() < interjectionChance) {
    const unseen = pool.map((_, i) => i).filter((i) => !seenInterjection.has(String(i)));
    const idx = unseen.length ? pickOne(rnd, unseen) : Math.floor(rnd() * pool.length);
    const sec = pickOne(rnd, sections);
    sec.fields.splice(intBetween(rnd, 0, sec.fields.length), 0,
      { type: 'static', text: expand(rnd, pool[idx], slots) });
    if (!seenInterjection.has(String(idx))) usage.interjections.push(String(idx));
  }

  /* --- names and layout, now the order is final --- */

  const compact = (f) => ['text', 'date', 'number', 'signature'].includes(f && f.type);
  sections.forEach((sec, si) => {
    let q = 0;
    sec.fields.forEach((f, i) => {
      if (f.type !== 'static') f.name = 'p' + pageIndex + 's' + (si + 1) + 'q' + (++q);
      const next = sec.fields[i + 1];
      if (compact(f) && compact(next) && !f.width && rnd() < 0.6) {
        f.width = 'half';
        next.width = 'half';
      }
    });
  });

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
    requireAll: base.requireAll === true,
    // Each sheet is a different document, so it gets a different look.
    style: { seed: String(seed) + '::' + pageIndex },
    receipt: {
      stamp: pickOne(rnd, bank.stamps || ['RETAINED']),
      message: expand(rnd, pickOne(rnd, bank.receiptMessages) ||
        'Your copy of **{{code}}** has been saved as **{{file}}**.', slots),
      footnotes: pickMany(rnd, bank.receiptFootnotes || [], 4).map((f) => expand(rnd, f, slots)),
      next: { mode: 'generate', label: pickOne(rnd, bank.nextLabels || ['Continue to Form {{next}} →']) },
    },
    transmittal: expand(rnd, pickOne(rnd, bank.transmittals) || '', slots),
    usage,
  };
}

/** Labels of a fixed form, as seen-text keys - so random sheets never repeat them. */
export function formTexts(form) {
  const out = [];
  (form.sections || []).forEach((sec) => {
    (sec.fields || []).forEach((f) => {
      if (f.type !== 'static' && f.label) out.push(normText(f.label));
    });
  });
  return out;
}

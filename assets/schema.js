/* ============================================================
   schema.js - the form and question-bank contract.

   Used by the page to normalise definitions, and by
   scripts/check.mjs to validate the JSON in /forms before it
   is pushed.
   ============================================================ */

export const FIELD_TYPES = [
  'text', 'email', 'number', 'date', 'textarea',
  'select', 'radio', 'checkbox', 'checkboxes',
  'static', 'signature',
];

export const LIMITS = {
  fields: 120,
  sections: 30,
  options: 60,
  idLen: 48,
};

/**
 * What the button in the receipt does:
 *   generate - draw a fresh random sheet from the bank
 *   none     - nothing; the chain ends here
 */
export const NEXT_MODES = ['generate', 'none'];

export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function slugify(s, fallback) {
  const out = String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.idLen);
  return out || fallback || '';
}

/** Normalise an option into { value, label }. */
export function normOption(opt) {
  if (opt && typeof opt === 'object') {
    const value = String(opt.value != null ? opt.value : opt.label != null ? opt.label : '');
    const label = String(opt.label != null ? opt.label : value);
    return { value, label };
  }
  const v = String(opt == null ? '' : opt);
  return { value: v, label: v };
}

/**
 * Fill in defaults and derive missing field names.
 * Returns a new object; does not mutate the input.
 */
export function normalizeForm(raw) {
  const form = JSON.parse(JSON.stringify(raw || {}));

  form.id = slugify(form.id || form.code || form.title, 'form');
  form.code = String(form.code || form.id.toUpperCase());
  form.title = String(form.title || 'Untitled Form');
  form.department = form.department || 'Office of Interdepartmental Grievance Review';
  form.org = form.org || 'CONSOLIDATED INDUSTRIAL CONCERN';
  form.revision = form.revision || 'REV. 1';
  form.enforceRequired = form.enforceRequired !== false;
  // requireAll: every field that can be filled in must be, whatever its own flag says.
  form.requireAll = form.requireAll === true;
  form.submitLabel = form.submitLabel || 'SAVE COPY & FILE';
  form.sections = Array.isArray(form.sections) ? form.sections : [];
  form.officeUse = Array.isArray(form.officeUse) ? form.officeUse : [];
  form.meta = Array.isArray(form.meta) ? form.meta : [];
  form.style = form.style && typeof form.style === 'object' ? form.style : {};
  form.transmittal = form.transmittal || '';

  const receipt = form.receipt && typeof form.receipt === 'object' ? form.receipt : {};
  receipt.stamp = receipt.stamp || 'RETAINED';
  receipt.message = receipt.message ||
    'Your copy of **{{code}}** has been saved as **{{file}}**. Please continue with **Form {{next}}**.';
  receipt.footnotes = Array.isArray(receipt.footnotes) && receipt.footnotes.length
    ? receipt.footnotes
    : ['Note: Saving this copy does not constitute acknowledgement that it was received.'];
  receipt.next = receipt.next && typeof receipt.next === 'object' ? receipt.next : {};
  receipt.next.mode = NEXT_MODES.includes(receipt.next.mode) ? receipt.next.mode : 'generate';
  form.receipt = receipt;

  const used = new Set();
  form.sections.forEach((sec, si) => {
    sec.fields = Array.isArray(sec.fields) ? sec.fields : [];
    sec.fields.forEach((f, fi) => {
      f.type = FIELD_TYPES.includes(f.type) ? f.type : 'text';
      if (f.type !== 'static') {
        let name = f.name ? String(f.name) : slugify(f.label, '');
        name = name.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '');
        if (!name) name = 's' + (si + 1) + 'f' + (fi + 1);
        let candidate = name;
        let n = 2;
        while (used.has(candidate)) candidate = name + '-' + n++;
        used.add(candidate);
        f.name = candidate;
      }
      if (['select', 'radio', 'checkboxes'].includes(f.type)) {
        f.options = (Array.isArray(f.options) ? f.options : []).map(normOption);
      }
      f.width = f.width === 'half' ? 'half' : 'full';
      f.disabled = f.disabled === true;
      f.required = f.type !== 'static' && !f.disabled && (form.requireAll || f.required === true);
    });
  });

  return form;
}

function checkField(f, where, errors, warnings) {
  if (!f || typeof f !== 'object') { errors.push(where + ' is not an object.'); return; }
  if (f.type && !FIELD_TYPES.includes(f.type)) {
    errors.push(where + ': unknown type "' + f.type + '". Allowed: ' + FIELD_TYPES.join(', ') + '.');
  }
  if (f.name != null && !NAME_RE.test(String(f.name))) {
    errors.push(where + ': "name" may only contain letters, numbers, underscore and hyphen.');
  }
  if (['select', 'radio', 'checkboxes'].includes(f.type)) {
    if (!Array.isArray(f.options) || f.options.length === 0) {
      errors.push(where + ': type "' + f.type + '" needs a non-empty "options" array.');
    } else if (f.options.length > LIMITS.options) {
      errors.push(where + ': too many options (limit ' + LIMITS.options + ').');
    }
  }
  if (f.type === 'static' && !f.text) {
    warnings.push(where + ': a "static" field with no "text" renders nothing.');
  }
}

/**
 * Validate a fixed form definition.
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateForm(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The file must contain a single JSON object.'], warnings };
  }
  if (raw.id != null && !ID_RE.test(String(raw.id))) {
    errors.push('"id" must be lowercase letters, numbers and hyphens only (got "' + raw.id + '").');
  }
  if (!raw.title) errors.push('Needs a "title".');
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push('"sections" must be a non-empty array.');
  } else if (raw.sections.length > LIMITS.sections) {
    errors.push('Too many sections (' + raw.sections.length + '); the limit is ' + LIMITS.sections + '.');
  }

  let fieldCount = 0;
  const names = new Set();
  (Array.isArray(raw.sections) ? raw.sections : []).forEach((sec, si) => {
    const where = 'Section ' + (si + 1);
    if (!sec || typeof sec !== 'object') { errors.push(where + ' is not an object.'); return; }
    if (!Array.isArray(sec.fields)) { errors.push(where + ' is missing a "fields" array.'); return; }
    sec.fields.forEach((f, fi) => {
      fieldCount++;
      checkField(f, where + ', field ' + (fi + 1), errors, warnings);
      if (f && f.name) {
        if (names.has(f.name)) errors.push(where + ': duplicate field name "' + f.name + '".');
        names.add(f.name);
      }
      if (f && f.type !== 'static' && !f.label && !(sec.fields.length === 1)) {
        warnings.push(where + ', field ' + (fi + 1) + ': no "label".');
      }
    });
  });

  if (fieldCount > LIMITS.fields) {
    errors.push('Too many fields (' + fieldCount + '); the limit is ' + LIMITS.fields + '.');
  }

  const nextMode = raw.receipt && raw.receipt.next && raw.receipt.next.mode;
  if (nextMode && !NEXT_MODES.includes(nextMode)) {
    errors.push('receipt.next.mode must be one of: ' + NEXT_MODES.join(', ') + '.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ---------- question banks ---------- */

/** List pools a bank may define. Only "topics" is mandatory. */
export const BANK_POOLS = [
  'titles', 'subtitles', 'departments', 'metaLines', 'instructions',
  'sectionTitles', 'sectionNotes', 'officeUse', 'officeUseTitles',
  'finePrint', 'submitLabels', 'stamps', 'receiptMessages', 'receiptFootnotes',
  'nextLabels', 'transmittals', 'interjections', 'restatePrefixes', 'restateSuffixes',
];

/**
 * A bank is a list of topics, each asked several ways:
 *   { "id": "party-name", "type": "text", "phrasings": ["...", { "label": "...", ... }] }
 * A phrasing may override any field property of its topic (type, options, ...).
 */
export function validateBank(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The file must contain a single JSON object.'], warnings };
  }
  if (!Array.isArray(raw.topics) || raw.topics.length === 0) {
    errors.push('"topics" must be a non-empty array.');
  }

  const ids = new Set();
  (Array.isArray(raw.topics) ? raw.topics : []).forEach((t, i) => {
    const where = 'Topic ' + (i + 1) + (t && t.id ? ' ("' + t.id + '")' : '');
    if (!t || typeof t !== 'object') { errors.push(where + ' is not an object.'); return; }
    if (!t.id || !ID_RE.test(String(t.id))) {
      errors.push(where + ': needs an "id" of lowercase letters, numbers and hyphens.');
    } else if (ids.has(t.id)) {
      errors.push(where + ': duplicate topic id.');
    } else {
      ids.add(t.id);
    }
    if (!Array.isArray(t.phrasings) || t.phrasings.length === 0) {
      errors.push(where + ': needs a non-empty "phrasings" array.');
      return;
    }
    if (t.phrasings.length < 3) {
      warnings.push(where + ': only ' + t.phrasings.length + ' phrasings; it will run out quickly.');
    }
    t.phrasings.forEach((p, pi) => {
      const pw = where + ', phrasing ' + (pi + 1);
      const own = typeof p === 'string' ? { label: p } : p;
      if (!own || typeof own !== 'object') { errors.push(pw + ' must be a string or an object.'); return; }
      if (!own.label) { errors.push(pw + ': needs a "label".'); return; }
      const merged = { ...t, ...own, type: own.type || t.type || 'text' };
      if (merged.type === 'static') errors.push(pw + ': use "interjections" for static text, not a topic.');
      else checkField(merged, pw, errors, warnings);
    });
  });

  for (const pool of BANK_POOLS) {
    if (raw[pool] != null && !Array.isArray(raw[pool])) {
      errors.push('"' + pool + '" must be an array if present.');
    }
  }
  if (raw.slots != null && (typeof raw.slots !== 'object' || Array.isArray(raw.slots))) {
    errors.push('"slots" must be an object mapping slot names to arrays.');
  }

  const reach = bankReach(raw);
  if (reach.phrasings > 0 && reach.phrasings < 100) {
    warnings.push('Only ' + reach.phrasings + ' phrasings - visitors will see restated questions early.');
  }
  if (!Array.isArray(raw.sectionTitles) || !raw.sectionTitles.length) {
    warnings.push('No "sectionTitles"; every section will be headed "Particulars".');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Rough size of a bank's output space. */
export function bankReach(bank) {
  const topics = Array.isArray(bank.topics) ? bank.topics : [];
  const phrasings = topics.reduce((n, t) => n + (Array.isArray(t.phrasings) ? t.phrasings.length : 0), 0);
  const slots = bank.slots || {};
  let slotFactor = 1;
  for (const k of Object.keys(slots)) {
    if (Array.isArray(slots[k]) && slots[k].length > 1) slotFactor *= slots[k].length;
    if (slotFactor > 1e12) { slotFactor = 1e12; break; }
  }
  return { topics: topics.length, phrasings, slotCombinations: slotFactor };
}

/** Spreadsheet-style suffix: 1 -> a, 26 -> z, 27 -> aa. */
export function letterSuffix(n) {
  let s = '';
  let v = n;
  while (v > 0) {
    v -= 1;
    s = String.fromCharCode(97 + (v % 26)) + s;
    v = Math.floor(v / 26);
  }
  return s;
}

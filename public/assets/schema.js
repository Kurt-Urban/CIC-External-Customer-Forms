/* ============================================================
   schema.js - the form definition contract.

   Imported by the renderer, by the admin validator, and by the
   serverless functions, so a form is validated the same way
   wherever it is checked.
   ============================================================ */

export const FIELD_TYPES = [
  'text', 'email', 'number', 'date', 'textarea',
  'select', 'radio', 'checkbox', 'checkboxes',
  'static', 'signature',
];

/** Types that carry a user-supplied answer. */
export const INPUT_TYPES = FIELD_TYPES.filter((t) => t !== 'static');

export const LIMITS = {
  formBytes: 128 * 1024,
  bankBytes: 1024 * 1024,
  fields: 120,
  sections: 30,
  options: 60,
  idLen: 48,
  answerChars: 20000,
  submissionBytes: 96 * 1024,
  maxPages: 500,
};

/** A form either lists its sections outright, or draws them from a bank. */
export const FORM_MODES = ['static', 'generated'];

/**
 * What the Submit button offers next:
 *   generate - draw a fresh page from the bank (the endless loop)
 *   chain    - re-issue this same form under the next letter suffix
 *   form     - link to a specific other form
 *   index    - back to the schedule
 *   none     - nothing
 */
export const NEXT_MODES = ['generate', 'chain', 'form', 'index', 'none'];

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
  form.mode = FORM_MODES.includes(form.mode) ? form.mode : 'static';
  if (form.bankId) form.bankId = slugify(form.bankId, '');
  form.department = form.department || 'Office of Interdepartmental Grievance Review';
  form.org = form.org || 'CONSOLIDATED INDUSTRIAL CONCERN';
  form.revision = form.revision || 'REV. 1';
  form.order = Number.isFinite(form.order) ? form.order : 500;
  form.hidden = form.hidden === true;
  form.enforceRequired = form.enforceRequired !== false;
  form.submitLabel = form.submitLabel || 'SUBMIT FOR REVIEW';
  form.sections = Array.isArray(form.sections) ? form.sections : [];
  form.officeUse = Array.isArray(form.officeUse) ? form.officeUse : [];
  form.meta = Array.isArray(form.meta) ? form.meta : [];
  form.style = form.style && typeof form.style === 'object' ? form.style : {};

  const receipt = form.receipt && typeof form.receipt === 'object' ? form.receipt : {};
  receipt.stamp = receipt.stamp || 'RECEIVED';
  receipt.message = receipt.message ||
    'Your submission has been logged as **{{code}}**, reference **{{ref}}**, and forwarded to Interdepartmental Review.';
  receipt.footnotes = Array.isArray(receipt.footnotes) && receipt.footnotes.length
    ? receipt.footnotes
    : ['Note: Filing this form does not constitute acknowledgement that it was received.'];
  receipt.next = receipt.next && typeof receipt.next === 'object' ? receipt.next : { mode: 'index' };
  receipt.next.mode = receipt.next.mode || 'index';
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
      f.required = f.required === true;
    });
  });

  return form;
}

/**
 * Validate a (already normalised or raw) form definition.
 * @returns {{ ok: boolean, errors: string[], warnings: string[], form: object }}
 */
export function validateForm(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The file must contain a single JSON object.'], warnings, form: null };
  }

  const size = JSON.stringify(raw).length;
  if (size > LIMITS.formBytes) {
    errors.push('Definition is ' + Math.round(size / 1024) + 'KB; the limit is ' + LIMITS.formBytes / 1024 + 'KB.');
  }

  if (!raw.id && !raw.code && !raw.title) errors.push('Needs at least one of "id", "code" or "title".');
  if (raw.id != null && !ID_RE.test(String(raw.id))) {
    errors.push('"id" must be lowercase letters, numbers and hyphens only (got "' + raw.id + '").');
  }
  if (raw.id != null && String(raw.id).length > LIMITS.idLen) {
    errors.push('"id" must be ' + LIMITS.idLen + ' characters or fewer.');
  }
  const mode = raw.mode || 'static';
  if (!FORM_MODES.includes(mode)) {
    errors.push('"mode" must be "static" or "generated".');
  }

  if (mode === 'generated') {
    if (!raw.bankId) {
      errors.push('A generated form needs a "bankId" naming the question bank it draws from.');
    } else if (!ID_RE.test(String(raw.bankId))) {
      errors.push('"bankId" must be lowercase letters, numbers and hyphens only.');
    }
  } else if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    errors.push('"sections" must be a non-empty array.');
  } else if (raw.sections.length > LIMITS.sections) {
    errors.push('Too many sections (' + raw.sections.length + '); the limit is ' + LIMITS.sections + '.');
  }

  let fieldCount = 0;
  (Array.isArray(raw.sections) ? raw.sections : []).forEach((sec, si) => {
    const where = 'Section ' + (si + 1);
    if (!sec || typeof sec !== 'object') { errors.push(where + ' is not an object.'); return; }
    if (!Array.isArray(sec.fields)) { errors.push(where + ' is missing a "fields" array.'); return; }
    sec.fields.forEach((f, fi) => {
      const fw = where + ', field ' + (fi + 1);
      if (!f || typeof f !== 'object') { errors.push(fw + ' is not an object.'); return; }
      fieldCount++;
      if (f.type && !FIELD_TYPES.includes(f.type)) {
        errors.push(fw + ': unknown type "' + f.type + '". Allowed: ' + FIELD_TYPES.join(', ') + '.');
      }
      if (f.name != null && !NAME_RE.test(String(f.name))) {
        errors.push(fw + ': "name" may only contain letters, numbers, underscore and hyphen.');
      }
      if (['select', 'radio', 'checkboxes'].includes(f.type)) {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          errors.push(fw + ': type "' + f.type + '" needs a non-empty "options" array.');
        } else if (f.options.length > LIMITS.options) {
          errors.push(fw + ': too many options (limit ' + LIMITS.options + ').');
        }
      }
      if (f.type !== 'static' && !f.label && !f.name) {
        warnings.push(fw + ': no "label" - it will render without one.');
      }
      if (f.type === 'static' && !f.text) {
        warnings.push(fw + ': a "static" field with no "text" renders nothing.');
      }
    });
  });

  if (fieldCount > LIMITS.fields) {
    errors.push('Too many fields (' + fieldCount + '); the limit is ' + LIMITS.fields + '.');
  }
  if (fieldCount === 0 && mode === 'static' && errors.length === 0) {
    warnings.push('This form has no fields, so submissions will be empty.');
  }

  const nextMode = raw.receipt && raw.receipt.next && raw.receipt.next.mode;
  if (nextMode === 'form' && !(raw.receipt.next.formId)) {
    errors.push('receipt.next.mode is "form" but no "formId" was given.');
  }
  if (nextMode && !NEXT_MODES.includes(nextMode)) {
    errors.push('receipt.next.mode must be one of: ' + NEXT_MODES.join(', ') + '.');
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, form: ok ? normalizeForm(raw) : null };
}

/* ---------- question banks ---------- */

/** Pools a bank may define. Only "questions" is mandatory. */
export const BANK_POOLS = [
  'titles', 'subtitles', 'departments', 'metaLines', 'instructions',
  'sectionTitles', 'sectionNotes', 'questions', 'officeUse', 'officeUseTitles',
  'finePrint', 'submitLabels', 'stamps', 'receiptMessages', 'receiptFootnotes',
  'nextLabels',
];

export function validateBank(raw) {
  const errors = [];
  const warnings = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The file must contain a single JSON object.'], warnings, bank: null };
  }

  const size = JSON.stringify(raw).length;
  if (size > LIMITS.bankBytes) {
    errors.push('Bank is ' + Math.round(size / 1024) + 'KB; the limit is ' + LIMITS.bankBytes / 1024 + 'KB.');
  }

  if (!raw.id || !ID_RE.test(String(raw.id))) {
    errors.push('A bank needs an "id" of lowercase letters, numbers and hyphens.');
  }
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    errors.push('"questions" must be a non-empty array.');
  }

  (Array.isArray(raw.questions) ? raw.questions : []).forEach((q, i) => {
    const where = 'Question ' + (i + 1);
    if (!q || typeof q !== 'object') { errors.push(where + ' is not an object.'); return; }
    if (q.type && !FIELD_TYPES.includes(q.type)) {
      errors.push(where + ': unknown type "' + q.type + '".');
    }
    if (q.type !== 'static' && !q.label) {
      errors.push(where + ': needs a "label".');
    }
    if (['select', 'radio', 'checkboxes'].includes(q.type) &&
        (!Array.isArray(q.options) || q.options.length === 0)) {
      errors.push(where + ': type "' + q.type + '" needs a non-empty "options" array.');
    }
  });

  for (const pool of BANK_POOLS) {
    if (raw[pool] != null && !Array.isArray(raw[pool])) {
      errors.push('"' + pool + '" must be an array if present.');
    }
  }
  if (raw.slots != null && (typeof raw.slots !== 'object' || Array.isArray(raw.slots))) {
    errors.push('"slots" must be an object mapping slot names to arrays.');
  }

  const qCount = Array.isArray(raw.questions) ? raw.questions.length : 0;
  if (qCount > 0 && qCount < 12) {
    warnings.push('Only ' + qCount + ' questions - pages will repeat themselves quickly.');
  }
  if (!Array.isArray(raw.sectionTitles) || !raw.sectionTitles.length) {
    warnings.push('No "sectionTitles"; every section will be headed "Particulars".');
  }

  return { ok: errors.length === 0, errors, warnings, bank: errors.length === 0 ? raw : null };
}

/** Rough count of distinct pages a bank can produce before repeating. */
export function bankReach(bank) {
  const q = (bank.questions || []).length;
  const slots = bank.slots || {};
  let slotFactor = 1;
  for (const k of Object.keys(slots)) {
    if (Array.isArray(slots[k]) && slots[k].length > 1) slotFactor *= slots[k].length;
    if (slotFactor > 1e12) { slotFactor = 1e12; break; }
  }
  return { questions: q, slotCombinations: slotFactor };
}

/** Flat list of answer-carrying fields, in document order. */
export function inputFields(form) {
  const out = [];
  (form.sections || []).forEach((sec) => {
    (sec.fields || []).forEach((f) => { if (f.type !== 'static') out.push(f); });
  });
  return out;
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

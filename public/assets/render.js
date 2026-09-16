/* ============================================================
   render.js - builds a document from a form definition + theme.

   Nothing here knows about any specific form. Add a JSON file
   and a new template is assembled from the same components.
   ============================================================ */

import { deriveTheme, applyTheme, sectionHeading, orgMarkSVG, sealSVG } from './theme.js';
import { normalizeForm, normOption } from './schema.js';

/* ---------- tiny safe markdown ---------- */

export function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapes first, then re-introduces a very small markdown subset.
 * Form definitions are admin-supplied, but they still never get raw HTML.
 */
export function mdInline(text) {
  let s = escapeHTML(text);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\((\/[A-Za-z0-9._~\-/?=&#%]*)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function el(tag, className, html) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (html != null) n.innerHTML = html;
  return n;
}

/* ---------- field components ---------- */

function labelFor(field) {
  const req = field.required ? ' <span class="req">*</span>' : '';
  return mdInline(field.label || '') + req;
}

function textLike(field, type) {
  const input = document.createElement('input');
  input.type = type;
  input.name = field.name;
  input.id = 'f-' + field.name;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.disabled) input.disabled = true;
  if (field.required) input.required = true;
  if (field.maxLength) input.maxLength = Number(field.maxLength);
  if (type === 'number') {
    if (field.min != null) input.min = field.min;
    if (field.max != null) input.max = field.max;
  }
  return input;
}

function buildField(field, form) {
  const wrap = el('div', 'field');

  if (field.type === 'static') {
    const p = el('p', 'static-note', mdInline(field.text || ''));
    return { node: p, control: null };
  }

  if (field.type === 'checkbox') {
    // single yes/no attestation - rendered as a one-item checklist
    const list = el('div', 'checklist');
    const lab = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = field.name;
    box.id = 'f-' + field.name;
    if (field.disabled) box.disabled = true;
    if (field.required) box.required = true;
    const span = el('span', null, mdInline(field.label || '') + (field.required ? ' <span class="req">*</span>' : ''));
    lab.appendChild(box);
    lab.appendChild(span);
    list.appendChild(lab);
    wrap.appendChild(list);
    if (field.help) wrap.appendChild(el('p', 'footnote', mdInline(field.help)));
    return { node: wrap, control: box };
  }

  if (field.type === 'checkboxes' || field.type === 'radio') {
    if (field.label) {
      const l = el('label', null, labelFor(field));
      wrap.appendChild(l);
    }
    const list = el('div', 'checklist');
    const controls = [];
    (field.options || []).map(normOption).forEach((opt, i) => {
      const lab = document.createElement('label');
      const box = document.createElement('input');
      box.type = field.type === 'radio' ? 'radio' : 'checkbox';
      box.name = field.name;
      box.value = opt.value;
      box.id = 'f-' + field.name + '-' + i;
      if (field.disabled) box.disabled = true;
      lab.appendChild(box);
      lab.appendChild(el('span', null, mdInline(opt.label)));
      list.appendChild(lab);
      controls.push(box);
    });
    wrap.appendChild(list);
    if (field.help) wrap.appendChild(el('p', 'footnote', mdInline(field.help)));
    return { node: wrap, control: controls, group: true };
  }

  // labelled single control
  const l = el('label', null, labelFor(field));
  l.htmlFor = 'f-' + field.name;
  wrap.appendChild(l);

  let control;
  if (field.type === 'textarea') {
    control = document.createElement('textarea');
    control.name = field.name;
    control.id = 'f-' + field.name;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (field.rows) control.rows = Number(field.rows);
    if (field.disabled) control.disabled = true;
    if (field.required) control.required = true;
    if (field.maxLength) control.maxLength = Number(field.maxLength);
  } else if (field.type === 'select') {
    control = document.createElement('select');
    control.name = field.name;
    control.id = 'f-' + field.name;
    if (field.disabled) control.disabled = true;
    if (field.required) control.required = true;
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = field.placeholder || '— select —';
    control.appendChild(blank);
    (field.options || []).map(normOption).forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      control.appendChild(o);
    });
  } else if (field.type === 'signature') {
    control = textLike(field, 'text');
    control.autocomplete = 'off';
  } else if (field.type === 'email') {
    control = textLike(field, 'email');
  } else if (field.type === 'number') {
    control = textLike(field, 'number');
  } else if (field.type === 'date') {
    control = textLike(field, 'date');
  } else {
    control = textLike(field, 'text');
  }

  wrap.appendChild(control);

  if (field.minWords) {
    const wc = el('div', 'word-count');
    const need = Number(field.minWords);
    const update = () => {
      const n = String(control.value || '').trim().split(/\s+/).filter(Boolean).length;
      wc.textContent = n + ' / ' + need + ' words';
      wc.classList.toggle('met', n >= need);
    };
    control.addEventListener('input', update);
    update();
    wrap.appendChild(wc);
  }

  if (field.help) wrap.appendChild(el('p', 'footnote', mdInline(field.help)));

  const err = el('p', 'field-error');
  err.hidden = true;
  wrap.appendChild(err);

  return { node: wrap, control };
}

/* ---------- section assembly ---------- */

function buildSection(sec, index, theme, form) {
  const block = el('section', 'block');

  const heading = sectionHeading(theme.numbering, index + 1, sec.title || '');
  if (heading) block.appendChild(el('h2', null, escapeHTML(heading)));

  if (sec.intro) block.appendChild(el('p', 'static-note', mdInline(sec.intro)));

  // Consecutive half-width fields pair up into a two-column row.
  const host = document.createElement('div');
  const fields = sec.fields || [];
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    const next = fields[i + 1];
    if (f.width === 'half' && next && next.width === 'half' &&
        f.type !== 'static' && next.type !== 'static') {
      const row = el('div', 'row-2');
      row.appendChild(buildField(f, form).node);
      row.appendChild(buildField(next, form).node);
      host.appendChild(row);
      i += 2;
    } else {
      host.appendChild(buildField(f, form).node);
      i += 1;
    }
  }

  if (sec.seal) {
    const sealBlock = el('div', 'seal-block');
    sealBlock.innerHTML = sealSVG(theme, sec.sealLabel || form.code);
    const right = document.createElement('div');
    while (host.firstChild) right.appendChild(host.firstChild);
    sealBlock.appendChild(right);
    block.appendChild(sealBlock);
  } else {
    while (host.firstChild) block.appendChild(host.firstChild);
  }

  if (sec.note) block.appendChild(el('p', 'footnote', mdInline(sec.note)));
  return block;
}

/* ---------- whole sheet ---------- */

/**
 * Render a form into a container element.
 * @param {object} rawForm  form definition
 * @param {HTMLElement} mount
 * @param {object} [opts]   { labelOverride, metaOverride }
 * @returns {{ form, theme, sheet, submitBtn, resultPanel }}
 */
export function renderForm(rawForm, mount, opts) {
  const options = opts || {};
  const form = normalizeForm(rawForm);
  const theme = deriveTheme(form);

  const sheet = el('div', 'sheet');
  sheet.id = 'sheet';

  /* letterhead */
  const header = el('header', 'letterhead');
  const org = el('div', 'org');
  org.innerHTML = orgMarkSVG(theme);
  const orgName = el('div', 'org-name', escapeHTML(form.org) +
    '<small>' + escapeHTML(form.department) + '</small>');
  org.appendChild(orgName);
  header.appendChild(org);

  const meta = el('div', 'form-meta');
  const idLine = el('div', 'form-id');
  idLine.innerHTML = 'FORM <span data-role="form-code">' +
    escapeHTML(options.labelOverride || form.code) + '</span>';
  meta.appendChild(idLine);
  meta.appendChild(el('div', null, escapeHTML(form.revision)));
  (form.meta || []).forEach((m) => meta.appendChild(el('div', null, escapeHTML(m))));
  if (options.metaOverride) meta.appendChild(el('div', 'form-meta-extra', escapeHTML(options.metaOverride)));
  header.appendChild(meta);
  sheet.appendChild(header);

  /* title block */
  const sub = el('div', 'subhead');
  sub.appendChild(el('h1', null, escapeHTML(form.title)));
  if (form.subtitle) sub.appendChild(el('p', null, mdInline(form.subtitle)));
  sheet.appendChild(sub);

  if (form.instructions) {
    sheet.appendChild(el('div', 'instructions', mdInline(form.instructions)));
  }

  /* sections */
  form.sections.forEach((sec, i) => sheet.appendChild(buildSection(sec, i, theme, form)));

  /* office use */
  if (form.officeUse.length) {
    sheet.appendChild(el('p', 'office-use-title',
      escapeHTML(form.officeUseTitle || 'For Office Use Only')));
    const ou = el('div', 'office-use');
    form.officeUse.forEach((item) => {
      const d = document.createElement('div');
      d.innerHTML = '<span>' + escapeHTML(item.label || '') + '</span>' + escapeHTML(item.value || '—');
      ou.appendChild(d);
    });
    sheet.appendChild(ou);
  }

  /* submit row */
  const row = el('div', 'submit-row');
  if (form.finePrint) row.appendChild(el('p', 'fine-print', mdInline(form.finePrint)));
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'stamp-btn';
  btn.textContent = form.submitLabel;
  row.appendChild(btn);
  sheet.appendChild(row);

  /* counter + result panel */
  const counter = el('div', 'counter-strip');
  counter.innerHTML = 'Forms filed this session: <b data-role="filed">0</b>';
  sheet.appendChild(counter);

  const panel = el('div', 'result-panel');
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML =
    '<div class="stamp-mark" data-role="stamp"></div>' +
    '<p data-role="result-text"></p>' +
    '<p class="footnote" data-role="result-foot"></p>';
  sheet.appendChild(panel);

  applyTheme(theme, sheet);

  mount.innerHTML = '';
  mount.appendChild(sheet);

  return { form, theme, sheet, submitBtn: btn, resultPanel: panel, counter };
}

/* ---------- reading answers back ---------- */

export function collectAnswers(form, sheet) {
  const answers = {};
  (form.sections || []).forEach((sec) => {
    (sec.fields || []).forEach((f) => {
      if (f.type === 'static') return;
      if (f.type === 'checkbox') {
        const box = sheet.querySelector('[name="' + CSS.escape(f.name) + '"]');
        answers[f.name] = !!(box && box.checked);
      } else if (f.type === 'checkboxes') {
        const boxes = sheet.querySelectorAll('[name="' + CSS.escape(f.name) + '"]');
        answers[f.name] = Array.from(boxes).filter((b) => b.checked).map((b) => b.value);
      } else if (f.type === 'radio') {
        const chosen = sheet.querySelector('[name="' + CSS.escape(f.name) + '"]:checked');
        answers[f.name] = chosen ? chosen.value : '';
      } else {
        const c = sheet.querySelector('[name="' + CSS.escape(f.name) + '"]');
        answers[f.name] = c ? c.value : '';
      }
    });
  });
  return answers;
}

/** Bureaucratic phrasing for a missing required field. */
const REFUSALS = [
  'Incomplete. Cannot be entered into Ledger 7 in this condition.',
  'Left blank. The Office does not infer.',
  'Required. This is not one of the optional ones.',
  'Missing. Filing cannot proceed to the drawer.',
];

export function validateAnswers(form, sheet, answers) {
  const problems = [];
  if (form.enforceRequired === false) return problems;

  sheet.querySelectorAll('.field.invalid').forEach((n) => n.classList.remove('invalid'));
  sheet.querySelectorAll('.field-error').forEach((n) => { n.hidden = true; n.textContent = ''; });

  (form.sections || []).forEach((sec) => {
    (sec.fields || []).forEach((f) => {
      if (f.type === 'static' || !f.required || f.disabled) return;
      const v = answers[f.name];
      const empty = f.type === 'checkbox' ? v !== true
        : f.type === 'checkboxes' ? !(Array.isArray(v) && v.length)
        : !String(v == null ? '' : v).trim();
      if (!empty) return;

      problems.push({ field: f });
      const anyControl = sheet.querySelector('[name="' + CSS.escape(f.name) + '"]');
      const wrap = anyControl && anyControl.closest('.field');
      if (wrap) {
        wrap.classList.add('invalid');
        const err = wrap.querySelector('.field-error');
        if (err) {
          err.textContent = REFUSALS[problems.length % REFUSALS.length];
          err.hidden = false;
        }
      }
    });
  });

  return problems;
}

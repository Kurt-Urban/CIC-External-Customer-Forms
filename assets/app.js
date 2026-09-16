/* ============================================================
   app.js - the filing loop.

   Step 0 is always Form GC-1, exactly as written in forms/gc-1.json.
   Saving it as a PDF unlocks step 1: a sheet drawn at random from
   forms/bank.json. Saving that unlocks step 2, and so on.

   The session remembers every question wording this visitor has been
   shown, so no sheet repeats one. It also keeps the current sheet and
   the answers typed so far, so a reload changes nothing.
   ============================================================ */

import {
  renderForm, collectAnswers, restoreAnswers, validateAnswers, watchRequired,
  incompleteMessage, mdInline, escapeHTML,
} from './render.js';
import { generatePage, formTexts } from './generator.js';
import { letterSuffix } from './schema.js';
import { saveCopy, printCopy } from './pdf.js';

const mount = document.getElementById('mount');
const params = new URLSearchParams(location.search);
// ?dry=1 builds the PDF without downloading it - for testing the loop.
const DRY = params.get('dry') === '1';

const STATE_KEY = 'cic:state';
const DRAFT_PREFIX = 'cic:draft:';

const docs = { gc1: null, bank: null };

const state = {
  step: 0,     // 0 = GC-1, 1 = GC-1a, 2 = GC-1b ...
  seed: '',    // random seed of the current generated sheet
  filed: 0,    // copies saved this session
  page: null,  // the current generated sheet, exactly as first drawn
  used: null,  // { phrasings, texts, interjections } already shown
  form: null,
  rendered: null,
};

/* ---------- storage (all optional) ---------- */

function store(key, value) {
  try {
    if (value === undefined) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* private mode or blocked storage: the loop still works */ }
}

function recall(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function draftKey() {
  return DRAFT_PREFIX + state.step + ':' + (state.seed || 'gc-1');
}

function saveState() {
  store(STATE_KEY, {
    step: state.step, seed: state.seed, filed: state.filed, page: state.page, used: state.used,
  });
}

/** A fresh visitor has "seen" only GC-1's own questions. */
function freshUsage() {
  return { phrasings: [], texts: formTexts(docs.gc1), interjections: [], families: [] };
}

function drawSheet() {
  const base = {
    id: docs.gc1.id,
    code: baseCode(),
    org: docs.gc1.org,
    department: docs.gc1.department,
    title: docs.gc1.title,
    // Random sheets are held to the same standard as GC-1.
    enforceRequired: true,
    requireAll: docs.gc1.requireAll === true,
  };
  const page = generatePage(docs.bank, base, state.seed, state.step, state.used);
  const u = page.usage;
  state.used = {
    phrasings: state.used.phrasings.concat(u.phrasings),
    texts: state.used.texts.concat(u.texts),
    interjections: state.used.interjections.concat(u.interjections),
    families: (state.used.families || []).concat(u.family ? [u.family] : []),
  };
  delete page.usage;
  state.page = page;
}

function clearDrafts() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(DRAFT_PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch { /* nothing to clear */ }
}

/* ---------- helpers ---------- */

function randomHex(bytes) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  const s = Array.from(buf).map((b) => alphabet[b % alphabet.length]).join('');
  return s.slice(0, 3) + '-' + s.slice(3);
}

function fillTemplate(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}

function baseCode() {
  return docs.gc1 ? docs.gc1.code : 'GC-1';
}

function codeFor(step) {
  return baseCode() + letterSuffix(step);
}

function nowStamp() {
  const d = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const pad = (n) => String(n).padStart(2, '0');
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fail(title, detail) {
  mount.innerHTML =
    '<div class="sheet stock-cream ink-red edge-perforated rule-hair" id="sheet">' +
    '<div class="subhead"><h1>' + escapeHTML(title) + '</h1></div>' +
    '<p class="empty-note">' + escapeHTML(detail) + '</p>' +
    '</div>';
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(path + ' — HTTP ' + res.status);
  return res.json();
}

/* ---------- building the current sheet ---------- */

function currentDefinition() {
  if (state.step === 0) return docs.gc1;
  if (!state.page) {
    drawSheet();
    saveState();
  }
  return state.page;
}

function show() {
  const rendered = renderForm(currentDefinition(), mount);
  state.form = rendered.form;
  state.rendered = rendered;

  document.title = 'CIC Form ' + rendered.form.code + ' — ' + rendered.form.title;

  const counter = rendered.sheet.querySelector('[data-role="filed"]');
  if (counter) counter.textContent = String(state.filed);

  restoreAnswers(rendered.form, rendered.sheet, recall(draftKey()));

  const persist = () => store(draftKey(), collectAnswers(rendered.form, rendered.sheet));
  rendered.sheet.addEventListener('input', persist);
  rendered.sheet.addEventListener('change', persist);

  watchRequired(rendered.form, rendered.sheet);
  rendered.submitBtn.addEventListener('click', onSave);

  if (state.step > 0) {
    const out = document.createElement('p');
    out.className = 'restart';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'restart-btn';
    btn.textContent = 'Withdraw and begin again at Form ' + baseCode();
    btn.addEventListener('click', restart);
    out.appendChild(btn);
    out.appendChild(document.createTextNode(' — withdrawal restarts your obligations from the beginning.'));
    rendered.sheet.appendChild(out);
  }
}

/* ---------- saving ---------- */

async function onSave() {
  const { form, sheet, submitBtn, resultPanel } = state.rendered;

  const answers = collectAnswers(form, sheet);
  const problems = validateAnswers(form, sheet, answers);
  const saveError = sheet.querySelector('[data-role="save-error"]');
  if (problems.length) {
    if (saveError) {
      saveError.textContent = incompleteMessage(problems.length);
      saveError.hidden = false;
    }
    const first = sheet.querySelector('.field.invalid');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const control = first.querySelector('input:not([disabled]), textarea, select');
      if (control) control.focus({ preventScroll: true });
    }
    return;
  }
  if (saveError) saveError.hidden = true;

  const ref = makeRef();
  const filename = 'CIC-' + form.code + '-' + ref + '.pdf';
  const label = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'PREPARING COPY…';
  resultPanel.classList.remove('show');

  let savedAs = filename;
  try {
    await saveCopy(sheet, {
      ref,
      code: form.code,
      filename,
      title: 'CIC Form ' + form.code + ' — ' + form.title,
      when: nowStamp(),
      stampText: form.copyStamp || 'DECLARANT’S COPY',
      transmittal: form.transmittal,
    }, { dry: DRY });
  } catch (err) {
    // No PDF library (offline, blocked CDN): fall back to the print dialog.
    console.warn('PDF generation failed, falling back to print:', err);
    const ok = window.confirm(
      'The Office could not prepare your copy automatically.\n\n' +
      'Your browser’s print dialog will open instead. Choose “Save as PDF” as the destination.');
    if (!ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = label;
      return;
    }
    await printCopy();
    savedAs = 'a PDF of your choosing';
  }

  submitBtn.textContent = label;
  state.filed += 1;
  saveState();
  showReceipt(ref, savedAs);
}

function showReceipt(ref, savedAs) {
  const { form, sheet, resultPanel } = state.rendered;
  const receipt = form.receipt;

  const counter = sheet.querySelector('[data-role="filed"]');
  if (counter) counter.textContent = String(state.filed);

  const vars = {
    code: form.code,
    next: codeFor(state.step + 1),
    ref,
    file: savedAs,
    count: state.filed,
    queue: (4000 + Math.floor(Math.random() * 90000)).toLocaleString('en'),
    title: form.title,
  };

  resultPanel.querySelector('[data-role="stamp"]').textContent = receipt.stamp;
  resultPanel.querySelector('[data-role="result-text"]').innerHTML = mdInline(fillTemplate(receipt.message, vars));
  const foot = receipt.footnotes[(state.filed - 1) % receipt.footnotes.length];
  resultPanel.querySelector('[data-role="result-foot"]').innerHTML = mdInline(fillTemplate(foot, vars));

  const old = resultPanel.querySelector('.next-btn, .again-btn');
  if (old) old.remove();

  if (receipt.next.mode !== 'none') {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'next-btn';
    next.textContent = fillTemplate(receipt.next.label || 'Open Form {{next}} →', vars);
    next.addEventListener('click', advance);
    resultPanel.appendChild(next);
  }

  // The sheet stays editable; saving again produces a fresh copy.
  state.rendered.submitBtn.disabled = false;

  resultPanel.classList.add('show');
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ---------- moving on ---------- */

function advance() {
  store(draftKey(), undefined);
  state.step += 1;
  state.seed = randomHex(8);
  drawSheet();
  saveState();
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function restart() {
  if (!window.confirm('Withdraw from this matter and return to Form ' + baseCode() + '?\n\n' +
      'Copies already saved remain valid. Answers on this sheet will be discarded.')) return;
  clearDrafts();
  state.step = 0;
  state.seed = '';
  state.page = null;
  state.used = freshUsage();
  saveState();
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- start ---------- */

async function start() {
  try {
    [docs.gc1, docs.bank] = await Promise.all([
      loadJSON('forms/gc-1.json'),
      loadJSON('forms/bank.json'),
    ]);
  } catch (err) {
    fail('The drawer is stuck', 'Could not load the forms. ' + err.message);
    return;
  }

  state.used = freshUsage();
  const saved = recall(STATE_KEY);
  if (saved && Number.isInteger(saved.step) && saved.step >= 0) {
    state.step = saved.step;
    state.seed = typeof saved.seed === 'string' ? saved.seed : '';
    state.filed = Number(saved.filed) || 0;
    const u = saved.used;
    if (u && Array.isArray(u.phrasings) && Array.isArray(u.texts) && Array.isArray(u.interjections)) {
      state.used = { ...u, families: Array.isArray(u.families) ? u.families : [] };
    }
    if (state.step > 0) {
      if (!state.seed) state.seed = randomHex(8);
      if (saved.page && Array.isArray(saved.page.sections)) state.page = saved.page;
    }
  }

  show();
}

start();

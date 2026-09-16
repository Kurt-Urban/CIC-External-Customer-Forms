/* ============================================================
   form-page.js - loads one page of paperwork, renders it, files
   it, and then fetches the next page. Forever.
   ============================================================ */

import { renderForm, collectAnswers, validateAnswers, mdInline, escapeHTML } from './render.js';
import { letterSuffix } from './schema.js';

const mount = document.getElementById('mount');
const params = new URLSearchParams(location.search);
const formId = params.get('f') || 'gc-1';

const state = {
  mode: 'static',
  seed: '',
  page: 0,
  pageToken: '',
  form: null,
  sheet: null,
  filed: 0,
  rendered: null,
};

/* ---------- session continuity ---------- */

const SESSION_KEY = 'cic:' + formId;

function newSeed() {
  const buf = new Uint8Array(8);
  (self.crypto || window.crypto).getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s.seed === 'string' && Number.isFinite(s.page)) return s;
    }
  } catch { /* private mode, blocked storage - fall through */ }
  return { seed: newSeed(), page: 0, filed: 0 };
}

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      seed: state.seed, page: state.page, filed: state.filed,
    }));
  } catch { /* nothing to do; the loop still works in-memory */ }
}

/* ---------- helpers ---------- */

function fail(title, detail) {
  mount.innerHTML =
    '<div class="sheet stock-cream ink-red edge-perforated rule-hair">' +
    '<div class="subhead"><h1>' + escapeHTML(title) + '</h1></div>' +
    '<p class="empty-note">' + escapeHTML(detail) + '</p>' +
    '<p style="text-align:center;margin-top:18px"><a class="next-btn" href="/">Return to the form index</a></p>' +
    '</div>';
}

function fillTemplate(str, vars) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
}

function nextCode() {
  const base = state.form ? String(state.form.code).replace(/[a-z]+$/, '') : 'GC-1';
  return base + letterSuffix(state.page + 1);
}

/* ---------- loading a page ---------- */

async function fetchPage(pageIndex) {
  const url = '/api/forms?id=' + encodeURIComponent(formId) +
    '&seed=' + encodeURIComponent(state.seed) +
    '&page=' + encodeURIComponent(pageIndex);

  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.status === 404) {
    const e = new Error('Form "' + formId + '" is not on file. It may have been withdrawn, or never drafted.');
    e.notFound = true;
    throw e;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || ('HTTP ' + res.status));
  }
  return res.json();
}

function renderPage(data) {
  state.mode = data.mode;
  state.pageToken = data.pageToken || '';
  if (data.mode === 'generated') state.page = data.page;

  const rendered = renderForm(data.form, mount);
  state.form = rendered.form;
  state.sheet = rendered.sheet;
  state.rendered = rendered;

  document.title = 'CIC Form ' + rendered.form.code + ' — ' + rendered.form.title;

  const counterEl = rendered.sheet.querySelector('[data-role="filed"]');
  if (counterEl) counterEl.textContent = String(state.filed);

  // Honeypot: invisible to people, irresistible to bots.
  const hp = document.createElement('input');
  hp.type = 'text';
  hp.name = '_hp';
  hp.tabIndex = -1;
  hp.autocomplete = 'off';
  hp.setAttribute('aria-hidden', 'true');
  hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
  rendered.sheet.appendChild(hp);

  rendered.submitBtn.addEventListener('click', () => submit(rendered));
}

async function start() {
  const sess = loadSession();
  state.seed = sess.seed;
  state.page = sess.page;
  state.filed = sess.filed || 0;

  try {
    renderPage(await fetchPage(state.page));
  } catch (err) {
    if (err.notFound) fail('No such form', err.message);
    else fail('The drawer is stuck', 'Could not retrieve the form. ' + (err.message || ''));
  }
}

/* ---------- filing ---------- */

async function submit(rendered) {
  const { submitBtn, resultPanel } = rendered;
  const form = state.form;
  const sheet = state.sheet;

  const answers = collectAnswers(form, sheet);
  const problems = validateAnswers(form, sheet, answers);
  if (problems.length) {
    const first = sheet.querySelector('.field.invalid');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const hp = sheet.querySelector('[name="_hp"]');
  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'STAMPING…';

  let result;
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        formId,
        pageToken: state.pageToken,
        answers,
        _hp: hp ? hp.value : '',
      }),
    });
    result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || ('HTTP ' + res.status));
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
    showRejection(resultPanel, err.message || 'Unknown obstruction.');
    return;
  }

  state.filed += 1;
  saveSession();

  const counterEl = sheet.querySelector('[data-role="filed"]');
  if (counterEl) counterEl.textContent = String(state.filed);

  const receipt = form.receipt;
  const vars = {
    code: form.code,
    next: nextCode(),
    ref: result.ref || '—',
    count: state.filed,
    queue: result.queue != null ? result.queue : '—',
    title: form.title,
  };

  resultPanel.querySelector('[data-role="stamp"]').textContent = receipt.stamp;
  resultPanel.querySelector('[data-role="result-text"]').innerHTML =
    mdInline(fillTemplate(receipt.message, vars));
  const foot = receipt.footnotes[(state.filed - 1) % receipt.footnotes.length];
  resultPanel.querySelector('[data-role="result-foot"]').innerHTML =
    mdInline(fillTemplate(foot, vars));

  const oldBtn = resultPanel.querySelector('.next-btn');
  if (oldBtn) oldBtn.remove();
  const nextNode = buildNext(receipt.next, vars);
  if (nextNode) resultPanel.appendChild(nextNode);

  resultPanel.classList.add('show');
  submitBtn.textContent = originalLabel;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showRejection(panel, message) {
  panel.querySelector('[data-role="stamp"]').textContent = 'NOT FILED';
  panel.querySelector('[data-role="result-text"]').innerHTML =
    escapeHTML(message) + ' The Office regrets nothing.';
  panel.querySelector('[data-role="result-foot"]').textContent = '';
  const oldBtn = panel.querySelector('.next-btn');
  if (oldBtn) oldBtn.remove();
  panel.classList.add('show');
}

/* ---------- what happens after filing ---------- */

function buildNext(next, vars) {
  if (next.mode === 'none') return null;

  if (next.mode === 'index') {
    const a = document.createElement('a');
    a.className = 'next-btn';
    a.href = '/';
    a.textContent = next.label || 'Return to the form index →';
    return a;
  }

  if (next.mode === 'form') {
    const a = document.createElement('a');
    a.className = 'next-btn';
    a.href = '/form.html?f=' + encodeURIComponent(next.formId);
    a.textContent = fillTemplate(next.label || 'Continue to the next form →', vars);
    return a;
  }

  // generate / chain: produce the next sheet in place
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'next-btn';
  b.textContent = fillTemplate(next.label || 'Open Form {{next}} →', vars);
  b.addEventListener('click', () => advance(b));
  return b;
}

async function advance(btn) {
  btn.disabled = true;
  btn.textContent = 'RETRIEVING NEXT SHEET…';

  state.page += 1;
  saveSession();

  try {
    const data = await fetchPage(state.page);
    renderPage(data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    state.page -= 1;
    saveSession();
    btn.disabled = false;
    btn.textContent = 'Retry →';
    const panel = state.sheet && state.sheet.querySelector('.result-panel');
    if (panel) {
      panel.querySelector('[data-role="result-foot"]').textContent =
        'The next sheet could not be retrieved. ' + (err.message || '');
    }
  }
}

start();

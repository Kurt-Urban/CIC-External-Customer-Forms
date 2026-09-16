/* ============================================================
   admin.js - the registry console.

   Contains no secrets: the password is posted once to /api/admin
   and exchanged for a short-lived token. Everything on this page
   is drawn from authenticated responses.
   ============================================================ */

import { validateForm, validateBank, bankReach } from './schema.js';
import { deriveTheme, themeSummary, orgMarkSVG } from './theme.js';
import { escapeHTML } from './render.js';

const TOKEN_KEY = 'cic-registry-token';

let token = '';
let offset = 0;
let pageLimit = 25;
let total = 0;
let currentFilter = '';
let editing = null;

/* ---------- element helpers ---------- */

const $ = (id) => document.getElementById(id);

function notice(host, kind, html) {
  host.innerHTML = html ? '<div class="notice ' + kind + '">' + html + '</div>' : '';
}

function listHTML(items) {
  return '<ul>' + items.map((i) => '<li>' + escapeHTML(i) + '</li>').join('') + '</ul>';
}

/* ---------- API ---------- */

async function api(action, payload = {}, raw = false) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  if (res.status === 401 && action !== 'login') {
    lock('Session expired. Unlock again.');
    throw new Error('Not authorised.');
  }
  if (raw) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok && body.errors) return body;          // validation failures carry detail
  if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
  return body;
}

/* ---------- session ---------- */

function saveToken(t) {
  token = t;
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage blocked */ }
}

function lock(message) {
  token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
  $('adminView').classList.add('hidden');
  $('loginView').classList.remove('hidden');
  if (message) notice($('loginNotice'), 'err', escapeHTML(message));
}

async function unlock() {
  $('loginView').classList.add('hidden');
  $('adminView').classList.remove('hidden');
  await Promise.all([loadRegistry(), loadSubmissions(), loadStats()]);
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('loginBtn');
  btn.disabled = true;
  btn.textContent = 'CHECKING…';
  notice($('loginNotice'), 'info', '');

  try {
    const res = await api('login', { password: $('pw').value });
    saveToken(res.token);
    $('pw').value = '';
    await unlock();
  } catch (err) {
    notice($('loginNotice'), 'err', escapeHTML(err.message || 'Could not unlock.'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'UNLOCK';
  }
});

$('logoutBtn').addEventListener('click', () => lock(''));

/* ---------- tabs ---------- */

document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      $(t.dataset.panel).classList.toggle('hidden', !on);
    });
  });
});

/* ---------- stats ---------- */

async function loadStats() {
  try {
    const s = await api('stats');
    $('statLine').textContent = s.total + ' SHEET' + (s.total === 1 ? '' : 'S') + ' ON FILE';
  } catch { /* header detail only */ }
}

/* ---------- submissions ---------- */

function entryValue(e) {
  if (Array.isArray(e.answer)) return e.answer.length ? e.answer.join('\n') : '—';
  if (e.answer === true) return 'Yes';
  if (e.answer === false) return 'No';
  const s = String(e.answer == null ? '' : e.answer);
  return s.trim() ? s : '—';
}

function submissionNode(sub) {
  const row = document.createElement('div');
  row.className = 'sub-row';

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'sub-head';
  head.setAttribute('aria-expanded', 'false');
  head.innerHTML =
    '<span class="sub-code">' + escapeHTML(sub.formCode) + '</span>' +
    '<span class="sub-summary">' + escapeHTML(sub.summary) + '</span>' +
    '<span class="sub-date">' + escapeHTML(new Date(sub.receivedAt).toLocaleString()) + '</span>';
  head.addEventListener('click', () => {
    const open = row.classList.toggle('open');
    head.setAttribute('aria-expanded', String(open));
  });
  row.appendChild(head);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'sub-body';

  const meta = document.createElement('p');
  meta.className = 'footnote';
  meta.style.marginTop = '8px';
  meta.textContent = 'Ref ' + sub.ref + ' · ' + sub.formTitle +
    (sub.page != null ? ' · page ' + (sub.page + 1) : '') +
    ' · ' + sub.answered + ' of ' + sub.count + ' answered' +
    (sub.queue != null ? ' · queue ' + sub.queue : '');
  bodyEl.appendChild(meta);

  const table = document.createElement('table');
  table.className = 'answer-table';
  let lastSection = null;
  (sub.entries || []).forEach((e) => {
    if (e.section && e.section !== lastSection) {
      lastSection = e.section;
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.style.cssText = 'font-family:var(--font-display);font-size:10px;letter-spacing:.06em;' +
        'text-transform:uppercase;color:var(--stamp);padding-top:14px';
      td.textContent = e.section;
      tr.appendChild(td);
      table.appendChild(tr);
    }
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = e.question;
    const td = document.createElement('td');
    td.textContent = entryValue(e);
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  });
  bodyEl.appendChild(table);

  const tools = document.createElement('div');
  tools.className = 'toolbar';
  tools.style.marginTop = '12px';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'mini-btn danger';
  del.textContent = 'Delete this sheet';
  del.addEventListener('click', async () => {
    if (!confirm('Permanently delete submission ' + sub.ref + '? This cannot be undone.')) return;
    del.disabled = true;
    try {
      await api('delete_submission', { key: sub.key });
      row.remove();
      loadStats();
    } catch (err) {
      del.disabled = false;
      alert('Could not delete: ' + err.message);
    }
  });
  tools.appendChild(del);
  bodyEl.appendChild(tools);

  row.appendChild(bodyEl);
  return row;
}

async function loadSubmissions() {
  const host = $('subsList');
  host.innerHTML = '<p class="empty-note">Opening the drawer…</p>';
  notice($('subsNotice'), 'info', '');

  try {
    const res = await api('list_submissions', { formId: currentFilter, offset, limit: pageLimit });
    total = res.total;

    if (!res.submissions.length) {
      host.innerHTML = '<p class="empty-note">' +
        (total ? 'No sheets on this page.' : 'Nothing has been filed yet.') + '</p>';
    } else {
      host.innerHTML = '';
      res.submissions.forEach((s) => host.appendChild(submissionNode(s)));
    }

    const from = total ? offset + 1 : 0;
    const to = Math.min(offset + pageLimit, total);
    $('pageInfo').textContent = from + '–' + to + ' of ' + total;
    $('prevPageBtn').disabled = offset === 0;
    $('nextPageBtn').disabled = offset + pageLimit >= total;
  } catch (err) {
    host.innerHTML = '';
    notice($('subsNotice'), 'err', escapeHTML(err.message));
  }
}

$('refreshBtn').addEventListener('click', () => { offset = 0; loadSubmissions(); loadStats(); });
$('prevPageBtn').addEventListener('click', () => { offset = Math.max(0, offset - pageLimit); loadSubmissions(); });
$('nextPageBtn').addEventListener('click', () => { offset += pageLimit; loadSubmissions(); });
$('formFilter').addEventListener('change', (e) => { currentFilter = e.target.value; offset = 0; loadSubmissions(); });
$('expandAllBtn').addEventListener('click', () => {
  const rows = document.querySelectorAll('#subsList .sub-row');
  const anyClosed = Array.from(rows).some((r) => !r.classList.contains('open'));
  rows.forEach((r) => {
    r.classList.toggle('open', anyClosed);
    const h = r.querySelector('.sub-head');
    if (h) h.setAttribute('aria-expanded', String(anyClosed));
  });
  $('expandAllBtn').textContent = anyClosed ? 'Collapse all' : 'Expand all';
});

/* ---------- exports ---------- */

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('exportCsvBtn').addEventListener('click', async () => {
  try {
    const res = await api('export', { formId: currentFilter, format: 'csv' }, true);
    download('cic-submissions' + (currentFilter ? '-' + currentFilter : '') + '.csv',
      await res.text(), 'text/csv');
  } catch (err) {
    notice($('subsNotice'), 'err', escapeHTML(err.message));
  }
});

$('exportJsonBtn').addEventListener('click', async () => {
  try {
    const res = await api('export', { formId: currentFilter, format: 'json' });
    download('cic-submissions' + (currentFilter ? '-' + currentFilter : '') + '.json',
      JSON.stringify(res, null, 2), 'application/json');
  } catch (err) {
    notice($('subsNotice'), 'err', escapeHTML(err.message));
  }
});

/* ---------- registry ---------- */

function docRow(doc, kind) {
  const row = document.createElement('div');
  row.className = 'sub-row';
  row.style.padding = '10px 12px';

  const line = document.createElement('div');
  line.style.cssText = 'display:flex;gap:10px;align-items:baseline;flex-wrap:wrap';

  const code = document.createElement('span');
  code.className = 'sub-code';
  code.textContent = kind === 'bank' ? doc.id : doc.code;
  line.appendChild(code);

  const title = document.createElement('span');
  title.className = 'sub-summary';
  title.style.whiteSpace = 'normal';
  title.textContent = kind === 'bank'
    ? (doc.name || doc.id) + ' — ' + doc.questions + ' questions'
    : doc.title;
  line.appendChild(title);

  const chip = document.createElement('span');
  chip.className = 'index-chip';
  chip.textContent = kind === 'bank'
    ? doc.source
    : doc.mode + (doc.hidden ? ' · hidden' : '') + ' · ' + doc.source;
  line.appendChild(chip);

  row.appendChild(line);

  const tools = document.createElement('div');
  tools.className = 'toolbar';
  tools.style.marginTop = '10px';
  tools.style.marginBottom = '0';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'mini-btn';
  edit.textContent = 'Edit JSON';
  edit.addEventListener('click', () => openEditor(doc.id, kind));
  tools.appendChild(edit);

  if (kind === 'form') {
    const view = document.createElement('a');
    view.className = 'mini-btn';
    view.href = '/form.html?f=' + encodeURIComponent(doc.id);
    view.target = '_blank';
    view.rel = 'noopener';
    view.textContent = 'Open ↗';
    tools.appendChild(view);
  }

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'mini-btn danger';
  del.textContent = doc.source === 'seed' ? 'Remove from site' : 'Delete';
  del.addEventListener('click', async () => {
    const msg = doc.source === 'seed'
      ? 'Hide seed ' + kind + ' "' + doc.id + '" from the site? The file stays in the repo and can be restored here.'
      : 'Delete ' + kind + ' "' + doc.id + '"? This cannot be undone.';
    if (!confirm(msg)) return;
    try {
      await api('delete_document', { id: doc.id, kind });
      loadRegistry();
    } catch (err) {
      alert('Could not delete: ' + err.message);
    }
  });
  tools.appendChild(del);

  if (doc.source === 'uploaded') {
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'mini-btn';
    restore.textContent = 'Revert to repo version';
    restore.addEventListener('click', async () => {
      if (!confirm('Discard the uploaded version of "' + doc.id + '" and go back to the one in the repo?')) return;
      try {
        await api('restore_document', { id: doc.id, kind });
        loadRegistry();
      } catch (err) {
        alert('Could not restore: ' + err.message);
      }
    });
    tools.appendChild(restore);
  }

  row.appendChild(tools);
  return row;
}

async function loadRegistry() {
  try {
    const res = await api('list_forms');

    const fHost = $('formsList');
    fHost.innerHTML = '';
    if (!res.forms.length) fHost.innerHTML = '<p class="empty-note">No forms on file.</p>';
    else res.forms.forEach((f) => fHost.appendChild(docRow(f, 'form')));

    const bHost = $('banksList');
    bHost.innerHTML = '';
    if (!res.banks.length) bHost.innerHTML = '<p class="empty-note">No question banks on file.</p>';
    else res.banks.forEach((b) => bHost.appendChild(docRow(b, 'bank')));

    const filter = $('formFilter');
    const keep = filter.value;
    filter.innerHTML = '<option value="">All forms</option>';
    res.forms.forEach((f) => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.code + ' — ' + f.title;
      filter.appendChild(o);
    });
    filter.value = keep;
  } catch (err) {
    $('formsList').innerHTML = '<p class="empty-note">' + escapeHTML(err.message) + '</p>';
  }
}

/* ---------- editor ---------- */

async function openEditor(id, kind) {
  try {
    const res = await api('get_document', { id, kind });
    editing = { id, kind };
    $('editorTitle').textContent = kind + ' “' + id + '”';
    $('editorArea').value = JSON.stringify(res.document, null, 2);
    $('editorWrap').classList.remove('hidden');
    notice($('editorNotice'), 'info', '');
    $('editorWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    alert('Could not open: ' + err.message);
  }
}

$('editorCancelBtn').addEventListener('click', () => {
  editing = null;
  $('editorWrap').classList.add('hidden');
});

function checkDocument(text, host) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    notice(host, 'err', 'Not valid JSON — ' + escapeHTML(err.message));
    return null;
  }
  const result = parsed.kind === 'bank' ? validateBank(parsed) : validateForm(parsed);
  if (!result.ok) {
    notice(host, 'err', '<strong>Cannot save.</strong>' + listHTML(result.errors));
    return null;
  }
  const warn = result.warnings.length
    ? '<strong>Looks valid.</strong> Worth checking:' + listHTML(result.warnings)
    : '<strong>Looks valid.</strong>';
  notice(host, 'ok', warn);
  return parsed;
}

$('editorCheckBtn').addEventListener('click', () => {
  checkDocument($('editorArea').value, $('editorNotice'));
});

$('editorSaveBtn').addEventListener('click', async () => {
  const parsed = checkDocument($('editorArea').value, $('editorNotice'));
  if (!parsed) return;
  try {
    const res = await api('save_document', { document: parsed });
    if (res.errors) {
      notice($('editorNotice'), 'err', '<strong>Rejected.</strong>' + listHTML(res.errors));
      return;
    }
    notice($('editorNotice'), 'ok', 'Saved. The site is using this version now.');
    loadRegistry();
  } catch (err) {
    notice($('editorNotice'), 'err', escapeHTML(err.message));
  }
});

/* ---------- add / upload ---------- */

const dropZone = $('dropZone');
const fileInput = $('fileInput');

['dragenter', 'dragover'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('over'); }));

dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) readFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) readFile(fileInput.files[0]);
});

function readFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    notice($('addNotice'), 'err', 'That file is larger than 2MB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    $('addArea').value = String(reader.result || '');
    $('dropFileName').textContent = file.name + ' — ' + Math.round(file.size / 102.4) / 10 + ' KB';
    validateAdd();
  };
  reader.onerror = () => notice($('addNotice'), 'err', 'Could not read that file.');
  reader.readAsText(file);
}

function validateAdd() {
  const parsed = checkDocument($('addArea').value, $('addNotice'));
  const wrap = $('previewWrap');

  if (!parsed || parsed.kind === 'bank') {
    wrap.classList.add('hidden');
    if (parsed && parsed.kind === 'bank') {
      const reach = bankReach(parsed);
      const host = $('addNotice').querySelector('.notice');
      if (host) {
        host.insertAdjacentHTML('beforeend',
          '<p style="margin:8px 0 0">' + reach.questions + ' questions · ' +
          reach.slotCombinations.toLocaleString('en') + ' slot combinations.</p>');
      }
    }
    return;
  }

  // Show the template this form will be assigned.
  const theme = deriveTheme(parsed);
  const host = $('previewSwatches');
  host.innerHTML = '';
  themeSummary(theme).forEach(([k, v]) => {
    const span = document.createElement('span');
    span.className = 'swatch-label';
    span.textContent = k + ': ' + v;
    span.style.marginRight = '8px';
    host.appendChild(span);
  });
  wrap.classList.remove('hidden');
}

$('validateBtn').addEventListener('click', validateAdd);

$('saveBtn').addEventListener('click', async () => {
  const parsed = checkDocument($('addArea').value, $('addNotice'));
  if (!parsed) return;
  try {
    const res = await api('save_document', { document: parsed });
    if (res.errors) {
      notice($('addNotice'), 'err', '<strong>Rejected.</strong>' + listHTML(res.errors));
      return;
    }
    const link = res.kind === 'form'
      ? ' <a href="/form.html?f=' + encodeURIComponent(res.id) + '" target="_blank" rel="noopener">Open it ↗</a>'
      : '';
    notice($('addNotice'), 'ok', 'Saved <strong>' + escapeHTML(res.id) + '</strong> as a ' + res.kind + '.' + link);
    loadRegistry();
  } catch (err) {
    notice($('addNotice'), 'err', escapeHTML(err.message));
  }
});

$('clearBtn').addEventListener('click', () => {
  $('addArea').value = '';
  $('dropFileName').textContent = '';
  notice($('addNotice'), 'info', '');
  $('previewWrap').classList.add('hidden');
});

/* ---------- templates ---------- */

const FORM_TEMPLATE = {
  id: 'gc-3',
  code: 'GC-3',
  title: 'Certificate of Grievance Severity',
  subtitle: 'Cannot be issued without Form GC-3a, which cannot be issued without this.',
  mode: 'static',
  order: 30,
  chip: 'REQUIRED',
  indexBlurb: 'Assigns a severity band to a grievance already on file.',
  department: 'Asset Valuation & Mourning',
  instructions: '**Before you begin:** severity is assessed, not asserted. Your assessment is recorded and disregarded.',
  sections: [
    {
      title: 'Grievance Reference',
      fields: [
        { name: 'ref', type: 'text', label: 'Reference number of the grievance', placeholder: 'e.g. 7K3-9B2', required: true, width: 'half' },
        { name: 'filed_on', type: 'date', label: 'Date originally filed', width: 'half' },
        { name: 'severity', type: 'select', label: 'Severity band claimed', options: ['Trivial', 'Moderate', 'Grave', 'Total'], required: true },
        { name: 'why', type: 'textarea', label: 'Justify the band selected, in the third person.', rows: 4 },
      ],
      note: 'Bands may be revised downwards only.',
    },
    {
      title: 'Certification',
      seal: true,
      fields: [
        { name: 'signature', type: 'signature', label: 'Signature', placeholder: 'Sign here', required: true },
        { name: 'notary', type: 'signature', label: 'Notary', placeholder: 'On sabbatical', disabled: true },
      ],
    },
  ],
  officeUse: [
    { label: 'BAND ASSIGNED', value: 'Pending' },
    { label: 'ROUTED TO', value: 'Cabinet 7' },
    { label: 'REVIEW', value: '47 – ∞ business days' },
  ],
  finePrint: 'Issuance of a certificate does not imply the grievance is valid, only that it has been measured.',
  submitLabel: 'CERTIFY',
  receipt: {
    stamp: 'CERTIFIED',
    message: 'Severity recorded against **{{code}}**, reference **{{ref}}**.',
    footnotes: ['Note: The band assigned supersedes the band claimed.'],
    next: { mode: 'form', formId: 'gc-1', label: 'Return to Form GC-1 →' },
  },
};

const BANK_TEMPLATE = {
  kind: 'bank',
  id: 'my-bank',
  name: 'My Question Bank',
  description: 'Pages are assembled from these pools. Slots in {{double braces}} expand from "slots".',
  page: { minSections: 3, maxSections: 4, minQuestionsPerSection: 2, maxQuestionsPerSection: 4, maxLongAnswers: 1 },
  slots: { thing: ['a shipyard', 'a refinery', 'an ore barge'] },
  titles: ['Supplementary Particulars'],
  subtitles: ['Filed in perpetuity.'],
  sectionTitles: ['Particulars', 'Further Particulars', 'Closing Declarations'],
  sectionNotes: ['Answers here are not read.'],
  questions: [
    { type: 'text', label: 'Name of the declaring party' },
    { type: 'text', label: 'Designation of {{thing}} concerned' },
    { type: 'radio', label: 'Is this your first filing?', options: ['Yes', 'No', 'Unclear'] },
    { type: 'textarea', label: 'Describe the matter in no fewer than 500 words.', minWords: 500, rows: 5 },
    { type: 'checkbox', label: 'I certify the foregoing is true.' },
  ],
  officeUse: [{ label: 'STATUS', value: 'Pending' }],
  finePrint: 'Submission creates no obligation.',
  submitLabels: ['SUBMIT FOR REVIEW'],
  stamps: ['RECEIVED'],
  receiptMessages: ['Filed as **{{code}}**, reference **{{ref}}**. Continue with **Form {{next}}**.'],
  receiptFootnotes: ['Note: This sheet supersedes nothing.'],
  nextLabels: ['Open Form {{next}} →'],
};

$('tplFormBtn').addEventListener('click', () =>
  download('form-template.json', JSON.stringify(FORM_TEMPLATE, null, 2), 'application/json'));
$('tplBankBtn').addEventListener('click', () =>
  download('bank-template.json', JSON.stringify(BANK_TEMPLATE, null, 2), 'application/json'));

/* ---------- boot ---------- */

document.getElementById('loginOrg')
  .insertAdjacentHTML('afterbegin', orgMarkSVG(deriveTheme({ id: 'registry-login' })));
document.getElementById('adminOrg')
  .insertAdjacentHTML('afterbegin', orgMarkSVG(deriveTheme({ id: 'registry' })));

try {
  const saved = sessionStorage.getItem(TOKEN_KEY);
  if (saved) {
    token = saved;
    api('ping').then(unlock).catch(() => lock(''));
  }
} catch { /* storage blocked - just show the login form */ }

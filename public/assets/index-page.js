/* ============================================================
   index-page.js - renders the schedule of currently filed forms.
   ============================================================ */

import { deriveTheme, applyTheme, orgMarkSVG } from './theme.js';
import { escapeHTML, mdInline } from './render.js';

const listEl = document.getElementById('list');
const sheet = document.getElementById('sheet');
const countEl = document.getElementById('formCount');

// The index gets a procedural template too, from a fixed seed so it is stable.
const theme = deriveTheme({ id: 'schedule-a', style: { watermark: 'RETAIN' } });
applyTheme(theme, sheet);
document.getElementById('org').insertAdjacentHTML('afterbegin', orgMarkSVG(theme));

function row(form) {
  const a = document.createElement('a');
  a.className = 'index-row';
  a.href = '/form.html?f=' + encodeURIComponent(form.id);

  a.appendChild(Object.assign(document.createElement('div'), {
    className: 'index-code',
    textContent: form.code,
  }));

  const mid = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'index-title';
  title.textContent = form.title;
  mid.appendChild(title);
  if (form.indexBlurb) {
    const blurb = document.createElement('div');
    blurb.className = 'index-blurb';
    blurb.innerHTML = mdInline(form.indexBlurb);
    mid.appendChild(blurb);
  }
  a.appendChild(mid);

  const chip = document.createElement('div');
  chip.className = 'index-chip';
  chip.textContent = form.chip || 'REQUIRED';
  a.appendChild(chip);

  return a;
}

async function load() {
  let forms;
  try {
    const res = await fetch('/api/forms', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    forms = (await res.json()).forms || [];
  } catch (err) {
    listEl.innerHTML = '<p class="empty-note">The cabinet will not open. ' +
      escapeHTML(err && err.message ? err.message : '') + '</p>';
    countEl.textContent = '— FORMS ON FILE';
    return;
  }

  countEl.textContent = forms.length + ' FORM' + (forms.length === 1 ? '' : 'S') + ' ON FILE';

  if (!forms.length) {
    listEl.innerHTML = '<p class="empty-note">No forms are currently on file. ' +
      'This does not mean nothing is required of you.</p>';
    return;
  }

  listEl.innerHTML = '';
  forms.forEach((f) => listEl.appendChild(row(f)));
}

load();

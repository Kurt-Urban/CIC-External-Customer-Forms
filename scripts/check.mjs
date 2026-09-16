#!/usr/bin/env node
/* ============================================================
   check.mjs - end-to-end smoke test against a running dev server.
   Usage: node scripts/dev-server.mjs   (in one terminal)
          node scripts/check.mjs        (in another)
   ============================================================ */

const BASE = process.env.BASE || 'http://localhost:8787';
const PASSWORD = process.env.ADMIN_PASSWORD || 'local-dev-password';

let passed = 0;
let failed = 0;

function ok(name, detail) {
  passed++;
  process.stdout.write('  PASS  ' + name + (detail ? '  (' + detail + ')' : '') + '\n');
}
function bad(name, detail) {
  failed++;
  process.stdout.write('  FAIL  ' + name + (detail ? '  — ' + detail : '') + '\n');
}
function check(name, cond, detail) {
  if (cond) ok(name, detail); else bad(name, detail);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(url) {
  const res = await fetch(BASE + url);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function jpost(url, body, headers = {}) {
  const res = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** Fill every field on a page with something plausible. */
function answerAll(form) {
  const answers = {};
  for (const sec of form.sections) {
    for (const f of sec.fields) {
      if (f.type === 'static' || f.disabled) continue;
      switch (f.type) {
        case 'checkbox': answers[f.name] = true; break;
        case 'checkboxes': answers[f.name] = f.options.slice(0, 2).map((o) => o.value || o); break;
        case 'radio':
        case 'select': answers[f.name] = (f.options[0].value != null ? f.options[0].value : f.options[0]); break;
        case 'number': answers[f.name] = 7; break;
        case 'date': answers[f.name] = '2026-09-11'; break;
        case 'textarea': answers[f.name] = 'UNKNOWN does not negotiate. UNKNOWN files.'; break;
        default: answers[f.name] = 'Faction UNKNOWN';
      }
    }
  }
  return answers;
}

process.stdout.write('\nCIC paperwork — checks against ' + BASE + '\n\n');

/* ---------- public index ---------- */
{
  const { status, body } = await jget('/api/forms');
  check('index lists forms', status === 200 && Array.isArray(body.forms) && body.forms.length >= 2,
    (body.forms || []).length + ' forms');
  check('generated form advertised as such',
    (body.forms || []).some((f) => f.id === 'gc-1' && f.mode === 'generated'));
}

/* ---------- determinism ---------- */
{
  const a = await jget('/api/forms?id=gc-1&seed=fixed&page=0');
  const b = await jget('/api/forms?id=gc-1&seed=fixed&page=0');
  check('same seed + page gives the same page',
    JSON.stringify(a.body.form) === JSON.stringify(b.body.form));

  const c = await jget('/api/forms?id=gc-1&seed=fixed&page=1');
  check('next page differs', JSON.stringify(a.body.form) !== JSON.stringify(c.body.form));

  const d = await jget('/api/forms?id=gc-1&seed=other&page=0');
  check('different seed differs', JSON.stringify(a.body.form) !== JSON.stringify(d.body.form));

  const fieldCount = a.body.form.sections.reduce((n, s) => n + s.fields.length, 0);
  check('page is about one page long', fieldCount >= 6 && fieldCount <= 18, fieldCount + ' fields');

  const longs = a.body.form.sections
    .reduce((n, s) => n + s.fields.filter((f) => f.type === 'textarea').length, 0);
  check('at most one long-answer box per page', longs <= 1, longs + ' textareas');

  const names = a.body.form.sections.flatMap((s) => s.fields.map((f) => f.name)).filter(Boolean);
  check('field names are unique', new Set(names).size === names.length);

  check('page carries a registry stamp', typeof a.body.pageToken === 'string' && a.body.pageToken.length > 40);
}

/* ---------- procedural styling ---------- */
{
  const seen = new Set();
  for (let p = 0; p < 8; p++) {
    const { body } = await jget('/api/forms?id=gc-1&seed=styling&page=' + p);
    seen.add(body.form.style.seed);
  }
  check('each page gets its own template seed', seen.size === 8, seen.size + ' distinct');
}

/* ---------- spam protection ---------- */
{
  const { body } = await jget('/api/forms?id=gc-1&seed=spam&page=0');

  const noToken = await jpost('/api/submit', { formId: 'gc-1', answers: {} });
  check('submission without a stamp is refused', noToken.status === 400, noToken.body.error);

  const forged = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: 'aaaa.bbbb', answers: {},
  });
  check('forged stamp is refused', forged.status === 400, forged.body.error);

  const tooFast = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: body.pageToken, answers: answerAll(body.form),
  });
  check('instant submission is refused', tooFast.status === 400, tooFast.body.error);

  const hp = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: body.pageToken, answers: {}, _hp: 'bot@example.com',
  });
  check('honeypot returns a fake success', hp.status === 200 && hp.body.ok);
}

/* ---------- filing a real sheet ---------- */
let firstRef = null;
{
  const { body } = await jget('/api/forms?id=gc-1&seed=real&page=0');
  await sleep(2700);

  const blank = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: body.pageToken, answers: {},
  });
  check('a wholly blank sheet is refused', blank.status === 422, blank.body.error);

  const res = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: body.pageToken, answers: answerAll(body.form),
  });
  check('a completed sheet is filed', res.status === 200 && res.body.ok, 'ref ' + res.body.ref);
  firstRef = res.body.ref;

  const replay = await jpost('/api/submit', {
    formId: 'gc-1', pageToken: body.pageToken, answers: answerAll(body.form),
  });
  check('an identical resubmission is refused', replay.status === 409, replay.body.error);
}

/* ---------- static form ---------- */
{
  const { body } = await jget('/api/forms?id=gc-2');
  check('static form loads', body.mode === 'static' && body.form.sections.length === 4);
  await sleep(2700);

  const missing = await jpost('/api/submit', {
    formId: 'gc-2', pageToken: body.pageToken, answers: {},
  });
  check('required fields are enforced on the static form', missing.status === 422,
    (missing.body.error || '').slice(0, 60) + '…');

  const good = await jpost('/api/submit', {
    formId: 'gc-2', pageToken: body.pageToken, answers: answerAll(body.form),
  });
  check('static form files', good.status === 200 && good.body.ok, 'ref ' + good.body.ref);
}

/* ---------- admin ---------- */
{
  const bad1 = await jpost('/api/admin', { action: 'login', password: 'wrong' });
  check('wrong password is rejected', bad1.status === 401);

  const noAuth = await jpost('/api/admin', { action: 'list_submissions' });
  check('admin actions need a token', noAuth.status === 401);

  const login = await jpost('/api/admin', { action: 'login', password: PASSWORD });
  check('correct password issues a token', login.status === 200 && !!login.body.token);

  const auth = { authorization: 'Bearer ' + login.body.token };

  const tampered = await jpost('/api/admin', { action: 'stats' },
    { authorization: 'Bearer ' + login.body.token.slice(0, -4) + 'aaaa' });
  check('tampered token is rejected', tampered.status === 401);

  const list = await jpost('/api/admin', { action: 'list_submissions', limit: 10 }, auth);
  check('submissions are listed', list.status === 200 && list.body.total >= 2,
    list.body.total + ' on file');

  const found = (list.body.submissions || []).find((s) => s.ref === firstRef);
  check('the sheet we filed is there', !!found);
  check('questions were stored with the answers',
    !!found && found.entries.length > 0 && found.entries.every((e) => e.question && 'answer' in e),
    found ? found.entries.length + ' q/a pairs' : '');

  const filtered = await jpost('/api/admin', { action: 'list_submissions', formId: 'gc-2' }, auth);
  check('filtering by form works',
    filtered.status === 200 && filtered.body.submissions.every((s) => s.formId === 'gc-2'));

  const reg = await jpost('/api/admin', { action: 'list_forms' }, auth);
  check('registry lists forms and banks',
    reg.status === 200 && reg.body.forms.length >= 2 && reg.body.banks.length >= 1,
    reg.body.banks[0] ? reg.body.banks[0].questions + ' questions in bank' : '');

  const csvRes = await fetch(BASE + '/api/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ action: 'export', format: 'csv' }),
  });
  const csv = await csvRes.text();
  check('CSV export works', csvRes.ok && csv.split('\r\n').length > 2,
    csv.split('\r\n').length - 1 + ' rows');

  /* uploading a new form with no code change */
  const newForm = {
    id: 'gc-test', code: 'GC-TEST', title: 'Uploaded Test Form', order: 900,
    sections: [{ title: 'Only Section', fields: [{ name: 'q1', type: 'text', label: 'Anything at all' }] }],
  };
  const save = await jpost('/api/admin', { action: 'save_document', document: newForm }, auth);
  check('a dropped-in form is accepted', save.status === 200 && save.body.ok);

  const after = await jget('/api/forms');
  check('it appears on the public index immediately',
    after.body.forms.some((f) => f.id === 'gc-test'));

  const rubbish = await jpost('/api/admin', {
    action: 'save_document', document: { id: 'Bad Id!', sections: [] },
  }, auth);
  check('an invalid form is rejected with reasons',
    rubbish.status === 422 && Array.isArray(rubbish.body.errors) && rubbish.body.errors.length > 0,
    (rubbish.body.errors || [])[0]);

  await jpost('/api/admin', { action: 'delete_document', id: 'gc-test', kind: 'form' }, auth);
  const cleaned = await jget('/api/forms');
  check('deleting it removes it from the index',
    !cleaned.body.forms.some((f) => f.id === 'gc-test'));
}

process.stdout.write('\n  ' + passed + ' passed, ' + failed + ' failed\n\n');
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/* ============================================================
   check.mjs - run before pushing.  npm run check

   1. Validates forms/gc-1.json and forms/bank.json.
   2. Looks for wordings so alike they would read as repeats.
   3. Plays out long visitor sessions and checks that no question
      is ever shown twice, that topics do come back reworded, and
      that every sheet is a sane length.
   No server, no browser.
   ============================================================ */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateForm, validateBank, normalizeForm, bankReach } from '../assets/schema.js';
import { generatePage, formTexts, normText } from '../assets/generator.js';
import { deriveTheme, themeSummary, AXES } from '../assets/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SESSIONS = Number(process.env.SESSIONS) || 6;
const SHEETS = Number(process.env.SHEETS) || 60;

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) passed++; else failed++;
  process.stdout.write('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name +
    (detail ? (cond ? '  (' : '  — ') + detail + (cond ? ')' : '') : '') + '\n');
}
function list(items, max = 12) {
  items.slice(0, max).forEach((i) => process.stdout.write('          · ' + i + '\n'));
  if (items.length > max) process.stdout.write('          · …and ' + (items.length - max) + ' more\n');
}

async function readJSON(rel) {
  const text = await readFile(path.join(ROOT, rel), 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    check(rel + ' is valid JSON', false, err.message);
    process.exit(1);
  }
}

process.stdout.write('\nCIC paperwork — checks\n\n');

/* ---------- GC-1 ---------- */

const gc1 = await readJSON('forms/gc-1.json');
const v1 = validateForm(gc1);
check('forms/gc-1.json is a valid form', v1.ok, v1.ok ? '' : v1.errors.length + ' error(s)');
if (!v1.ok) list(v1.errors);
if (v1.warnings.length) list(v1.warnings.map((w) => 'warning: ' + w));

const n1 = normalizeForm(gc1);
const gcFields = n1.sections.flatMap((s) => s.fields).filter((f) => f.type !== 'static');
check('GC-1 has fields', gcFields.length > 0,
  n1.sections.length + ' sections, ' + gcFields.length + ' fields, ' +
  gcFields.filter((f) => f.required).length + ' required');

const optionalOnGc1 = gcFields.filter((f) => !f.disabled && !f.required).map((f) => f.name);
check('every GC-1 field must be filled before it saves', optionalOnGc1.length === 0,
  optionalOnGc1.length ? 'optional: ' + optionalOnGc1.join(', ')
    : gcFields.filter((f) => f.disabled).length + ' greyed-out field(s) exempt');

const pinned = Object.keys(AXES).every((k) => Object.prototype.hasOwnProperty.call(n1.style, k));
check('GC-1 look is fully pinned (same every time)', pinned,
  themeSummary(deriveTheme(n1)).map(([k, v]) => k + '=' + v).join(' '));
check('GC-1 leads into random sheets', n1.receipt.next.mode === 'generate');

/* ---------- bank ---------- */

const bank = await readJSON('forms/bank.json');
const vb = validateBank(bank);
check('forms/bank.json is a valid bank', vb.ok, vb.ok ? '' : vb.errors.length + ' error(s)');
if (!vb.ok) { list(vb.errors); process.exit(1); }
if (vb.warnings.length) list(vb.warnings.map((w) => 'warning: ' + w));

const reach = bankReach(bank);
check('bank asks each thing many ways', reach.phrasings >= 300 && reach.phrasings / reach.topics >= 5,
  reach.topics + ' topics, ' + reach.phrasings + ' wordings (' +
  (reach.phrasings / reach.topics).toFixed(1) + ' per topic)');

/* ---------- near-duplicate wordings ---------- */

// Two wordings whose word pairs mostly overlap would read as the same
// question twice. Compare every bank wording with every other, and with GC-1.
// Within one topic the bar is higher: deliberate contrasts such as
// "in order of importance" / "in reverse order of importance" belong there.
const CROSS_TOPIC = 0.7;
const SAME_TOPIC = 0.8;
function bigrams(s) {
  const w = normText(s.replace(/\{\{\w+\}\}/g, 'x')).split(' ');
  const out = new Set();
  for (let i = 0; i < w.length - 1; i++) out.add(w[i] + ' ' + w[i + 1]);
  if (w.length === 1) out.add(w[0]);
  return out;
}
function similarity(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

const wordings = [];
for (const f of gcFields) if (f.label) wordings.push({ where: 'GC-1', text: f.label });
for (const t of bank.topics) {
  t.phrasings.forEach((p) => wordings.push({ where: t.id, text: typeof p === 'string' ? p : p.label }));
}
const grams = wordings.map((w) => bigrams(w.text));
const alike = [];
for (let i = 0; i < wordings.length; i++) {
  for (let j = i + 1; j < wordings.length; j++) {
    const bar = wordings[i].where === wordings[j].where ? SAME_TOPIC : CROSS_TOPIC;
    if (similarity(grams[i], grams[j]) >= bar) {
      alike.push(wordings[i].where + ' “' + wordings[i].text + '”  ≈  ' +
        wordings[j].where + ' “' + wordings[j].text + '”');
    }
  }
}
check('no two wordings are near-copies of each other', alike.length === 0,
  alike.length ? alike.length + ' pair(s)' : wordings.length + ' wordings compared');
if (alike.length) list(alike);

/* ---------- visitor sessions ---------- */

// Same base the page uses (assets/app.js drawSheet).
const base = {
  id: n1.id, code: n1.code, org: n1.org, department: n1.department, title: n1.title,
  enforceRequired: true, requireAll: n1.requireAll,
};
const seed = () => Math.random().toString(16).slice(2, 18);

let repeats = [];
let minF = Infinity;
let maxF = 0;
let overLong = 0;
let dupNames = 0;
let leftovers = [];
let sheetsWithEcho = 0;
let firstRestated = [];
let topicReturns = 0;
let totalSheets = 0;
let optionalOnSheets = 0;
let exemptOnSheets = 0;
const looks = new Set();

for (let s = 0; s < SESSIONS; s++) {
  let used = { phrasings: [], texts: formTexts(n1), interjections: [] };
  const shown = new Map(used.texts.map((t) => [t, 'GC-1']));
  const topicSeen = new Set();
  let restatedAt = null;

  for (let step = 1; step <= SHEETS; step++) {
    const page = generatePage(bank, base, seed(), step, used);
    totalSheets++;
    const fields = page.sections.flatMap((x) => x.fields);
    const inputs = fields.filter((f) => f.type !== 'static');

    for (const f of inputs) {
      const key = normText(f.label);
      if (shown.has(key)) repeats.push('session ' + (s + 1) + ', sheet ' + step + ': “' + f.label + '” (first on ' + shown.get(key) + ')');
      shown.set(key, 'sheet ' + step);
      if (topicSeen.has(f.topic)) topicReturns++;
    }
    const normalised = normalizeForm(page).sections.flatMap((x) => x.fields)
      .filter((f) => f.type !== 'static');
    optionalOnSheets += normalised.filter((f) => !f.disabled && !f.required).length;
    exemptOnSheets += normalised.filter((f) => f.disabled).length;

    const topicsHere = inputs.map((f) => f.topic);
    if (new Set(topicsHere).size < topicsHere.length) sheetsWithEcho++;
    topicsHere.forEach((t) => topicSeen.add(t));

    if (restatedAt === null && page.usage.phrasings.length < inputs.length) restatedAt = step;

    minF = Math.min(minF, fields.length);
    maxF = Math.max(maxF, fields.length);
    if (inputs.filter((f) => f.type === 'textarea').length > 1) overLong++;
    if (new Set(inputs.map((f) => f.name)).size !== inputs.length) dupNames++;

    const visible = JSON.stringify([page.title, page.subtitle, page.department, page.instructions,
      page.finePrint, page.transmittal, page.submitLabel, page.meta, page.officeUse,
      page.sections.map((x) => [x.title, x.note, x.fields])]);
    const m = visible.match(/\{\{\w+\}\}/g);
    if (m) leftovers = leftovers.concat(m);

    const t = deriveTheme(page);
    looks.add([t.stock, t.ink, t.head, t.edge, t.rule, t.fields].join('/'));

    used = {
      phrasings: used.phrasings.concat(page.usage.phrasings),
      texts: used.texts.concat(page.usage.texts),
      interjections: used.interjections.concat(page.usage.interjections),
    };
  }
  firstRestated.push(restatedAt === null ? '>' + SHEETS : restatedAt);
}

check(SESSIONS + ' visitors × ' + SHEETS + ' sheets: no question is ever shown twice', repeats.length === 0,
  repeats.length ? repeats.length + ' repeat(s)' : totalSheets + ' sheets');
if (repeats.length) list(repeats);

const lastsAtLeast = Math.min(...firstRestated.map((x) => (typeof x === 'number' ? x : Infinity)));
check('fresh wordings last a long session before any are restated', lastsAtLeast >= 30,
  'first restatement at sheet ' + firstRestated.join(', '));

check('topics come back, reworded', topicReturns > totalSheets * 5,
  (topicReturns / totalSheets).toFixed(1) + ' returning topics per sheet');
check('most sheets ask something twice, differently', sheetsWithEcho >= totalSheets * 0.75,
  Math.round(100 * sheetsWithEcho / totalSheets) + '% of sheets');
check('every field on every random sheet must be filled before it saves', optionalOnSheets === 0,
  optionalOnSheets ? optionalOnSheets + ' optional field(s)'
    : exemptOnSheets + ' greyed-out field(s) exempt across ' + totalSheets + ' sheets');
check('sheets are about one page each', minF >= 6 && maxF <= 18, minF + '–' + maxF + ' items');
check('never more than one long-answer box per sheet', overLong === 0, overLong ? overLong + ' sheets' : '');
check('field names are unique on every sheet', dupNames === 0, dupNames ? dupNames + ' sheets' : '');
check('every {{slot}} shown is filled in', leftovers.length === 0,
  leftovers.length ? [...new Set(leftovers)].join(' ') : '');
check('sheets vary in appearance', looks.size > totalSheets * 0.75, looks.size + ' looks in ' + totalSheets);

const used0 = { phrasings: ['party-name#0'], texts: ['x'], interjections: [] };
check('the same seed and history reproduce the same sheet',
  JSON.stringify(generatePage(bank, base, 'fixed', 3, used0)) ===
  JSON.stringify(generatePage(bank, base, 'fixed', 3, used0)));

process.stdout.write('\n  ' + passed + ' passed, ' + failed + ' failed\n\n');
process.exit(failed ? 1 : 0);

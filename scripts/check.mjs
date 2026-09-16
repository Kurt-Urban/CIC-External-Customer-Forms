#!/usr/bin/env node
/* ============================================================
   check.mjs - run before pushing.  npm run check

   Validates forms/gc-1.json and forms/bank.json, then generates
   a few hundred random sheets and checks each one is sane.
   No server, no browser.
   ============================================================ */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateForm, validateBank, normalizeForm, bankReach } from '../assets/schema.js';
import { generatePage } from '../assets/generator.js';
import { deriveTheme, themeSummary, AXES } from '../assets/theme.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = Number(process.env.SHEETS) || 300;

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) passed++; else failed++;
  process.stdout.write('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name +
    (detail ? (cond ? '  (' : '  — ') + detail + (cond ? ')' : '') : '') + '\n');
}
function list(items) {
  for (const i of items) process.stdout.write('          · ' + i + '\n');
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
const fields = n1.sections.flatMap((s) => s.fields);
const required = fields.filter((f) => f.required).map((f) => f.name);
check('GC-1 has fields', fields.length > 0,
  n1.sections.length + ' sections, ' + fields.filter((f) => f.type !== 'static').length +
  ' fields, required: ' + (required.join(', ') || 'none'));

const t1 = deriveTheme(n1);
const pinned = Object.keys(AXES).filter((k) => k !== 'watermark')
  .every((k) => Object.prototype.hasOwnProperty.call(n1.style, k));
check('GC-1 look is fully pinned (same every time)', pinned,
  themeSummary(t1).map(([k, v]) => k + '=' + v).join(' '));
check('GC-1 ends by generating a random sheet', n1.receipt.next.mode === 'generate');

/* ---------- bank ---------- */

const bank = await readJSON('forms/bank.json');
const vb = validateBank(bank);
check('forms/bank.json is a valid bank', vb.ok, vb.ok ? '' : vb.errors.length + ' error(s)');
if (!vb.ok) list(vb.errors);
if (vb.warnings.length) list(vb.warnings.map((w) => 'warning: ' + w));

const reach = bankReach(bank);
check('bank has a large pool', reach.questions >= 50,
  reach.questions + ' questions, ~' + reach.slotCombinations.toExponential(1) + ' slot combinations');

/* ---------- generated sheets ---------- */

const base = { id: n1.id, code: n1.code, org: n1.org, department: n1.department, title: n1.title, enforceRequired: false };
const seed = () => Math.random().toString(16).slice(2, 18);

let minF = Infinity;
let maxF = 0;
let tooManyLong = 0;
let dupNames = 0;
let leftovers = [];
let empty = 0;
const titles = new Set();
const looks = new Set();

for (let i = 0; i < SHEETS; i++) {
  const step = 1 + (i % 30);
  const page = generatePage(bank, base, seed(), step);
  const pf = page.sections.flatMap((s) => s.fields);
  const inputs = pf.filter((f) => f.type !== 'static');

  minF = Math.min(minF, pf.length);
  maxF = Math.max(maxF, pf.length);
  if (pf.filter((f) => f.type === 'textarea').length > 1) tooManyLong++;
  if (new Set(inputs.map((f) => f.name)).size !== inputs.length) dupNames++;
  if (!inputs.length) empty++;

  // Everything shown on the sheet should have had its slots filled.
  const shown = JSON.stringify([page.title, page.subtitle, page.department, page.instructions,
    page.finePrint, page.transmittal, page.submitLabel, page.meta, page.officeUse,
    page.sections.map((s) => [s.title, s.note, s.fields])]);
  const m = shown.match(/\{\{\w+\}\}/g);
  if (m) leftovers = leftovers.concat(m);

  titles.add(page.title);
  const t = deriveTheme(page);
  looks.add([t.stock, t.ink, t.head, t.edge, t.rule, t.fields].join('/'));

  if (step === 1 && i === 0) {
    check('first random sheet is coded ' + n1.code + 'a', page.code === n1.code + 'a', page.code);
  }
}

check(SHEETS + ' random sheets are about one page each', minF >= 5 && maxF <= 18,
  minF + '–' + maxF + ' fields');
check('never more than one long-answer box per sheet', tooManyLong === 0,
  tooManyLong ? tooManyLong + ' sheets over' : '');
check('field names are unique on every sheet', dupNames === 0, dupNames ? dupNames + ' sheets' : '');
check('no sheet is empty', empty === 0, empty ? empty + ' empty' : '');
check('every {{slot}} on the sheet is filled in', leftovers.length === 0,
  leftovers.length ? [...new Set(leftovers)].join(' ') : '');
check('sheets vary in title', titles.size > 20, titles.size + ' distinct titles');
check('sheets vary in appearance', looks.size > SHEETS * 0.8, looks.size + ' distinct looks in ' + SHEETS);

const sameA = JSON.stringify(generatePage(bank, base, 'fixed', 3));
const sameB = JSON.stringify(generatePage(bank, base, 'fixed', 3));
check('a remembered seed reproduces its sheet (reloads are stable)', sameA === sameB);

process.stdout.write('\n  ' + passed + ' passed, ' + failed + ' failed\n\n');
process.exit(failed ? 1 : 0);

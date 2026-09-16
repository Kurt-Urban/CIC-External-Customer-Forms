/* ============================================================
   theme.js - procedural stationery generator.

   Given a form definition, derives a complete document template
   by picking one component from each design axis. The pick is
   deterministic: the same form id always yields the same
   template, so a form does not change appearance between loads.

   Anything picked here can be overridden per-form via
   form.style, e.g. { "stock": "mimeo", "watermark": "CARBON" }.
   ============================================================ */

/* ---------- deterministic RNG ---------- */

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- component pools ---------- */

export const AXES = {
  stock:     ['cream', 'buff', 'goldenrod', 'carbon-pink', 'ledger', 'mimeo', 'onionskin'],
  ink:       ['red', 'violet', 'navy', 'green', 'oxblood', 'slate'],
  display:   ['elite', 'courier', 'cutive', 'smallcap'],
  body:      ['plex', 'garamond', 'baskerv'],
  edge:      ['perforated', 'punched', 'tractor', 'notched', 'plain'],
  head:      ['split', 'stacked', 'boxed', 'ruled', 'stamped'],
  rule:      ['hair', 'double', 'dotted', 'heavy', 'tinted'],
  fields:    ['plain', 'underline', 'comb', 'inset', 'boxed'],
  labels:    ['plain', 'caps', 'italic'],
  checks:    ['plain', 'boxed', 'ruled'],
  office:    ['grid', 'inline', 'shaded', 'ticket'],
  numbering: ['section', 'sign', 'part', 'article', 'plain', 'none'],
  watermark: [null, null, null, 'FILE COPY', 'DUPLICATE', 'TRIPLICATE', 'DO NOT REMOVE', 'CARBON', 'PENDING', 'RETAIN'],
};

/* Inks that read well on each stock. Keeps the procedural output
   inside the aged-paper register instead of producing clown documents. */
const INK_BY_STOCK = {
  'cream':       ['red', 'oxblood', 'slate', 'green'],
  'buff':        ['red', 'oxblood', 'navy', 'slate'],
  'goldenrod':   ['oxblood', 'red', 'slate', 'green'],
  'carbon-pink': ['oxblood', 'red', 'violet', 'slate'],
  'ledger':      ['green', 'slate', 'navy', 'oxblood'],
  'mimeo':       ['violet', 'navy', 'slate', 'green'],
  'onionskin':   ['slate', 'navy', 'red', 'violet'],
};

const MOTTOES = [
  'PROFIT ABOVE ALL · NEUTRAL BY POLICY ·',
  'OMNIS QUESTUS NULLUS SANGUIS · EST. UNRECORDED ·',
  'WE DO NOT FIGHT · WE INVOICE ·',
  'FILED IN PERPETUITY · REVIEWED AT LEISURE ·',
  'EVERY GRIEVANCE A LINE ITEM ·',
];

/* ---------- derivation ---------- */

/**
 * Derive the full template for a form.
 * @param {object} form  form definition
 * @returns {object} theme
 */
export function deriveTheme(form) {
  const style = (form && form.style) || {};
  const seed = String(style.seed || form.id || form.code || 'cic');
  const rnd = mulberry32(hash32(seed));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // Order of these calls is part of the seed contract - do not reorder,
  // or every existing form's appearance shifts.
  const stock     = pick(AXES.stock);
  const ink       = pick(INK_BY_STOCK[stock] || AXES.ink);
  const display   = pick(AXES.display);
  const body      = pick(AXES.body);
  const edge      = pick(AXES.edge);
  const head      = pick(AXES.head);
  const rule      = pick(AXES.rule);
  const fields    = pick(AXES.fields);
  const labels    = pick(AXES.labels);
  const checks    = pick(AXES.checks);
  const office    = pick(AXES.office);
  const numbering = pick(AXES.numbering);
  const watermark = pick(AXES.watermark);
  const motto     = pick(MOTTOES);
  const tilt      = (rnd() * 1.6 - 0.8).toFixed(2);

  const derived = {
    stock, ink, display, body, edge, head, rule,
    fields, labels, checks, office, numbering, watermark, motto, tilt,
  };

  // Explicit style overrides win over anything procedural.
  for (const key of Object.keys(derived)) {
    if (Object.prototype.hasOwnProperty.call(style, key) && style[key] !== undefined) {
      derived[key] = style[key];
    }
  }
  // "watermark": false / "" in JSON means "no watermark"
  if (!derived.watermark) derived.watermark = null;

  return derived;
}

/**
 * Apply a theme to a sheet element (and its letterhead).
 */
export function applyTheme(theme, sheetEl) {
  const classes = [
    'sheet',
    'stock-' + theme.stock,
    'ink-' + theme.ink,
    'disp-' + theme.display,
    'body-' + theme.body,
    'edge-' + theme.edge,
    'rule-' + theme.rule,
    'labels-' + theme.labels,
    'checks-' + theme.checks,
    'office-' + theme.office,
  ];
  if (theme.fields !== 'plain') classes.push('fields-' + theme.fields);
  sheetEl.className = classes.join(' ');

  if (theme.watermark) sheetEl.setAttribute('data-watermark', theme.watermark);
  else sheetEl.removeAttribute('data-watermark');

  const head = sheetEl.querySelector('header.letterhead');
  if (head) head.className = 'letterhead head-' + theme.head;
}

/* ---------- section numbering ---------- */

const ROMAN = [
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

export function roman(n) {
  let out = '';
  let v = n;
  for (const [val, sym] of ROMAN) {
    while (v >= val) { out += sym; v -= val; }
  }
  return out || String(n);
}

/**
 * Format a section heading for the given numbering scheme.
 * @param {string} scheme
 * @param {number} i     1-based section index
 * @param {string} title bare section title
 */
export function sectionHeading(scheme, i, title) {
  const t = title || '';
  switch (scheme) {
    case 'sign':    return '§ ' + i + '.' + (t ? '  ' + t : '');
    case 'part':    return 'Part ' + roman(i) + (t ? ' — ' + t : '');
    case 'article': return 'Article ' + i + '.' + (t ? '  ' + t : '');
    case 'plain':   return i + '.' + (t ? '  ' + t : '');
    case 'none':    return t;
    case 'section':
    default:        return 'Section ' + i + (t ? ' — ' + t : '');
  }
}

/* ---------- marks ---------- */

/**
 * The small CIC roundel used in the letterhead.
 * Varies with the theme so each form's letterhead reads differently.
 */
export function orgMarkSVG(theme) {
  const solid = theme.head === 'stacked' || theme.head === 'boxed';
  return `
<svg class="org-mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <circle cx="50" cy="50" r="46" fill="none" stroke="var(--ink)" stroke-width="2.5"/>
  <circle cx="50" cy="50" r="38" fill="none" stroke="var(--ink)" stroke-width="${solid ? 2 : 1}"/>
  <text x="50" y="40" text-anchor="middle" font-family="var(--font-display)" font-size="20" fill="var(--ink)">C</text>
  <text x="50" y="58" text-anchor="middle" font-family="var(--font-display)" font-size="20" fill="var(--ink)">I</text>
  <text x="50" y="76" text-anchor="middle" font-family="var(--font-display)" font-size="20" fill="var(--ink)">C</text>
</svg>`;
}

/**
 * The gold notary seal. The motto ring and centre glyph come from the theme,
 * so each form is sealed by a subtly different office.
 */
export function sealSVG(theme, centre) {
  const id = 'sealpath-' + Math.random().toString(36).slice(2, 8);
  const label = (centre || 'CIC').slice(0, 6);
  const size = label.length > 3 ? 8 : 11;
  return `
<svg class="seal" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <circle cx="50" cy="50" r="44" fill="none" stroke="var(--gold)" stroke-width="2"/>
  <circle cx="50" cy="50" r="36" fill="none" stroke="var(--gold)" stroke-width="1"/>
  <path id="${id}" d="M 50,50 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" fill="none"/>
  <text font-family="var(--font-display)" font-size="7.2" fill="var(--gold)" letter-spacing="1">
    <textPath href="#${id}" startOffset="2%">${escapeXML(theme.motto)}</textPath>
  </text>
  <text x="50" y="54" text-anchor="middle" font-family="var(--font-display)" font-size="${size}" fill="var(--gold)">${escapeXML(label)}</text>
</svg>`;
}

function escapeXML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* ---------- admin preview helper ---------- */

export function themeSummary(theme) {
  return [
    ['stock', theme.stock], ['ink', theme.ink], ['type', theme.display + '/' + theme.body],
    ['edge', theme.edge], ['head', theme.head], ['rules', theme.rule],
    ['fields', theme.fields], ['checks', theme.checks], ['office', theme.office],
    ['numbering', theme.numbering], ['watermark', theme.watermark || 'none'],
  ];
}

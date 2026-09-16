/* ============================================================
   pdf.js - turns the sheet on screen into the declarant's copy.

   The live form is never touched. html2canvas works on a cloned
   document; in that clone every input is replaced by the text that
   was typed into it, so the PDF reads like a filled-in paper form
   rather than a screenshot of a web page. A stamp and transmittal
   note are added, then the image is cut into US Letter pages at
   blank lines, with a folio line on each.

   Libraries are loaded on first use from cdnjs. If they cannot be
   loaded, the browser's own print dialog is offered instead.
   ============================================================ */

import { mdInline, escapeHTML } from './render.js';

const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

const PAGE_WIDTH_PT = 612; // US Letter
const loading = new Map();

function loadScript(src) {
  if (!loading.has(src)) {
    loading.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => {
        loading.delete(src);
        reject(new Error('Could not load ' + src.split('/').pop()));
      };
      document.head.appendChild(s);
    }));
  }
  return loading.get(src);
}

export async function ensureLibs() {
  await Promise.all(LIBS.map(loadScript));
  if (!window.html2canvas || !window.jspdf) throw new Error('PDF libraries did not initialise.');
}

/* ---------- snapshot the live values ---------- */

/**
 * cloneNode does not reliably carry the *current* value of a control,
 * so record every value up front and tag the controls to find them
 * again in the clone.
 */
function snapshotControls(sheet) {
  const values = [];
  sheet.querySelectorAll('input, textarea, select').forEach((c, i) => {
    c.setAttribute('data-snap', String(i));
    if (c.tagName === 'SELECT') {
      const opt = c.options[c.selectedIndex];
      values[i] = { kind: 'select', text: opt && opt.value !== '' ? opt.textContent : '' };
    } else if (c.type === 'checkbox' || c.type === 'radio') {
      values[i] = { kind: 'tick', checked: c.checked };
    } else {
      values[i] = {
        kind: c.tagName === 'TEXTAREA' ? 'long' : 'short',
        text: c.value,
        type: c.type,
        sig: c.classList.contains('sig'),
        disabled: c.disabled,
        placeholder: c.placeholder || '',
      };
    }
  });
  return values;
}

function clearSnapshotTags(sheet) {
  sheet.querySelectorAll('[data-snap]').forEach((c) => c.removeAttribute('data-snap'));
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

/* ---------- build the paper copy inside the clone ---------- */

function flatten(doc, values) {
  doc.querySelectorAll('[data-snap]').forEach((c) => {
    const v = values[Number(c.getAttribute('data-snap'))];
    if (!v) return;

    let rep;
    if (v.kind === 'tick') {
      rep = doc.createElement('span');
      rep.className = 'tickbox';
      rep.textContent = v.checked ? 'X' : '';
    } else if (v.kind === 'select') {
      rep = doc.createElement('div');
      rep.className = 'filled';
      rep.textContent = v.text || ' ';
    } else {
      rep = doc.createElement('div');
      rep.className = 'filled' + (v.kind === 'long' ? ' filled-long' : '') + (v.sig ? ' filled-sig' : '');
      if (v.text) {
        rep.textContent = v.type === 'date' ? formatDate(v.text) : v.text;
      } else if (v.disabled && v.placeholder) {
        rep.classList.add('filled-placeholder');
        rep.classList.remove('filled-sig');
        rep.textContent = v.placeholder;
      } else {
        rep.textContent = ' ';
      }
    }
    c.replaceWith(rep);
  });
}

/**
 * html2canvas draws inline SVG by serialising it to an image, which
 * loses page CSS. Bake the computed colours and fonts in first.
 */
function bakeSvg(doc) {
  const view = doc.defaultView;
  doc.querySelectorAll('svg, svg *').forEach((node) => {
    const cs = view.getComputedStyle(node);
    const style = node.getAttribute('style') || '';
    if (!style.includes('var(')) return;
    node.removeAttribute('style');
    if (node.tagName.toLowerCase() === 'text' || node.tagName.toLowerCase() === 'textpath') {
      node.setAttribute('fill', cs.fill);
      node.setAttribute('font-family', "'Courier New', Courier, monospace");
    } else {
      node.setAttribute('fill', cs.fill);
      node.setAttribute('stroke', cs.stroke);
    }
  });
}

function stamp(doc, sheet, info) {
  // The rubber stamp goes where the save button was, so it never covers text.
  const s = doc.createElement('div');
  s.className = 'pdf-stamp';
  s.innerHTML = escapeHTML(info.stampText) +
    '<small>REF ' + escapeHTML(info.ref) + ' · ' + escapeHTML(info.when) + '</small>';
  const slot = sheet.querySelector('.stamp-wrap');
  if (slot) slot.replaceWith(s);
  else sheet.appendChild(s);

  if (info.transmittal) {
    const t = doc.createElement('div');
    t.className = 'transmittal';
    t.innerHTML = mdInline(info.transmittal);
    const row = sheet.querySelector('.submit-row');
    if (row) row.after(t);
    else sheet.appendChild(t);
  }
}

const CAPTURE_SCALE = 2;
const CAPTURE_WIDTH = 1024;

function prepareClone(doc, values, info, layout) {
  doc.documentElement.classList.add('pdf-capture');
  const sheet = doc.getElementById('sheet');
  flatten(doc, values);
  bakeSvg(doc);
  stamp(doc, sheet, info);

  // Where each section starts in the finished copy, in canvas pixels -
  // pagination uses these to avoid stranding a heading at a page foot.
  const origin = sheet.getBoundingClientRect().top;
  layout.sectionTops = Array.from(
    sheet.querySelectorAll('section.block, .office-use-title, .submit-row'),
  ).map((n) => Math.round((n.getBoundingClientRect().top - origin) * CAPTURE_SCALE));
}

/* ---------- public API ---------- */

/**
 * Render the declarant's copy of a sheet.
 * @param {HTMLElement} sheet
 * @param {{ ref, when, stampText, transmittal }} info
 * @returns {Promise<{ canvas: HTMLCanvasElement, layout: { sectionTops: number[] } }>}
 */
export async function renderCopy(sheet, info) {
  await ensureLibs();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;

  const values = snapshotControls(sheet);
  const layout = { sectionTops: [] };
  // Punch holes and the corner notch show the desk behind the sheet. On
  // paper that should be white - and html2canvas copies pseudo-element
  // styles from the live page, so this has to be set here, not in the clone.
  sheet.style.setProperty('--hole', '#FFFFFF');
  try {
    const canvas = await window.html2canvas(sheet, {
      scale: CAPTURE_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF', // JPEG has no alpha; transparent would turn black
      // Lay the copy out at desktop width even on a phone, so every copy
      // is the same full-size document rather than a magnified phone layout.
      windowWidth: CAPTURE_WIDTH,
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (doc) => prepareClone(doc, values, info, layout),
    });
    return { canvas, layout };
  } finally {
    sheet.style.removeProperty('--hole');
    clearSnapshotTags(sheet);
  }
}

/* ---------- pagination ---------- */

const PAGE_HEIGHT_PT = 792;
const CONT_TOP_PT = 30;     // breathing room at the top of continuation pages
const FOOTER_PT = 28;       // reserved at the bottom of every page for the folio line
// Fraction of width ignored at each side: enough to skip punch holes and
// tractor feed, not so much that the side borders of boxes are skipped too.
const EDGE_IGNORE = 0.045;
// A cut needs this many blank canvas rows (7 CSS px at scale 2): the gap
// between two fields qualifies; the gap between a label and its box does not.
const MIN_GAP = 14;

function rowIsBlank(data, row, x0, x1) {
  let lo = 255;
  let hi = 0;
  for (let x = x0; x < x1; x += 2) {
    const i = row + x * 4;
    const v = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (hi - lo > 14) return false;
  }
  return true;
}

/**
 * Walk up from the ideal break looking for a band of blank paper, and
 * cut through the middle of it - so a page never ends halfway through
 * a line of text, a box, or between a label and its field.
 */
function findBreak(ctx, width, ideal, minRow) {
  const band = ideal - minRow;
  if (band <= 0) return ideal;
  const data = ctx.getImageData(0, minRow, width, band).data;
  const x0 = Math.floor(width * EDGE_IGNORE);
  const x1 = Math.ceil(width * (1 - EDGE_IGNORE));

  let run = 0;
  for (let y = band - 1; y >= 0; y--) {
    if (rowIsBlank(data, y * width * 4, x0, x1)) {
      run++;
      if (run >= MIN_GAP) return minRow + y + Math.floor(run / 2);
    } else {
      run = 0;
    }
  }
  return ideal;
}

// A cut closer than this below a section start would leave the heading
// (and little else) at the foot of the page. 110 CSS px at scale 2.
const ORPHAN_ZONE = 220;
const SECTION_GAP = 10; // cut this far above a section start, inside its top margin

function paginate(canvas, sectionTops) {
  const scale = canvas.width / PAGE_WIDTH_PT;       // canvas px per pt
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pages = [];
  let y = 0;

  while (y < canvas.height) {
    const top = pages.length === 0 ? 0 : CONT_TOP_PT;
    const room = Math.floor((PAGE_HEIGHT_PT - top - FOOTER_PT) * scale);
    if (canvas.height - y <= room) {
      pages.push({ y, h: canvas.height - y, top });
      break;
    }
    const ideal = y + room;
    let cut = findBreak(ctx, canvas.width, ideal, y + Math.floor(room * 0.7));

    const floor = y + Math.floor(room * 0.55);
    const orphaned = sectionTops.filter((t) => t < cut && cut - t < ORPHAN_ZONE && t - SECTION_GAP > floor);
    if (orphaned.length) cut = orphaned[0] - SECTION_GAP;

    pages.push({ y, h: cut - y, top });
    y = cut;
  }
  return pages;
}

function paperColour(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const px = ctx.getImageData(Math.floor(canvas.width / 2), 12, 1, 1).data;
  return [px[0], px[1], px[2]];
}

/**
 * Build the PDF and, unless dry is set, save it.
 * @returns {Promise<{ filename: string, bytes: number, pages: number }>}
 */
export async function saveCopy(sheet, info, opts = {}) {
  const { canvas, layout } = await renderCopy(sheet, info);
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  const scale = canvas.width / PAGE_WIDTH_PT;
  const pages = paginate(canvas, layout.sectionTops);
  const paper = paperColour(canvas);

  const slice = document.createElement('canvas');
  slice.width = canvas.width;
  const sctx = slice.getContext('2d');

  pages.forEach((p, i) => {
    if (i > 0) pdf.addPage('letter', 'portrait');

    // The sheet's paper runs the full page, so short last pages still look like paper.
    pdf.setFillColor(paper[0], paper[1], paper[2]);
    pdf.rect(0, 0, PAGE_WIDTH_PT, PAGE_HEIGHT_PT, 'F');

    slice.height = p.h;
    sctx.drawImage(canvas, 0, p.y, canvas.width, p.h, 0, 0, canvas.width, p.h);
    pdf.addImage(slice.toDataURL('image/jpeg', 0.9), 'JPEG', 0, p.top, PAGE_WIDTH_PT, p.h / scale);

    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(85, 80, 63);
    pdf.text(
      'FORM ' + info.code + '  ·  REF ' + info.ref + '  ·  PAGE ' + (i + 1) + ' OF ' + pages.length +
        (i < pages.length - 1 ? '  ·  CONTINUED OVERLEAF' : '  ·  END OF SHEET'),
      PAGE_WIDTH_PT / 2, PAGE_HEIGHT_PT - 12, { align: 'center' });
  });

  pdf.setProperties({
    title: info.title,
    subject: 'Declarant’s copy, reference ' + info.ref,
    author: 'Consolidated Industrial Concern',
    creator: 'CIC Office of Interdepartmental Grievance Review',
  });

  const bytes = pdf.output('arraybuffer').byteLength;
  if (!opts.dry) pdf.save(info.filename);
  return { filename: info.filename, bytes, pages: pages.length, breaks: pages.map((p) => p.y), canvas };
}

/**
 * Fallback when the libraries are unavailable: the browser's print
 * dialog, where "Save as PDF" is a destination. Resolves once the
 * dialog closes - the page cannot tell whether a file was saved.
 */
export function printCopy() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      resolve();
    };
    window.addEventListener('afterprint', finish);
    window.print();
    // Some browsers block in print() and never fire afterprint.
    setTimeout(finish, 1000);
  });
}

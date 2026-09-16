# CIC Paperwork

The Consolidated Industrial Concern's response to declarations of war: paperwork.

1. The declaring party opens the site and is handed **Form GC-1**. It is always the same
   form, and it always looks the same.
2. They fill it in and press **Save copy & file**. The sheet is turned into a filled-in
   paper copy — typed answers, ticked boxes, a handwritten signature, a rubber stamp and a
   reference number — and downloaded as a PDF.
3. Only then can they continue, to **Form GC-1a**: a new sheet drawn at random from a
   166-question bank, with its own title, questions and stationery.
4. Saving that unlocks GC-1b. And so on.

It is a static site. There is no server and nothing is stored anywhere except the PDFs the
declaring party saves on their own machine. They send those to you.

---

## Publish on GitHub Pages

GitHub Pages is free for public repositories.

1. Create an empty repository on GitHub — e.g. `cic-paperwork`, **public**, without a
   README.
2. Push this folder to it:

   ```bash
   git remote add origin https://github.com/<you>/cic-paperwork.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   Branch: `main`, folder `/ (root)` → Save.**

A minute later the site is live at `https://<you>.github.io/cic-paperwork/`.
Every push to `main` republishes it.

All paths in the site are relative, so it works from that sub-path as-is. `.nojekyll`
stops GitHub running the files through Jekyll.

---

## Preview it locally

Browsers will not load modules or JSON from a file opened straight off disk, so run the
tiny preview server (Node 18+, no install step):

```bash
npm run serve
```

Then open <http://localhost:8787>. Add `?dry=1` to the address to click through the whole
loop without downloading any PDFs.

Before pushing a change to the forms, run:

```bash
npm run check
```

It validates both JSON files and generates 300 random sheets to make sure each one is
sane — about a page long, no unfilled `{{slots}}`, no duplicate fields.

---

## Editing Form GC-1

Everything about GC-1 is in [`forms/gc-1.json`](forms/gc-1.json): the wording, the
sections, which fields are required, the stamp and message after saving, and its look
(pinned in the `style` block so it never changes). Edit the file, refresh the page.

Fields marked `"required": true` must be filled before GC-1 will save. Currently that is the
party name, the signatory, the signature, and the acknowledgement that filling in the form
is a form of negotiation.

The `transmittal` line is printed at the foot of the PDF — it is where you tell the
declaring party what to do with their copy.

## Editing the random sheets

Everything after GC-1 comes from [`forms/bank.json`](forms/bank.json). Add questions to
`questions`, section headings to `sectionTitles`, and so on — every pool is just a list,
and a sheet picks from each at random.

`slots` are word lists substituted into `{{double braces}}` anywhere in the bank, so one
question like *"Designation of the {{asset}} alleged to have been {{verb}}"* becomes dozens.
The shipped bank has 166 questions and ~3 × 10¹⁰ slot combinations.

`page` controls how long a sheet is: 3–4 sections of 2–4 questions, at most one long
answer box — about one printed page.

Random sheets never enforce required fields; anything can be saved. That keeps the loop
moving.

Full reference for both files: [docs/form-schema.md](docs/form-schema.md).

---

## How it works

| File | Job |
| --- | --- |
| `index.html` | The page. |
| `assets/app.js` | The loop: GC-1, then a random sheet per step. Remembers the current sheet and the answers typed so far in `sessionStorage`, so a reload does not lose anything. |
| `assets/generator.js` | Builds a sheet from the bank. Every new sheet gets a fresh random seed. |
| `assets/theme.js` | Picks the stationery — paper stock, ink, typefaces, letterhead, rules, field style, numbering, watermark — one component per axis. |
| `assets/cic.css` | Every one of those components, as CSS classes. |
| `assets/render.js` | Turns a form definition into the sheet on screen. |
| `assets/pdf.js` | Makes the declarant's copy. |
| `assets/schema.js` | The form and bank format, shared by the page and `npm run check`. |

### The PDF

`pdf.js` loads [html2canvas](https://html2canvas.hertzen.com/) and
[jsPDF](https://github.com/parallax/jsPDF) from cdnjs the first time someone saves. It
copies the sheet, replaces every input in the copy with what was typed into it, adds the
stamp and transmittal note, and renders that. The live form is never modified.

The copy is always laid out at desktop width, so a phone produces the same document as a
laptop. It is cut into US Letter pages at blank lines, so no page ends halfway through a
line, a box, or between a heading and its section, and each page carries a
*Form GC-1 · Ref · Page 1 of 4* line.

The PDF is an image of the sheet, so its text is not selectable.

If the libraries cannot be loaded (offline, blocked CDN), the page offers the browser's own
print dialog instead, where *Save as PDF* is a destination. The page cannot tell whether a
file was actually saved in that case, so it lets the declaring party continue once the
dialog closes.

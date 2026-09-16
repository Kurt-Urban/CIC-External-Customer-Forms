# CIC Paperwork

The Consolidated Industrial Concern's response to any complaint: more paperwork.

1. The customer opens the site and is handed **Form GC-1**, a customer dissatisfaction form
   for the Concern's goods and services — shipbuilding, trade, cargo delivery. It is always
   the same form, and it always looks the same.
2. They fill in **every field** and press **Save copy & file**. Nothing saves until the
   sheet is complete. The sheet is turned into a filled-in
   paper copy — typed answers, ticked boxes, a handwritten signature, a rubber stamp and a
   reference number — and downloaded as a PDF.
3. Only then can they continue, to **Form GC-1a** — which is some other kind of paperwork
   entirely: a mining permit, a crew dietary survey, a hull registration, a war grievance
   form (the Concern is pacifist; it is issued anyway). Each sheet has its own title,
   questions and stationery.
4. Saving that unlocks GC-1b, a different kind again. And so on, indefinitely.

No question is ever shown to the same person twice, but the same things keep being asked
in different words, often twice on one sheet.

It works for anyone: nothing in it refers to a particular customer or dispute.

It is a static site. There is no server and nothing is stored anywhere except the PDFs the
customer saves on their own machine. They send those to you.

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

It validates both JSON files, flags wordings too alike to pass as different questions,
and plays out six 60-sheet visitor sessions to confirm that no question ever repeats and
that every sheet is sane — about a page long, no unfilled `{{slots}}`, no duplicate fields.

---

## Editing Form GC-1

Everything about GC-1 is in [`forms/gc-1.json`](forms/gc-1.json): the wording, the
sections, which fields are required, the stamp and message after saving, and its look
(pinned in the `style` block so it never changes). Edit the file, refresh the page.

`"requireAll": true` means every field on GC-1 must be filled in before it will save: text
typed, boxes ticked, an option chosen, at least one box in each tick list. Greyed-out
fields such as the notary on sabbatical are exempt, since nobody can fill them. Set it to
`false` to require only the fields individually marked `"required": true`.

Pressing save on an incomplete sheet marks every missing field, says how many are left
under the button, and jumps to the first one. Each mark clears as soon as the field is
filled.

The `transmittal` line is printed at the foot of the PDF — it is where you tell the
customer what to do with their copy. `copyStamp` is the rubber stamp on that copy
("CUSTOMER’S COPY"); the random sheets use "DECLARANT’S COPY".

## Editing the random sheets

Everything after GC-1 comes from [`forms/bank.json`](forms/bank.json).

Every random sheet belongs to a **family** — a kind of paperwork — picked with no regard
for what the customer actually came about:

| Family | Sample titles |
| --- | --- |
| Grievance & Casus Belli | Certificate of Grievance Severity, War Aims Itemisation Schedule |
| Customer Satisfaction & Returns | Returns Authorisation Request, Refund Voucher Application |
| Shipyard Services & Hull Registration | Thruster Orientation Survey, Refit Request (Cosmetic) |
| Cargo, Customs & Logistics | Lost Cargo Report, Hazardous Goods Declaration |
| Mining Permits & Resource Claims | Voxel Removal Consent Form, Drilling Noise Assessment |
| Personnel & Crew Welfare | Dietary Requirements Notice, Oxygen Entitlement Claim |
| Insurance & Damage Claims | Meteor Strike Notification, Claim Withdrawal Form (Pre-Emptive) |

Families rotate: a visitor gets all seven before any comes round again, and never the same
one twice in a row. Most of a sheet's questions come from its own family and the rest are
general filing questions (names, signatures, reference numbers). About half of all sheets
also carry one question "misfiled" from another family, with a note saying so.

Within a family, the bank is organised by **topic** — something that paperwork wants to
know — and each topic is written many ways:

```json
{ "id": "party-name", "type": "text", "phrasings": [
  "What is your faction called?",
  "Legal name of the aggrieved entity",
  "Please print the name of your faction in capital letters"
] }
```

That is what drives the loop:

- **No question is shown twice.** The site remembers every wording a visitor has seen,
  including GC-1's, and never shows it to them again.
- **The same things keep being asked.** Topics come back on later sheets in new words, and
  almost every sheet asks one or two things twice.
- **It doesn't run dry.** The shipped bank has 7 families, 101 topics and 792 wordings,
  which lasts about 55 sheets before any wording is reused. After that, used wordings come back with a
  prefix or suffix from `restatePrefixes` / `restateSuffixes` ("Re-confirm: …",
  "… (for the avoidance of doubt)"), so the text is still new.

To add material, add wordings to the end of an existing topic, add a new topic (give it a
`family`), or add a whole new family with its own titles and section headings.
Everything else — footnotes, office strips, receipts — is a plain list the sheet picks from.

`slots` are word lists substituted into `{{double braces}}`, so
*"Name the {{asset}} said to have been {{verb}}"* becomes dozens of distinct questions.

`page` controls sheet length: 3–4 sections of 2–3 questions plus the repeated ones, at
most one long answer box — about one printed page.

Random sheets follow GC-1's `requireAll` setting, so every field on them must be filled
in too.

`npm run check` flags any two wordings so alike they would read as the same question.

Full reference for both files: [docs/form-schema.md](docs/form-schema.md).

---

## How it works

| File | Job |
| --- | --- |
| `index.html` | The page. |
| `assets/app.js` | The loop: GC-1, then a random sheet per step. Keeps the current sheet, the answers typed so far, every wording already shown, and the families already issued in `sessionStorage`, so a reload changes nothing. |
| `assets/generator.js` | Builds a sheet from the bank: picks the next family, fills it with wordings the visitor has not seen, asks a topic or two twice, and sometimes misfiles a question from elsewhere. |
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
file was actually saved in that case, so it lets the visitor continue once the
dialog closes.

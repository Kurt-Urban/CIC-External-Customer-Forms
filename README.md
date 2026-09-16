# CIC External Customer Forms

*The Consolidated Industrial Concern thanks you for your feedback. Please complete the form.*

**Site:** https://kurt-urban.github.io/CIC-External-Customer-Forms/

A customer-complaints portal for the Consolidated Industrial Concern, a Space Engineers
faction that is pacifist, neutral, and devoted to profit. Anyone with a grievance gets the
link. They then disappear into paperwork that never ends, never repeats itself, and never
reaches the right department.

---

## What a visitor gets

1. **Form GC-1 — Customer Dissatisfaction Intake Form.** It is the same form every time. It
   covers complaints about the Concern's shipbuilding, trade, cargo delivery, ore refining,
   station construction, and "contracted security (arranged, but never performed, by the
   Concern)".
2. **Every field is required.** Save is refused until the sheet is complete. Missing fields
   are marked in red, and a counter under the button shows how many are left.
3. **Saving produces their copy.** The sheet becomes a filled-in paper form: typed answers,
   ticked boxes, a handwritten signature, a *CUSTOMER'S COPY* stamp and a reference number.
   It downloads as a PDF, e.g. `CIC-GC-1-7K3-9B2.pdf`.
4. **The complaint is then "forwarded to the appropriate department or, failing that,
   another one."** Form GC-1a appears, and it is some other kind of paperwork entirely.
5. **Saving that unlocks GC-1b**, a different kind again. It does not end.

The PDFs stay on the visitor's machine. The transmittal line on each one tells them to send
it to the Concern "by the channel through which you made your purchase".

### Why it works as a trap

| | |
| --- | --- |
| **Always the wrong department** | Each sheet after GC-1 comes from one of seven unrelated kinds of paperwork (below). A visitor gets all seven before any repeats, and never the same kind twice in a row. About half of the sheets also carry one question "misfiled" from another department. |
| **Never the same question** | No wording is ever shown twice to the same visitor, GC-1 included. |
| **Always the same questions** | The same things keep coming back in new words: faction name, grievance, losses, signatures. Nearly every sheet asks one or two things twice. |
| **Never the same form** | Every sheet gets its own stationery: paper stock, ink, typefaces, letterhead, rules, field style, section numbering, watermark. |
| **No shortcuts** | Every field is required on every sheet, and the next sheet only unlocks after a copy is saved. |
| **No escape** | Reloading keeps the sheet and its answers. The only way out is "Withdraw and begin again at Form GC-1", which restarts the obligations. |

| Kind of paperwork | For example |
| --- | --- |
| Grievance & Casus Belli *(the Concern is pacifist; it is issued anyway)* | Certificate of Grievance Severity, War Aims Itemisation Schedule |
| Customer Satisfaction & Returns | Returns Authorisation Request, Refund Voucher Application |
| Shipyard Services & Hull Registration | Thruster Orientation Survey, Refit Request (Cosmetic) |
| Cargo, Customs & Logistics | Lost Cargo Report, Hazardous Goods Declaration |
| Mining Permits & Resource Claims | Voxel Removal Consent Form, Drilling Noise Assessment |
| Personnel & Crew Welfare | Dietary Requirements Notice, Oxygen Entitlement Claim |
| Insurance & Damage Claims | Meteor Strike Notification, Claim Withdrawal Form (Pre-Emptive) |

The bank holds 792 wordings across 101 topics, which lasts a visitor about 55 sheets before
any wording is reused. After that, old wordings return restated ("Re-confirm: …",
"… (for the avoidance of doubt)"), so the text is still new.

Progress is kept per browser tab. Closing the tab and coming back starts over at GC-1.

---

## Updating the site

The site is served by GitHub Pages from the root of `main`. Edit, check, push. It is live
again within a minute or so:

```bash
npm run check
git add -A
git commit -m "Describe the change"
git push
```

### Preview locally

Browsers won't load modules or JSON from a file opened straight off disk, so use the preview
server (Node 18+, nothing to install):

```bash
npm run serve
```

Open <http://localhost:8787>. Add `?dry=1` to the address to click through the whole loop
without downloading any PDFs. That also works on the live site.

### Check before pushing

`npm run check` needs no browser or server. It:

- validates both form files
- flags any two wordings so alike they would read as the same question
- plays out six visitors filling in 60 sheets each, confirming that:
  - no question repeats
  - kinds of paperwork rotate properly
  - every field is required
  - every sheet is about a page long, with no unfilled `{{slots}}`

---

## Editing Form GC-1

Everything about GC-1 is in [`forms/gc-1.json`](forms/gc-1.json). Edit it and refresh.

- **Wording and sections**: `sections`, each with `fields`.
- **What must be filled in**: `"requireAll": true` makes every field required. Greyed-out
  (`"disabled"`) fields, such as the notary on sabbatical, are exempt. Random sheets follow
  this setting too.
- **Its look**: pinned in `style`, so GC-1 never changes appearance.
- **The PDF**: `copyStamp` is the rubber stamp; `transmittal` is the instruction printed at
  the foot.
- **After saving**: `receipt` sets the stamp, message and button that lead to GC-1a.

## Editing the random sheets

Everything after GC-1 comes from [`forms/bank.json`](forms/bank.json):

- **`families`**: the kinds of paperwork. Each has its own titles, departments, section
  headings, instructions and notes.
- **`topics`**: the things a family wants to know. Each topic belongs to a `family`, or is
  `general` (names, signatures, reference numbers, which fit anywhere). Each topic lists
  many `phrasings`:

  ```json
  { "id": "g-perishable", "family": "cargo", "type": "radio",
    "options": ["Yes", "No", "It is now"],
    "phrasings": ["Is the cargo perishable?", "Has the cargo perished?", "Was the cargo alive when sent?"] }
  ```

- **`slots`**: word lists substituted into `{{double braces}}`, so
  *"Name the {{asset}} said to have been {{verb}}"* becomes dozens of questions.
- **Everything else** (receipts, footnotes, office strips, stamps, misfile notes) is a
  plain list that sheets pick from.

To add material, add phrasings **to the end** of a topic, add a topic, or add a family.
The site remembers what a visitor has seen by position in each list, so don't insert in the
middle.

Full field and option reference: [docs/form-schema.md](docs/form-schema.md).

---

## How it works

A static site: HTML, CSS, JavaScript modules and two JSON files. There is no server,
nothing is collected, and nothing is stored beyond the visitor's own browser tab.

| File | Job |
| --- | --- |
| `index.html` | The page. |
| `assets/app.js` | The loop: GC-1, then a new sheet per step. It remembers the current sheet, the answers typed, every wording already shown, and the kinds of paperwork already issued. |
| `assets/generator.js` | Builds each sheet: picks the next kind of paperwork, fills it with wordings the visitor hasn't seen, asks a topic or two twice, and sometimes misfiles a question. |
| `assets/theme.js` | Picks the stationery for each sheet, one component per design axis. |
| `assets/cic.css` | Every stationery component, as CSS classes. |
| `assets/render.js` | Turns a form definition into the sheet on screen, and checks required fields. |
| `assets/pdf.js` | Makes the visitor's PDF copy. |
| `assets/schema.js` | The form and bank format, shared by the page and `npm run check`. |
| `scripts/serve.mjs`, `scripts/check.mjs` | Local preview and pre-push checks. |

### The PDF copy

The first time someone saves, `pdf.js` loads [html2canvas](https://html2canvas.hertzen.com/)
and [jsPDF](https://github.com/parallax/jsPDF) from cdnjs. It then:

- copies the sheet and replaces every input with what was typed into it (the form on screen
  is never touched)
- adds the stamp and transmittal note
- renders the copy at desktop width, so a phone produces the same document as a laptop
- cuts it into US Letter pages at blank lines, never through a line of text, a box, or
  between a heading and its section
- adds a *Form GC-1 · Ref · Page 1 of 4* line to each page

The PDF is an image, so its text isn't selectable. If the libraries can't load (offline, or
the CDN is blocked), the browser's print dialog opens instead, with *Save as PDF* as a
destination.

### Third parties

Fonts come from Google Fonts, and the PDF libraries from cdnjs, so those services see
requests from visitors' browsers. Nothing else leaves the page.

### Moving from the old address

The site used to be at `/cic-paperwork/`. GitHub Pages does not redirect renamed
repositories, so that address now returns 404. Links should point to
https://kurt-urban.github.io/CIC-External-Customer-Forms/.

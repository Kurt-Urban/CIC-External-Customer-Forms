# Form & bank reference

Everything here is plain JSON. Drop a file on the admin page, or commit it to `forms/`.

---

## A form

```json
{
  "id": "gc-3",
  "code": "GC-3",
  "title": "Certificate of Grievance Severity",
  "subtitle": "Cannot be issued without Form GC-3a.",
  "mode": "static",
  "order": 30,
  "chip": "REQUIRED",
  "indexBlurb": "Assigns a severity band to a grievance already on file.",
  "department": "Asset Valuation & Mourning",
  "revision": "REV. 12",
  "meta": ["ATTACHMENT TO GC-1"],
  "instructions": "**Before you begin:** …",
  "enforceRequired": true,
  "sections": [ … ],
  "officeUseTitle": "For Office Use Only",
  "officeUse": [ { "label": "STATUS", "value": "Pending" } ],
  "finePrint": "…",
  "submitLabel": "CERTIFY",
  "style": { "stock": "mimeo" },
  "receipt": { … }
}
```

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase letters, numbers, hyphens. The URL is `/form.html?f=<id>`. |
| `code` | | Short display code in the letterhead. Defaults to the id, uppercased. |
| `title` | yes | |
| `subtitle` | | Italic line under the title. |
| `mode` | | `"static"` (default) or `"generated"`. |
| `bankId` | if generated | Which question bank to draw pages from. |
| `order` | | Sort position on the index. Default `500`. |
| `hidden` | | `true` keeps it off the index and returns 404 publicly. |
| `chip` | | Small label on the index row. |
| `indexBlurb` | | One or two lines under the title on the index. |
| `org`, `department` | | Letterhead lines. |
| `revision`, `meta` | | Extra letterhead detail; `meta` is an array of lines. |
| `instructions` | | The boxed notice above the first section. Supports inline markdown. |
| `enforceRequired` | | `false` lets any sheet through regardless of `required` flags. |
| `sections` | if static | See below. |
| `officeUse` | | Array of `{ label, value }` for the office-use strip. |
| `finePrint` | | Small print beside the submit button. |
| `submitLabel` | | Button text. |
| `style` | | Pins any procedural choice — see *Styling*. |
| `receipt` | | What happens after filing — see *Receipt*. |

**Inline markdown** is available in `instructions`, `subtitle`, `finePrint`, field `label`,
`help`, `note`, and static `text`: `**bold**`, `*italic*`, `` `code` ``, and `[link](/path)`
to same-site paths. Everything is escaped first; raw HTML never renders.

---

## Sections

```json
{
  "title": "Declaring Party Information",
  "intro": "Optional prose above the fields.",
  "fields": [ … ],
  "note": "Optional footnote below the fields.",
  "seal": true,
  "sealLabel": "GC-3"
}
```

Give the **bare** title — `"Declaring Party Information"`, not `"Section 1 — …"`. The
numbering scheme is part of the generated template, so the same section might render as
`Section 1 — …`, `§ 1.`, `Part I — …`, `Article 1.`, `1.` or with no number at all.

`"seal": true` wraps the section's fields in a bordered block with the gold notary seal.

---

## Fields

```json
{ "name": "entity", "type": "text", "label": "Name of the entity",
  "placeholder": "As registered", "required": true, "width": "half" }
```

| Key | Applies to | Notes |
| --- | --- | --- |
| `type` | all | See the table below. Defaults to `text`. |
| `name` | all | Key the answer is stored under. Derived from the label if omitted. |
| `label` | all but `static` | |
| `required` | all but `static` | Enforced unless `enforceRequired` is `false`. |
| `width` | all | `"half"` pairs with the next half-width field into two columns. |
| `placeholder` | text-like | |
| `help` | most | Italic footnote under the field. |
| `disabled` | most | Renders greyed out and is never collected. Good for jokes. |
| `maxLength` | text-like | Also clamped server-side. |
| `rows` | `textarea` | |
| `minWords` | `textarea` | Shows a live word counter. Advisory — never blocks. |
| `min`, `max` | `number` | |
| `options` | `select`, `radio`, `checkboxes` | Strings, or `{ "value", "label" }` objects. |
| `text` | `static` | The prose to display. |

### Types

| Type | Renders as | Stored as |
| --- | --- | --- |
| `text` | single-line input | string |
| `email` | email input | string |
| `number` | number input | number, or `""` |
| `date` | date picker | `YYYY-MM-DD` string |
| `textarea` | multi-line box | string |
| `select` | dropdown | one option value |
| `radio` | radio list | one option value |
| `checkbox` | one tick box | boolean |
| `checkboxes` | tick list | array of option values |
| `signature` | single-line input, sign-here styling | string |
| `static` | prose, no input | not stored |

Answers are coerced server-side: `select`/`radio`/`checkboxes` values not in `options` are
discarded, strings are truncated, non-numeric `number` answers become `""`.

---

## Receipt

```json
"receipt": {
  "stamp": "RECEIVED",
  "message": "Logged as **{{code}}**, reference **{{ref}}**. Now complete **Form {{next}}**.",
  "footnotes": ["Note: …", "Note: …"],
  "next": { "mode": "generate", "label": "Open Form {{next}} →" }
}
```

`footnotes` rotate — the *n*th filing in a session shows the *n*th footnote.

Placeholders: `{{code}}` this sheet's code, `{{next}}` the next one, `{{ref}}` the
reference number, `{{queue}}` queue position, `{{count}}` sheets filed this session,
`{{title}}`.

| `next.mode` | Behaviour |
| --- | --- |
| `generate` | Draw a fresh page from the bank. The endless loop. |
| `chain` | Re-issue this same form as `GC-1a`, `GC-1b`, … |
| `form` | Link to another form. Needs `formId`. |
| `index` | Back to the index. |
| `none` | No button. |

---

## Styling

Each form is assigned a template deterministically from its `id`, so it always looks the
same but differs from every other form. Override any axis in `style`:

| Axis | Options |
| --- | --- |
| `stock` | `cream` `buff` `goldenrod` `carbon-pink` `ledger` `mimeo` `onionskin` |
| `ink` | `red` `violet` `navy` `green` `oxblood` `slate` |
| `display` | `elite` `courier` `cutive` `smallcap` |
| `body` | `plex` `garamond` `baskerv` |
| `edge` | `perforated` `punched` `tractor` `notched` `plain` |
| `head` | `split` `stacked` `boxed` `ruled` `stamped` |
| `rule` | `hair` `double` `dotted` `heavy` `tinted` |
| `fields` | `plain` `underline` `comb` `inset` `boxed` |
| `labels` | `plain` `caps` `italic` |
| `checks` | `plain` `boxed` `ruled` |
| `office` | `grid` `inline` `shaded` `ticket` |
| `numbering` | `section` `sign` `part` `article` `plain` `none` |
| `watermark` | any short string, or `false` for none |
| `seed` | a string — changes every unset axis at once |

`"style": { "seed": "try-again" }` is the quickest way to reroll a look you dislike.
The admin page shows the assigned template when you validate a form.

---

## A question bank

```json
{
  "kind": "bank",
  "id": "cic-core",
  "name": "CIC Core Grievance Bank",
  "page": {
    "minSections": 3, "maxSections": 4,
    "minQuestionsPerSection": 2, "maxQuestionsPerSection": 4,
    "maxLongAnswers": 1
  },
  "slots": { "form": ["GC-2", "GC-9"], "asset": ["shipyard", "refinery"] },
  "questions": [ { "type": "text", "label": "Designation of the {{asset}}" } ],
  "sectionTitles": ["Declaring Party Information", "War Aims"],
  "titles": ["Grievance & Casus Belli Intake Form"]
}
```

`questions` entries use exactly the field schema above, minus `name` (assigned per page).

Every other pool is optional; a page picks one item from each:

`titles` · `subtitles` · `departments` · `metaLines` · `instructions` · `sectionTitles` ·
`sectionNotes` · `officeUse` · `officeUseTitles` · `finePrint` · `submitLabels` · `stamps` ·
`receiptMessages` · `receiptFootnotes` · `nextLabels`

`page.maxLongAnswers` keeps sheets to roughly one page by limiting `textarea` fields.

### Slots

Any `{{name}}` in a question label, placeholder, help text, option, section title, footnote
or receipt line is replaced with a random entry from `slots.name`. Slots may nest up to four
levels — a slot value can itself contain `{{another}}`.

This is where the supply comes from: 166 questions with ~10 slot lists of ~10 entries each
produces far more distinct sheets than anyone will ever fill in.

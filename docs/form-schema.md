# Form & bank reference

Two files drive the site:

- `forms/gc-1.json` — Form GC-1, the fixed first form: a customer complaint.
- `forms/bank.json` — the families, topics and lists every random sheet after it is drawn from.

Run `npm run check` after editing either.

---

## Form GC-1

```json
{
  "id": "gc-1",
  "code": "GC-1",
  "title": "Customer Dissatisfaction Intake Form",
  "subtitle": "“Omnis Questus, Nullus Sanguis” — All Profit, No Blood",
  "org": "CONSOLIDATED INDUSTRIAL CONCERN",
  "department": "Department of Customer Satisfaction (Provisional)",
  "revision": "REV. 47",
  "meta": ["GENERAL COMPLAINT — GOODS & SERVICES"],
  "enforceRequired": true,
  "requireAll": true,
  "copyStamp": "CUSTOMER’S COPY",
  "style": { … },
  "instructions": "**Before you begin:** …",
  "sections": [ … ],
  "officeUse": [ { "label": "RECEIVED BY", "value": "—" } ],
  "finePrint": "…",
  "submitLabel": "SAVE COPY & FILE",
  "transmittal": "**Transmittal:** …",
  "receipt": { … }
}
```

| Key | Notes |
| --- | --- |
| `code` | Shown in the letterhead. Random sheets are numbered from it: GC-1a, GC-1b, … |
| `title`, `subtitle` | The title block. |
| `org`, `department` | Letterhead lines. `department` is also the default for random sheets. |
| `revision`, `meta` | Small letterhead lines on the right; `meta` is a list. |
| `requireAll` | `true`: every field that can be filled in must be, before saving. Greyed-out (`disabled`) fields are exempt. Random sheets follow this setting. |
| `enforceRequired` | `false` lets GC-1 save with required fields empty — turns off all checking. |
| `style` | The pinned look — see *Styling*. |
| `instructions` | The shaded notice above the first section. |
| `sections` | See below. |
| `officeUse` | The "For Office Use Only" strip. `officeUseTitle` renames it. |
| `finePrint` | Small print beside the save button. |
| `submitLabel` | The save button. |
| `transmittal` | Printed at the foot of the PDF copy only. |
| `copyStamp` | Text of the rubber stamp on the PDF copy. Random sheets use "DECLARANT’S COPY". |
| `receipt` | What appears after saving — see *Receipt*. |

**Inline formatting** works in most text: `**bold**`, `*italic*`, `` `code` ``. Everything
is escaped first; HTML never renders.

### Sections

```json
{
  "title": "Declaring Party Information",
  "intro": "Optional prose above the fields.",
  "fields": [ … ],
  "note": "Optional italic footnote below the fields.",
  "seal": true,
  "sealLabel": "CIC"
}
```

Give the bare title. The "Section 1 —" prefix comes from the `numbering` style.
`"seal": true` puts the section in a bordered block beside the gold notary seal.

### Fields

```json
{ "name": "customer_name", "type": "text", "label": "Customer name or faction",
  "placeholder": "As it appears on your invoice", "required": true, "width": "half" }
```

| Key | Applies to | Notes |
| --- | --- | --- |
| `type` | all | See below. |
| `name` | all | Must be unique within the form. Used to remember answers across a reload. |
| `label` | all but `static` | A `checkboxes` field may leave it out if the section title says it all. |
| `required` | inputs | The form will not save while it is empty. Implied for every field when `requireAll` is on. A tick list needs at least one box; a single checkbox must be ticked. |
| `width` | inputs | `"half"` puts two consecutive half-width fields side by side. |
| `placeholder` | text-like | Faint hint text. For a `disabled` field it is printed on the PDF. |
| `help` | most | Italic footnote under the field. |
| `disabled` | most | Greyed out, cannot be filled. Good for the notary on sabbatical. |
| `maxLength` | text-like | |
| `rows`, `minWords` | `textarea` | `minWords` shows a live word counter. It never blocks saving. |
| `min`, `max` | `number` | |
| `options` | `select`, `radio`, `checkboxes` | A list of strings. |
| `text` | `static` | The prose to show. |

| Type | On screen | On the PDF |
| --- | --- | --- |
| `text`, `email`, `number` | one-line box | typed text |
| `date` | date picker | `16 SEP 2026` |
| `textarea` | large box | typed text, line breaks kept |
| `signature` | one-line box in handwriting | handwriting |
| `select` | dropdown | the chosen option |
| `radio` | pick one | every option, chosen one ticked |
| `checkbox` | a single tick box | ticked or not |
| `checkboxes` | tick list | every option, chosen ones ticked |
| `static` | a paragraph | the same paragraph |

### Receipt

```json
"receipt": {
  "stamp": "RETAINED",
  "message": "Your copy of **{{code}}** has been saved as **{{file}}**. Please complete **Form {{next}}**.",
  "footnotes": ["Note: …"],
  "next": { "mode": "generate", "label": "Open Form {{next}} →" }
}
```

Placeholders: `{{code}}` this form, `{{next}}` the next one, `{{file}}` the PDF's file name,
`{{ref}}` its reference number, `{{count}}` copies saved this session, `{{queue}}` a
meaningless queue position, `{{title}}`.

`next.mode` is `generate` (continue to a random sheet) or `none` (stop here).

---

## Styling

Every axis can be set in `style`. GC-1 sets all of them so it never varies. Random sheets
set none, so each gets a random combination.

| Axis | Options |
| --- | --- |
| `stock` | `cream` `buff` `goldenrod` `carbon-pink` `ledger` `mimeo` `onionskin` |
| `ink` | `red` `violet` `navy` `green` `oxblood` `slate` |
| `display` | `elite` `courier` `cutive` `smallcap` — headings |
| `body` | `plex` `garamond` `baskerv` — text |
| `edge` | `perforated` `punched` `tractor` `notched` `plain` |
| `head` | `split` `stacked` `boxed` `ruled` `stamped` — letterhead layout |
| `rule` | `hair` `double` `dotted` `heavy` `tinted` — section headings |
| `fields` | `plain` `underline` `comb` `inset` `boxed` |
| `labels` | `plain` `caps` `italic` |
| `checks` | `plain` `boxed` `ruled` |
| `office` | `grid` `inline` `shaded` `ticket` |
| `numbering` | `section` `sign` `part` `article` `plain` `none` |
| `watermark` | any short text, or `false` |
| `motto` | text around the notary seal |

---

## The question bank

```json
{
  "kind": "bank",
  "id": "cic-core",
  "page": {
    "minSections": 3, "maxSections": 4,
    "minQuestionsPerSection": 2, "maxQuestionsPerSection": 3,
    "maxFields": 15, "maxLongAnswers": 1,
    "echoChance": 0.95, "interjectionChance": 0.35
  },
  "slots": { "asset": ["ship", "refinery"], "verb": ["destroyed", "taken"] },
  "families": [
    {
      "id": "cargo",
      "name": "Cargo, Customs & Logistics",
      "titles": ["Lost Cargo Report"],
      "departments": ["Lost Cargo Office"],
      "sectionTitles": ["Consignment Details"],
      "instructions": ["**Before you begin:** all cargo must be declared, including cargo that has not yet been lost."],
      "sectionNotes": ["Containers declared empty will be inspected for emptiness."]
    }
  ],
  "topics": [
    {
      "id": "g-perishable",
      "family": "cargo",
      "type": "radio",
      "options": ["Yes", "No", "It is now"],
      "phrasings": ["Is the cargo perishable?", "Has the cargo perished?"]
    },
    {
      "id": "losses-asset",
      "family": "grievance",
      "type": "text",
      "phrasings": [
        "What did your faction lose?",
        "Name the {{asset}} said to have been {{verb}}",
        { "label": "List the property involved", "help": "Do not include coordinates." }
      ]
    },
    {
      "id": "at-war",
      "family": "grievance",
      "type": "radio",
      "options": ["Yes", "No", "Unsure"],
      "phrasings": [
        "Are you currently at war with the Concern?",
        { "label": "Is your faction not at war with the Concern?",
          "options": ["Yes (not at war)", "No (at war)"] }
      ]
    }
  ],
  "misfileNotes": ["*The following question was misfiled from {{family}}. It must be answered here.*"],
  "restatePrefixes": ["Re-confirm:"],
  "restateSuffixes": ["(for the avoidance of doubt)"],
  "interjections": ["*Section intentionally left partly blank.*"],
  "sectionTitles": ["Declaring Party Information", "War Aims"]
}
```

### Families

A family is a kind of paperwork. Each random sheet belongs to exactly one, and takes its
title, department, most section headings, and often its instructions and section notes
from the family's own lists (falling back to the shared lists at the bottom of the bank).

Families rotate: the least-issued family goes next, never the same one twice in a row.
`id` must be unique and may not be `general`; `name` appears on the sheet as
"SERIES: …" and in misfile notes.

### Topics

A topic is one thing a family wants to know. `family` says which family it belongs to;
`general` (or no `family`) means it can appear on any sheet — names, signatures,
reference numbers. Its properties (`type`, `options`,
`placeholder`, `help`, `min`, `max`, `rows`, `minWords`, `maxLength`, `disabled`) use the
field format above and apply to every wording. A wording is either a plain string (the
label) or an object that overrides any of those properties for itself.

Only `topics` is required. Each `id` must be unique. The site remembers what a visitor has
seen by topic id and the wording's position in the list, so **add new wordings at the end
of a list** rather than in the middle.

### How a sheet is drawn

1. Pick the family, and 3–4 section headings.
2. Fill each section with 2–3 wordings the visitor has never seen, from different topics —
   a share (`familyShare`) from the sheet's family, the rest general.
3. With probability `echoChance`, pick one or two topics already on the sheet and ask them
   again, in another wording, in a later section.
4. With probability `interjectionChance`, drop in one of the `interjections`.
5. With probability `misfileChance`, add one question from a different family, preceded by
   one of the `misfileNotes` (`{{family}}` becomes that family's name).
6. Nothing already shown to the visitor — on GC-1 or any earlier sheet — is shown again.
   Once every wording has been used, old ones come back with a restate prefix or suffix.

| `page` setting | Meaning |
| --- | --- |
| `minSections`, `maxSections` | sections per sheet |
| `minQuestionsPerSection`, `maxQuestionsPerSection` | before repeats are added |
| `maxFields` | cap on questions per sheet |
| `maxLongAnswers` | cap on `textarea` questions per sheet |
| `echoChance` | chance a sheet asks something twice |
| `interjectionChance` | chance of a note from the Office |
| `familyShare` | share of questions drawn from the sheet's own family |
| `misfileChance` | chance of one question from another family |

### Other pools

Each sheet picks at random from each of these lists. `titles`, `departments`,
`sectionTitles`, `instructions` and `sectionNotes` are used when the sheet's family has
none of its own, or occasionally for variety.

| Pool | Used for |
| --- | --- |
| `titles`, `subtitles` | title block |
| `departments`, `metaLines` | letterhead |
| `instructions` | the shaded notice |
| `sectionTitles`, `sectionNotes` | section headings and footnotes |
| `interjections` | notes dropped between questions |
| `misfileNotes` | the note above a misfiled question |
| `restatePrefixes`, `restateSuffixes` | re-wording a used question |
| `officeUse`, `officeUseTitles` | the office strip |
| `finePrint`, `submitLabels` | beside and on the save button |
| `transmittals` | foot of the PDF |
| `stamps`, `receiptMessages`, `receiptFootnotes`, `nextLabels` | after saving |

**Slots.** Any `{{name}}` in a bank string is replaced with a random entry from
`slots.name`. Slot values may contain other slots. The receipt placeholders
(`{{code}}`, `{{next}}`, `{{file}}`, …) are not slots and are filled in after saving.

**Order.** Questions are drawn in random order, so one that refers to "the question
above" may appear first on a sheet. That is intentional.

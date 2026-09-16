# Form & bank reference

Two files drive the site:

- `forms/gc-1.json` — Form GC-1, the fixed first form.
- `forms/bank.json` — the pools every random sheet after it is drawn from.

Run `npm run check` after editing either.

---

## Form GC-1

```json
{
  "id": "gc-1",
  "code": "GC-1",
  "title": "Grievance & Casus Belli Intake Form",
  "subtitle": "“Omnis Questus, Nullus Sanguis” — All Profit, No Blood",
  "org": "CONSOLIDATED INDUSTRIAL CONCERN",
  "department": "Office of Interdepartmental Grievance Review",
  "revision": "REV. 47",
  "meta": ["IN RE: FREQUENCY 0xUNKNOWN"],
  "enforceRequired": true,
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
| `enforceRequired` | `false` lets GC-1 save with required fields empty. |
| `style` | The pinned look — see *Styling*. |
| `instructions` | The shaded notice above the first section. |
| `sections` | See below. |
| `officeUse` | The "For Office Use Only" strip. `officeUseTitle` renames it. |
| `finePrint` | Small print beside the save button. |
| `submitLabel` | The save button. |
| `transmittal` | Printed at the foot of the PDF copy only. |
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
{ "name": "party_name", "type": "text", "label": "Name of declaring party",
  "placeholder": "As it will appear in Ledger 7", "required": true, "width": "half" }
```

| Key | Applies to | Notes |
| --- | --- | --- |
| `type` | all | See below. |
| `name` | all | Must be unique within the form. Used to remember answers across a reload. |
| `label` | all but `static` | A `checkboxes` field may leave it out if the section title says it all. |
| `required` | inputs | GC-1 will not save while it is empty. |
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
    "minQuestionsPerSection": 2, "maxQuestionsPerSection": 4,
    "maxLongAnswers": 1
  },
  "slots": { "asset": ["shipyard", "refinery"], "form": ["GC-2", "GC-9"] },
  "questions": [
    { "type": "text", "label": "Designation of the {{asset}} alleged to have been removed" }
  ],
  "sectionTitles": ["Declaring Party Information", "War Aims"]
}
```

`questions` use the field format above, without `name` (assigned per sheet). Only
`questions` is required. Each sheet picks at random from each of these lists:

| Pool | Used for |
| --- | --- |
| `titles`, `subtitles` | title block |
| `departments`, `metaLines` | letterhead |
| `instructions` | the shaded notice |
| `sectionTitles`, `sectionNotes` | section headings and footnotes |
| `questions` | the fields |
| `officeUse`, `officeUseTitles` | the office strip |
| `finePrint`, `submitLabels` | beside and on the save button |
| `transmittals` | foot of the PDF |
| `stamps`, `receiptMessages`, `receiptFootnotes`, `nextLabels` | after saving |

**Slots.** Any `{{name}}` in a bank string is replaced with a random entry from
`slots.name`. Slot values may contain other slots. The receipt placeholders
(`{{code}}`, `{{next}}`, `{{file}}`, …) are not slots and are filled in after saving.

**Order.** Questions are drawn in random order, so a question that refers to "the question
above" may appear first on a sheet. The shipped bank leans into this.

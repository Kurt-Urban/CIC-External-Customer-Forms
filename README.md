# CIC Paperwork

A self-regenerating bureaucratic form system for the Consolidated Industrial Concern.
Someone declares war; they are handed a form; filing it produces another form.

- **Public site** — an index of forms, and the forms themselves.
- **Endless pages** — Form GC-1 assembles each page from a 166-question bank, so it never
  runs out and no two sheets look alike.
- **Procedural styling** — every page derives its own template (paper stock, ink, typography,
  letterhead, rules, field treatment, numbering, watermark) from its id. No per-form CSS.
- **Saved responses** — questions *and* answers are stored, viewable on a password-gated
  secret path on your own site.
- **Drop-in forms** — add a `.json` file through the admin page and it appears on the index
  immediately. No deploy, no code.

---

## Deploy

The repo lives on GitHub; Netlify builds and hosts it. Netlify supplies both the serverless
functions and the storage (Netlify Blobs), so there is nothing else to sign up for.

### 1. Push to GitHub

```bash
git remote add origin https://github.com/<you>/cic-paperwork.git
git push -u origin main
```

### 2. Connect it to Netlify

At [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
→ pick the repo. The build settings come from `netlify.toml`; leave them alone.

### 3. Set three environment variables

Site configuration → Environment variables:

| Variable | What it does |
| --- | --- |
| `ADMIN_PASSWORD` | The password for the submissions viewer. Make it long and random. |
| `ADMIN_PATH` | The secret path the admin page is served from, e.g. `ledger-7`. No slashes. |
| `ADMIN_SECRET` | Random string used to sign session and page tokens. |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Then **Deploys → Trigger deploy → Clear cache and deploy site**, because `ADMIN_PATH` is
baked in at build time.

Your site is then:

- `https://<site>.netlify.app/` — the form index
- `https://<site>.netlify.app/form.html?f=gc-1` — the endless grievance form
- `https://<site>.netlify.app/<ADMIN_PATH>` — the registry (password required)

---

## Run it locally

No Netlify CLI and no account needed — submissions go to `.cic-data/` instead of Blobs.

```bash
npm run dev
```

Then <http://localhost:8787>. The registry is at `/ledger-7` with the password
`local-dev-password` unless you set your own in a `.env` file (copy `.env.example`).

To check everything still works after a change, with the dev server running:

```bash
npm run check
```

---

## Adding a form

Two ways, both without touching code.

**Through the site.** Open your admin path → **Add / Upload** → drop a `.json` file on the
zone, or paste it in. It is validated in the browser, then again on the server, and appears
on the public index the moment it saves. **Download form template** gives you a working
starting point.

**Through the repo.** Drop the file in `forms/` and push. Files there are the defaults; the
admin page can override or hide them, and revert to them later.

Every form gets its own generated template. You never write CSS. If you want to pin part of
the look, add a `style` block:

```json
"style": { "stock": "mimeo", "ink": "violet", "watermark": "CARBON" }
```

Full field and option reference: [docs/form-schema.md](docs/form-schema.md).

### Two kinds of form

- **`"mode": "static"`** — you list the sections and fields. One fixed sheet. (See `forms/gc-2.json`.)
- **`"mode": "generated"`** — you name a `bankId` and every page is drawn fresh from that
  bank of questions. This is the endless loop. (See `forms/gc-1.json`.)

A **question bank** is a JSON file with `"kind": "bank"` holding pools of questions, titles,
section names, footnotes and so on, plus `slots` — lists that get substituted into
`{{double braces}}`, so a few hundred written lines produce an effectively unbounded supply
of paperwork. `forms/_bank-cic-core.json` is the one shipped here: 166 questions and roughly
10<sup>11</sup> slot combinations.

---

## How the endless loop works

1. The browser asks for page *N* with a random per-visitor seed.
2. The server draws that page from the bank. Generation is deterministic, so the same
   seed and page always give the same sheet.
3. The page is returned with a signed **page token** recording which sheet it is.
4. On submit, the server verifies the token, **re-generates the same page from the seed**,
   and pairs each answer with the question that produced it. Nothing about the questions is
   taken from the browser.
5. The receipt offers page *N+1*, and it begins again.

Progress is kept in `sessionStorage`, so a reload continues rather than restarting.

---

## Spam protection

| Layer | What it stops |
| --- | --- |
| Signed page token | Blind `POST`s. A submission must come from a page the server actually issued. |
| Minimum dwell time | Submissions returned faster than 2.5 seconds. |
| Token expiry | Tokens harvested and replayed a day later. |
| Honeypot field | Bots that fill every input. Returns a convincing fake success. |
| Rate limits | 60 submissions per IP per hour, 400 per day. |
| Duplicate digest | The identical sheet filed twice within ten minutes. |
| Blank-sheet check | Empty submissions. |
| Schema coercion | Junk data: answers are clamped to the declared type, length, and option list. |
| Login throttle | Password guessing — 10 attempts per IP per 15 minutes. |

The admin password is only ever checked on the server. It is never in the page source, and
a successful login returns an eight-hour signed token instead of storing the password.

**The secret path is obscurity, not security.** The real lock is `ADMIN_PASSWORD`. The page
at that path contains no data — everything on it arrives from an authenticated endpoint.

### What is stored

Each submission keeps the questions, the answers, a reference number, a timestamp, the
user-agent string, and a truncated SHA-256 hash of the submitter's IP. The raw IP is never
written to disk. Nothing is sent anywhere outside your own Netlify site.

---

## Layout

```
forms/               seed forms and question banks (plain JSON)
public/              the static site
  assets/
    cic.css          every procedural component, as classes
    theme.js         picks one component per axis from the form id
    generator.js     assembles a page from a question bank
    render.js        turns a form definition into DOM
    schema.js        the form contract — shared by browser and server
netlify/functions/
  forms.mjs          GET  /api/forms    list forms / fetch a page
  submit.mjs         POST /api/submit   file a sheet
  admin.mjs          POST /api/admin    everything behind the password
  lib/store.mjs      Netlify Blobs, or local files in dev
src/admin.html       the registry page, copied to ADMIN_PATH at build
scripts/build.mjs    bundles seeds, mounts the admin page
scripts/dev-server.mjs   runs the whole site locally
scripts/check.mjs    end-to-end smoke tests
```

`netlify/functions/lib/seed-forms.mjs` is generated by the build from `forms/*.json`.
It is committed so the functions work even if something runs them without building first;
edit the JSON, not that file.

---

## Costs

Netlify's free tier covers this comfortably: 125k function calls and 100GB bandwidth per
month, and Blobs storage is included. Each page view is one function call; each submission
is one more.

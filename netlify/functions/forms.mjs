/* Public: list forms, or fetch one page to render.

   For a "generated" form the page is assembled server-side from the
   question bank, so the bank itself never ships to the browser and
   the server can reproduce exactly what was asked when the answers
   come back. */

import { allForms, getForm, getBank, summarize } from './lib/forms-repo.mjs';
import { json, errorJSON, issuePageToken } from './lib/auth.mjs';
import { generatePage } from '../../public/assets/generator.js';
import { LIMITS } from '../../public/assets/schema.js';

export default async (req) => {
  if (req.method !== 'GET') return errorJSON('Method not allowed.', 405);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    const forms = await allForms();
    return json({ forms: forms.filter((f) => !f.hidden).map(summarize) });
  }

  const form = await getForm(id);
  if (!form || form.hidden) return errorJSON('Form not found.', 404);

  if (form.mode !== 'generated') {
    return json({
      form,
      mode: 'static',
      pageToken: issuePageToken({ f: form.id, m: 'static' }),
    });
  }

  const bank = await getBank(form.bankId);
  if (!bank) {
    return errorJSON('This form draws on question bank "' + form.bankId + '", which is not on file.', 500);
  }

  const seed = String(url.searchParams.get('seed') || 'default').slice(0, 64);
  const page = Math.max(0, Math.min(LIMITS.maxPages, Number(url.searchParams.get('page')) || 0));

  return json({
    form: generatePage(bank, form, seed, page),
    mode: 'generated',
    seed,
    page,
    bankId: form.bankId,
    pageToken: issuePageToken({ f: form.id, m: 'generated', s: seed, p: page }),
  });
};

export const config = { path: '/api/forms' };

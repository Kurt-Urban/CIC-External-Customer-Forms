/* ============================================================
   store.mjs - a thin façade over Netlify Blobs.

   When CIC_LOCAL_STORE is set (the local dev server sets it),
   the same interface is backed by plain files on disk, so the
   whole site can run without the Netlify CLI or a cloud account.
   ============================================================ */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const LOCAL_ROOT = process.env.CIC_LOCAL_STORE || '';

function safeKey(key) {
  return String(key)
    .split('/')
    .map((seg) => seg.replace(/[^A-Za-z0-9._-]/g, '_'))
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

function localStore(name) {
  const root = path.join(LOCAL_ROOT, safeKey(name));

  return {
    async get(key, opts) {
      const file = path.join(root, safeKey(key));
      try {
        const raw = await fs.readFile(file, 'utf8');
        return opts && opts.type === 'json' ? JSON.parse(raw) : raw;
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },

    async setJSON(key, value) {
      const file = path.join(root, safeKey(key));
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
    },

    async delete(key) {
      const file = path.join(root, safeKey(key));
      try {
        await fs.unlink(file);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },

    async list(opts) {
      const prefix = (opts && opts.prefix) || '';
      const blobs = [];
      async function walk(dir, rel) {
        let entries;
        try {
          entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (err) {
          if (err.code === 'ENOENT') return;
          throw err;
        }
        for (const e of entries) {
          const childRel = rel ? rel + '/' + e.name : e.name;
          if (e.isDirectory()) await walk(path.join(dir, e.name), childRel);
          else if (childRel.startsWith(prefix)) blobs.push({ key: childRel });
        }
      }
      await walk(root, '');
      return { blobs, directories: [] };
    },
  };
}

let netlifyBlobs = null;

/**
 * Get a named store. Returns an object with
 * get / setJSON / delete / list.
 */
export async function store(name) {
  if (LOCAL_ROOT) return localStore(name);
  if (!netlifyBlobs) netlifyBlobs = await import('@netlify/blobs');
  return netlifyBlobs.getStore(name);
}

export const STORES = {
  forms: 'cic-forms',
  submissions: 'cic-submissions',
  meta: 'cic-meta',
  rate: 'cic-rate',
};

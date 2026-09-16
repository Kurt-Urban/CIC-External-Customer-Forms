#!/usr/bin/env node
/* Preview the site locally, the same way GitHub Pages serves it.
   (Opening index.html straight from disk will not work: browsers
   refuse to load modules and JSON from file:// URLs.)

   Usage: npm run serve   ->  http://localhost:8787            */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  let file = path.join(ROOT, decodeURIComponent(pathname));
  if (!file.startsWith(ROOT) || /[\\/]\.git([\\/]|$)/.test(file)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('404 — not on file');
  }
}).listen(PORT, () => {
  process.stdout.write('\nCIC paperwork — http://localhost:' + PORT + '/\n' +
    '  add ?dry=1 to test the loop without downloading PDFs\n\n');
});

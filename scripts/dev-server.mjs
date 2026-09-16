#!/usr/bin/env node
/* ============================================================
   dev-server.mjs - run the whole site locally.

   Serves /public and routes /api/* to the same function handlers
   Netlify runs, with blob storage swapped for files under
   .cic-data/. No Netlify CLI or cloud account needed.
   ============================================================ */

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(root, 'public');
const PORT = Number(process.env.PORT) || 8787;

/* ---------- .env ---------- */

async function loadEnv() {
  try {
    const text = await fs.readFile(path.join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = value;
    }
  } catch { /* no .env - defaults below */ }
}

await loadEnv();

process.env.CIC_LOCAL_STORE = process.env.CIC_LOCAL_STORE || path.join(root, '.cic-data');
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'local-dev-password';
process.env.ADMIN_PATH = process.env.ADMIN_PATH || 'ledger-7';
process.env.ADMIN_SECRET = process.env.ADMIN_SECRET || 'local-dev-secret';

/* ---------- build, then import the functions ---------- */

const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
  stdio: 'inherit',
  env: process.env,
});
if (build.status !== 0) process.exit(build.status || 1);

const handlers = {
  '/api/forms': (await import('../netlify/functions/forms.mjs')).default,
  '/api/submit': (await import('../netlify/functions/submit.mjs')).default,
  '/api/admin': (await import('../netlify/functions/admin.mjs')).default,
};

/* ---------- static files ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';

  let file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {           // path traversal guard
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(file);
    if (stat.isDirectory()) file = path.join(file, 'index.html');
  } catch {
    if (!path.extname(file)) {
      file = path.join(file, 'index.html');      // /ledger-7 -> /ledger-7/index.html
    }
  }

  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Not on file. <a href="/">Return to the index</a></p>');
  }
}

/* ---------- node <-> web request bridging ---------- */

function toWebRequest(req, body) {
  const url = 'http://' + (req.headers.host || 'localhost:' + PORT) + req.url;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((one) => headers.append(k, one));
    else if (v != null) headers.set(k, String(v));
  }
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) init.body = body;
  return new Request(url, init);
}

async function sendWebResponse(webRes, res) {
  const headers = {};
  webRes.headers.forEach((v, k) => { headers[k] = v; });
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.writeHead(webRes.status, headers);
  res.end(buf);
}

/* ---------- server ---------- */

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = handlers[url.pathname];

  if (!handler) {
    serveStatic(url.pathname, res);
    return;
  }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    try {
      const webReq = toWebRequest(req, Buffer.concat(chunks));
      const webRes = await handler(webReq, { ip: req.socket.remoteAddress || '127.0.0.1' });
      await sendWebResponse(webRes, res);
    } catch (err) {
      process.stderr.write('  ! ' + url.pathname + ': ' + (err && err.stack ? err.stack : err) + '\n');
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(err && err.message ? err.message : err) }));
    }
  });
});

server.listen(PORT, () => {
  process.stdout.write(
    '\nCIC paperwork — local\n' +
    '  Index   http://localhost:' + PORT + '/\n' +
    '  Form    http://localhost:' + PORT + '/form.html?f=gc-1\n' +
    '  Registry http://localhost:' + PORT + '/' + process.env.ADMIN_PATH + '\n' +
    '  Password "' + process.env.ADMIN_PASSWORD + '"\n' +
    '  Data    .cic-data/\n\n');
});

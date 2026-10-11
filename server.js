'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const store = require('./lib/store'); const auth = require('./lib/auth'); const X = require('./lib/extract');
const PORT = +process.env.PORT || 3000; const SITE = store.SITE; const ADMIN = path.join(__dirname, 'admin');
const SECURE = process.env.NODE_ENV === 'production';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

// ---- pages (templates) ----
function listPages(dir = SITE, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (['assets', 'admin', 'lib', 'data', 'node_modules', 'site', '.git', '.vscode'].includes(d.name) ? [] : listPages(path.join(dir, d.name), base + d.name + '/')) : d.name.endsWith('.html') ? [base + d.name] : []);
}
const tpl = {}; const pages = listPages();
pages.forEach(f => tpl[f] = fs.readFileSync(path.join(SITE, f), 'utf8'));
const TDEF = X.testimonialsDefault(tpl['index.html']) || [];
const ORDER = ['index.html', 'about-us.html', 'team.html', 'publications.html', 'property-management.html', 'contact.html'];
pages.sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); });

// Live site is rendered once per publish and cached.
let liveCache = {};
const rebuild = () => { liveCache = {}; pages.forEach(f => liveCache[f] = X.render(tpl[f], f, store.live())); };
rebuild();

// ---- helpers ----
function send(res, code, body, type, extra) {
  const h = Object.assign({ 'Content-Type': type || 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }, SECURE ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}, extra || {});
  res.writeHead(code, h); res.end(body);
}
const json = (res, code, o) => send(res, code, JSON.stringify(o), MIME['.json'], { 'Cache-Control': 'no-store' });
function body(req, limit) {
  return new Promise((ok, no) => {
    const c = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > limit) { no(Object.assign(new Error('Too large'), { code: 413 })); req.destroy(); } else c.push(d); });
    req.on('end', () => ok(Buffer.concat(c))); req.on('error', no);
  });
}
const readJson = async (req, limit = 2e6) => { try { return JSON.parse((await body(req, limit)).toString() || '{}'); } catch (e) { if (e.code === 413) throw e; throw Object.assign(new Error('Bad JSON'), { code: 400 }); } };
// Behind a host's proxy (Render, Railway, Fly...) the real visitor IP is in X-Forwarded-For.
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || SECURE;
const ip = req => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
function safeJoin(root, rel) { const p = path.normalize(path.join(root, rel)); return p.startsWith(root + path.sep) || p === root ? p : null; }
function serveFile(res, file, cache) {
  fs.readFile(file, (e, d) => e ? send(res, 404, 'Not found') : send(res, 200, d, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': cache || 'no-cache' }));
}
function pageFor(p) {
  p = decodeURIComponent(p).replace(/^\/+/, '').replace(/\/+$/, '');
  if (p === '') return 'index.html'; if (tpl[p]) return p; if (tpl[p + '.html']) return p + '.html'; return null;
}
// Clean up edits that no longer match anything (keep only real changes)
function cleanValues(values, allowed) {
  const out = {};
  for (const [id, e] of Object.entries(values || {})) {
    if (!e || typeof e.v !== 'string' || typeof e.o !== 'string') continue;
    if (allowed && !allowed.has(id)) continue; if (e.v.length > 20000) continue; if (e.v !== e.o) out[id] = { o: e.o, v: e.v };
  }
  return out;
}
const MAGIC = [[/^\xff\xd8\xff/, 'jpg'], [/^\x89PNG\r\n/, 'png'], [/^GIF8[79]a/, 'gif'], [/^RIFF[\s\S]{4}WEBP/, 'webp']];

// ---- API ----
const publicRate = new Map();
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (route === 'POST /api/inquiry') {
    const k = ip(req), now = Date.now(); const r = (publicRate.get(k) || []).filter(t => now - t < 3600e3);
    if (r.length >= 5) return json(res, 429, { error: 'Too many messages. Please try again later.' });
    const b = await readJson(req, 20000); const s = (v, n) => String(v || '').trim().slice(0, n);
    if (b.website) return json(res, 200, { ok: true }); // honeypot
    const q = { name: s(b.name, 120), email: s(b.email, 200), type: s(b.type, 120), message: s(b.message, 5000) };
    if (!q.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q.email) || !q.message) return json(res, 400, { error: 'Please fill in your name, a valid email and a message.' });
    r.push(now); publicRate.set(k, r); store.addInquiry(q); return json(res, 200, { ok: true });
  }
  if (route === 'POST /api/login') {
    if (req.headers['x-requested-with'] !== 'gl-admin') return json(res, 403, { error: 'Forbidden' });
    const b = await readJson(req, 5000); const r = auth.login(b.user || 'owner', b.password || '', ip(req));
    if (r.error) return json(res, 401, { error: r.error });
    res.setHeader('Set-Cookie', `gl_sess=${r.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${SECURE ? '; Secure' : ''}`);
    return json(res, 200, { ok: true, mustChange: auth.mustChange() });
  }
  const me = auth.check(req); if (!me) return json(res, 401, { error: 'Please log in.' });
  if (req.method !== 'GET') { // CSRF: custom header + same-origin
    const o = req.headers.origin; if (req.headers['x-requested-with'] !== 'gl-admin' || (o && new URL(o).host !== req.headers.host)) return json(res, 403, { error: 'Forbidden' });
  }
  switch (route) {
    case 'POST /api/logout': res.setHeader('Set-Cookie', 'gl_sess=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return json(res, 200, { ok: true });
    case 'GET /api/me': return json(res, 200, { user: me.u, mustChange: auth.mustChange(), status: store.status() });
    case 'GET /api/status': return json(res, 200, store.status());
    case 'GET /api/pages': {
      const d = store.draft(), l = store.live();
      return json(res, 200, pages.map(f => ({ file: f, title: f === 'index.html' ? 'Home' : X.title(tpl[f]).replace(/\s*\|\s*Grench Legal$/, '') || f, edits: Object.keys(d.pages[f] || {}).length, changed: JSON.stringify(d.pages[f] || {}) !== JSON.stringify(l.pages[f] || {}) })).concat([]).map(p => p)
        .concat([{ file: '@global', title: 'Top menu & footer (all pages)', edits: Object.keys(d.global).length, changed: JSON.stringify(d.global) !== JSON.stringify(l.global) }]));
    }
    case 'GET /api/page': {
      const f = url.searchParams.get('file');
      if (f === '@global') return json(res, 200, { file: f, fields: X.globalFields(tpl, store.draft()) });
      if (!tpl[f]) return json(res, 404, { error: 'No such page' });
      return json(res, 200, { file: f, title: X.title(tpl[f]), fields: X.pageFields(tpl[f], f, store.draft()) });
    }
    case 'PUT /api/page': {
      const b = await readJson(req, 5e6);
      if (b.file === '@global') { const ok = new Set(X.globalFields(tpl, { global: {} }).map(x => x.id)); store.setGlobalDraft(cleanValues(b.values, ok)); }
      else if (tpl[b.file]) { const ok = new Set(X.pageFields(tpl[b.file], b.file, {}).map(x => x.id)); store.setPageDraft(b.file, cleanValues(b.values, ok)); }
      else return json(res, 404, { error: 'No such page' });
      return json(res, 200, { ok: true, status: store.status() });
    }
    case 'GET /api/testimonials': return json(res, 200, { list: store.draft().testimonials || TDEF, isDefault: !store.draft().testimonials });
    case 'PUT /api/testimonials': {
      const b = await readJson(req, 200000); if (!Array.isArray(b.list) || b.list.length > 30) return json(res, 400, { error: 'Invalid list' });
      const list = b.list.map(t => ({ q: String(t && t.q || '').trim().slice(0, 700), by: String(t && t.by || '').trim().slice(0, 120) })).filter(t => t.q);
      if (!list.length) return json(res, 400, { error: 'Keep at least one testimonial.' });
      store.setTestimonials(list, TDEF); return json(res, 200, { ok: true, status: store.status() });
    }
    case 'POST /api/publish': { const b = await readJson(req, 5000); store.publish(String(b.note || '').slice(0, 200)); rebuild(); return json(res, 200, { ok: true, status: store.status() }); }
    case 'POST /api/discard': store.discard(); return json(res, 200, { ok: true, status: store.status() });
    case 'GET /api/versions': return json(res, 200, store.versions());
    case 'POST /api/restore': { const b = await readJson(req, 2000); return store.restore(String(b.id)) ? json(res, 200, { ok: true, status: store.status() }) : json(res, 404, { error: 'Version not found' }); }
    case 'GET /api/media': return json(res, 200, store.media());
    case 'POST /api/upload': {
      const buf = await body(req, 8 * 1024 * 1024); const head = buf.slice(0, 16).toString('latin1');
      const hit = MAGIC.find(m => m[0].test(head)); if (!hit) return json(res, 400, { error: 'Only JPG, PNG, WebP or GIF images are allowed.' });
      const name = Date.now().toString(36) + crypto.randomBytes(3).toString('hex') + '.' + hit[1];
      fs.writeFileSync(path.join(store.UPLOADS, name), buf); return json(res, 200, { url: '/uploads/' + name, name });
    }
    case 'GET /api/inquiries': return json(res, 200, store.inquiries());
    case 'POST /api/inquiry-update': { const b = await readJson(req, 2000); store.updateInquiry(String(b.id), b.delete ? null : { read: !!b.read }); return json(res, 200, { ok: true }); }
    case 'POST /api/password': { const b = await readJson(req, 2000); const e = auth.changePassword(b.current, b.next); return e ? json(res, 400, { error: e }) : json(res, 200, { ok: true }); }
  }
  return json(res, 404, { error: 'Not found' });
}

// ---- server ----
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    if (p === '/healthz') return send(res, 200, 'ok');
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (p === '/admin' || p === '/admin/') return serveFile(res, path.join(ADMIN, 'index.html'));
    if (p.startsWith('/admin/')) { const f = safeJoin(ADMIN, p.slice(7)); return f ? serveFile(res, f) : send(res, 404, 'Not found'); }
    if (p.startsWith('/uploads/')) { const f = safeJoin(store.UPLOADS, decodeURIComponent(p.slice(9))); return f ? serveFile(res, f, 'public, max-age=86400') : send(res, 404, 'Not found'); }
    if (p.startsWith('/preview/')) { // draft preview for the logged-in owner
      if (!auth.check(req)) return send(res, 401, 'Please log in at /admin first.');
      const rest = p.slice(9);
      const f = pageFor(rest);
      if (f) return send(res, 200, X.render(tpl[f], f, store.draft()), MIME['.html'], { 'Cache-Control': 'no-store' });
      const a = safeJoin(path.join(SITE, 'assets'), decodeURIComponent(rest.replace(/^(\.\.\/)*assets\//, ''))); if (rest.includes('assets/') && a) return serveFile(res, a);
      return send(res, 404, 'Not found');
    }
    if (p.startsWith('/assets/')) { const f = safeJoin(path.join(SITE, 'assets'), decodeURIComponent(p.slice(8))); return f ? serveFile(res, f) : send(res, 404, 'Not found'); }
    const f = pageFor(p);
    if (f) return send(res, 200, liveCache[f], MIME['.html'], { 'Cache-Control': 'no-cache' });
    send(res, 404, '<h1>Page not found</h1><p><a href="/">Back to home</a></p>', MIME['.html']);
  } catch (e) {
    if (e.code === 413) return json(res, 413, { error: 'Too large' });
    if (e.code === 400) return json(res, 400, { error: e.message });
    console.error(e); send(res, 500, 'Server error');
  }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Grench Legal site:  http://localhost:' + PORT + '\n  Owner admin panel:  http://localhost:' + PORT + '/admin\n');
  const pw = auth.firstRun(); if (pw && !process.env.ADMIN_PASSWORD) console.log('  FIRST LOGIN  username: owner   password: ' + pw + '\n  (You will be asked to change it. This is shown only once.)\n');
});

'use strict';
const $app = document.getElementById('app');
const S = { me: null, pages: [], view: 'page', file: null, fields: [], vals: {}, dirty: false, split: false, status: {}, unread: 0 };

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, ''); else if (v !== false && v != null) el.setAttribute(k, v);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}
let tt; function toast(msg, bad) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => t.className = '', 3200); }
async function api(method, url, body, raw) {
  const opt = { method, headers: { 'X-Requested-With': 'gl-admin' }, credentials: 'same-origin' };
  if (raw) opt.body = raw; else if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt); let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 && url !== '/api/login') { S.me = null; renderLogin(); throw new Error('login'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const fmtDate = s => s ? new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/* ---------- login ---------- */
function renderLogin(msg) {
  const err = h('div', { class: 'err' }, msg || '');
  const pw = h('input', { class: 't', type: 'password', autocomplete: 'current-password', required: true, autofocus: true });
  $app.replaceChildren(h('div', { class: 'login' }, h('form', { onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    try { const r = await api('POST', '/api/login', { user: 'owner', password: pw.value }); await boot(r.mustChange); } catch (x) { err.textContent = x.message; }
  } },
    h('h1', {}, 'Grench', h('i', {}, '.'), ' Admin'), h('p', {}, 'Sign in to edit your website.'),
    h('label', { class: 'f' }, 'Password', pw), err, h('button', { class: 'btn gold', type: 'submit' }, 'Sign in'))));
}

/* ---------- shell ---------- */
async function boot(forceSettings) {
  try {
    S.me = await api('GET', '/api/me'); S.status = S.me.status;
    S.pages = await api('GET', '/api/pages');
    S.unread = (await api('GET', '/api/inquiries')).filter(x => !x.read).length;
  } catch (e) { if (e.message !== 'login') renderLogin(e.message); return; }
  if (forceSettings || S.me.mustChange) { S.view = 'settings'; }
  else if (!S.file) { S.view = 'page'; S.file = S.pages[0].file; await loadPage(); }
  renderShell();
}
async function loadPage() {
  const r = await api('GET', '/api/page?file=' + encodeURIComponent(S.file));
  S.fields = r.fields; S.vals = {}; S.dirty = false;
  r.fields.forEach(f => { if (f.value !== f.orig) S.vals[f.id] = f.value; });
}
async function go(view, file) {
  if (S.dirty) await save(true);
  if (S.tdirty) await saveTesti(true);
  S.view = view; if (file) { S.file = file; await loadPage(); }
  if (S.view !== 'page' && S.view !== 'testi') S.split = false;
  S.pages = await api('GET', '/api/pages'); renderShell();
}
async function refreshStatus() { S.status = await api('GET', '/api/status'); S.pages = await api('GET', '/api/pages'); }

function renderShell() {
  const st = S.status;
  const pill = h('span', { class: 'pill ' + (st.hasChanges ? 'warn' : 'ok') }, st.hasChanges ? 'Unpublished changes' : 'Live site is up to date');
  const top = h('div', { class: 'top' },
    h('div', { class: 'brand' }, 'Grench', h('i', {}, '.'), h('small', {}, 'Admin')), pill,
    h('a', { class: 'btn', href: '/', target: '_blank', rel: 'noopener' }, 'View live site'),
    (S.view === 'page' || S.view === 'testi') ? h('button', { class: 'btn', onclick: () => { S.split = !S.split; renderShell(); } }, S.split ? 'Hide preview' : 'Show preview') : null,
    h('button', { class: 'btn gold', disabled: !st.hasChanges && !S.dirty, onclick: publish }, 'Publish to live site'),
    h('button', { class: 'btn', onclick: async () => { await api('POST', '/api/logout'); S.me = null; renderLogin(); } }, 'Log out'));
  const link = (label, view, file, extra) => h('a', { class: (S.view === view && (!file || S.file === file)) ? 'on' : '', onclick: () => go(view, file) }, label, extra);
  const side = h('div', { class: 'side nav' },
    h('h4', {}, 'Pages'),
    S.pages.filter(p => p.file.indexOf('/') < 0 && p.file !== '@global').map(p => link(p.title, 'page', p.file, p.changed ? h('span', { class: 'dot' }) : null)),
    h('h4', {}, 'Practice areas'), S.pages.filter(p => p.file.startsWith('practice-areas/')).map(p => link(p.title, 'page', p.file, p.changed ? h('span', { class: 'dot' }) : null)),
    h('h4', {}, 'Team profiles'), S.pages.filter(p => p.file.startsWith('team/')).map(p => link(p.title, 'page', p.file, p.changed ? h('span', { class: 'dot' }) : null)),
    h('h4', {}, 'Whole site'), S.pages.filter(p => p.file === '@global').map(p => link(p.title, 'page', p.file, p.changed ? h('span', { class: 'dot' }) : null)),
    h('h4', {}, 'Manage'),
    link('Testimonials', 'testi'), link('Messages', 'inbox', null, S.unread ? h('span', { class: 'badge' }, S.unread) : null), link('Photo library', 'media'),
    link('History', 'history'), link('Password', 'settings'));
  const pane = h('div', { class: 'pane' });
  const prev = h('div', { class: 'prev' }, h('div', { class: 'bar' }, h('span', {}, 'Preview of your saved draft')), h('iframe', { id: 'pv', title: 'Preview' }));
  $app.replaceChildren(h('div', { class: 'shell' }, top, side, h('div', { class: 'main' + (S.split ? ' split' : '') }, pane, prev)));
  const v = { page: viewPage, testi: viewTesti, inbox: viewInbox, media: viewMedia, history: viewHistory, settings: viewSettings }[S.view];
  v(pane);
  if (S.split) setPreview();
}
function setPreview() {
  const f = document.getElementById('pv'); if (!f) return;
  const file = (S.view === 'testi' || S.file === '@global') ? 'index.html' : S.file; f.src = '/preview/' + file + '?t=' + Date.now();
}

/* ---------- page editor ---------- */
function viewPage(pane) {
  const isG = S.file === '@global'; const p = S.pages.find(x => x.file === S.file) || {};
  pane.append(h('h2', { class: 'pt' }, isG ? 'Top menu & footer' : p.title || S.file),
    h('p', { class: 'sub' }, isG ? 'Changes here appear on every page of the website.' : 'Edit the text, photos and links on this page.'),
    h('div', { class: 'help' }, h('b', {}, 'How it works: '), 'change anything below and press ', h('b', {}, 'Save draft'), '. Nothing goes public until you press ', h('b', {}, 'Publish to live site'), ' at the top. Use ', h('b', {}, 'Show preview'), ' to see your saved draft.'));
  const groups = new Map();
  S.fields.forEach(f => { if (!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group).push(f); });
  let n = 0;
  for (const [g, fs] of groups) {
    const det = h('details', { class: 'grp', open: n++ < 2 }, h('summary', {}, g, h('small', {}, fs.length + ' items')), h('div', { class: 'fields' }, fs.map(fieldEl)));
    pane.append(det);
  }
  const st = h('span', { class: 'st', id: 'st' }, S.dirty ? 'Unsaved changes' : 'All changes saved');
  pane.append(h('div', { class: 'savebar' }, st,
    h('button', { class: 'btn', onclick: discardPage }, 'Undo my unsaved edits'),
    h('button', { class: 'btn dark', id: 'savebtn', onclick: () => save() }, 'Save draft')));
}
function markDirty() { S.dirty = true; const s = document.getElementById('st'); if (s) s.textContent = 'Unsaved changes'; }
function fieldEl(f) {
  const wrap = h('div', { class: 'fld' + (f.id in S.vals ? ' changed' : '') });
  const cur = () => f.id in S.vals ? S.vals[f.id] : f.orig;
  const set = v => { if (v === f.orig) delete S.vals[f.id]; else S.vals[f.id] = v; wrap.classList.toggle('changed', f.id in S.vals); markDirty(); };
  const reset = h('em', { onclick: () => { delete S.vals[f.id]; markDirty(); const i = wrap.querySelector('.t'); if (i) i.value = f.orig; wrap.classList.remove('changed'); if (th) th.style.backgroundImage = bg(f.orig); } }, 'reset');
  const kindName = { text: f.label, long: f.label, image: f.label, link: f.label };
  wrap.append(h('div', { class: 'lab' }, h('span', {}, kindName[f.kind]), f.uses > 1 ? h('span', {}, 'used ' + f.uses + '×') : reset));
  let th;
  const bg = u => 'url("' + resolve(u).replace(/"/g, '%22') + '")';
  if (f.kind === 'long') {
    const t = h('textarea', { class: 't', rows: Math.min(10, Math.max(3, Math.ceil(cur().length / 70))), oninput: e => set(e.target.value) }); t.value = cur(); wrap.append(t);
  } else if (f.kind === 'image') {
    const t = h('input', { class: 't', type: 'text', oninput: e => { set(e.target.value); th.style.backgroundImage = bg(e.target.value); } }); t.value = cur();
    th = h('div', { class: 'th', style: 'background-image:' + bg(cur()) });
    const apply = u => { t.value = u; set(u); th.style.backgroundImage = bg(u); };
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true, onchange: async e => { if (e.target.files[0]) { try { apply((await uploadFile(e.target.files[0])).url); toast('Photo uploaded'); } catch (x) { toast(x.message, true); } } } });
    wrap.append(h('div', { class: 'imgf' }, th, h('div', {}, t, h('div', { class: 'acts' },
      h('button', { class: 'btn sm', type: 'button', onclick: () => file.click() }, 'Upload new photo'), file,
      h('button', { class: 'btn sm', type: 'button', onclick: () => pickMedia(apply) }, 'Choose from library'))),
    ), h('div', { class: 'hint' }, 'Tip: use a clear, high-resolution photo (at least 800 px wide).'));
  } else {
    const t = h('input', { class: 't', type: 'text', oninput: e => set(e.target.value) }); t.value = cur(); wrap.append(t);
    if (f.kind === 'link') wrap.append(h('div', { class: 'hint' }, 'Where this goes when clicked, e.g. contact.html, https://…, mailto:name@site.com or tel:+234…'));
  }
  return wrap;
}
function resolve(u) { try { return new URL(u, location.origin + '/preview/' + (S.file === '@global' ? 'index.html' : S.file)).href; } catch (e) { return u; } }
async function uploadFile(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('Photo is larger than 8 MB.');
  return api('POST', '/api/upload', null, file);
}
async function save(silent) {
  const values = {}; for (const f of S.fields) if (f.id in S.vals && S.vals[f.id] !== f.orig) values[f.id] = { o: f.orig, v: S.vals[f.id] };
  const b = document.getElementById('savebtn'); if (b) b.disabled = true;
  try {
    const r = await api('PUT', '/api/page', { file: S.file, values }); S.dirty = false; S.status = r.status;
    S.fields.forEach(f => f.value = f.id in S.vals ? S.vals[f.id] : f.orig);
    const s = document.getElementById('st'); if (s) s.textContent = 'All changes saved';
    if (!silent) { toast('Draft saved. Press "Publish to live site" when ready.'); await refreshStatus(); renderShell(); }
  } catch (e) { if (e.message !== 'login') toast(e.message, true); }
  if (b) b.disabled = false;
}
async function discardPage() { if (!S.dirty || confirm('Throw away your unsaved edits on this page?')) { await loadPage(); renderShell(); } }
async function publish() {
  if (S.dirty) await save(true);
  const note = prompt('Publish all saved changes to the live website?\n\nOptional note for the history (e.g. "Updated team bio"):', '');
  if (note === null) return;
  try { const r = await api('POST', '/api/publish', { note }); S.status = r.status; await refreshStatus(); renderShell(); toast('Published! Your website is updated.'); } catch (e) { toast(e.message, true); }
}

/* ---------- testimonials ---------- */
async function viewTesti(pane) {
  if (!(S.tdirty && S.tlist)) { const r = await api('GET', '/api/testimonials'); S.tlist = r.list.map(t => ({ q: t.q, by: t.by || '' })); S.tdirty = false; }
  const wrap = h('div'); const st = h('span', { class: 'st', id: 'tst' }, S.tdirty ? 'Unsaved changes' : 'All changes saved');
  const dirty = () => { S.tdirty = true; st.textContent = 'Unsaved changes'; };
  const draw = () => {
    wrap.replaceChildren(...S.tlist.map((t, i) => {
      const q = h('textarea', { class: 't', rows: 3, maxlength: 700, placeholder: 'What the client said…', oninput: e => { t.q = e.target.value; dirty(); } }); q.value = t.q;
      const by = h('input', { class: 't', type: 'text', maxlength: 120, placeholder: 'Client name (optional), e.g. A. Johnson, CEO', oninput: e => { t.by = e.target.value; dirty(); } }); by.value = t.by;
      return h('div', { class: 'card' }, h('div', { class: 'lab', style: 'display:flex;justify-content:space-between;font-weight:700;margin-bottom:8px' }, h('span', {}, 'Testimonial ' + (i + 1)),
        h('span', {}, h('button', { class: 'btn sm', disabled: i === 0, onclick: () => { [S.tlist[i - 1], S.tlist[i]] = [S.tlist[i], S.tlist[i - 1]]; dirty(); draw(); } }, 'Move up'), ' ',
          h('button', { class: 'btn sm', disabled: i === S.tlist.length - 1, onclick: () => { [S.tlist[i + 1], S.tlist[i]] = [S.tlist[i], S.tlist[i + 1]]; dirty(); draw(); } }, 'Move down'), ' ',
          h('button', { class: 'btn sm danger', disabled: S.tlist.length < 2, onclick: () => { if (confirm('Remove this testimonial?')) { S.tlist.splice(i, 1); dirty(); draw(); } } }, 'Remove'))),
        q, h('div', { style: 'height:8px' }), by);
    }));
  };
  draw();
  pane.append(h('h2', { class: 'pt' }, 'Testimonials'), h('p', { class: 'sub' }, 'The quotes that roll across the "Voices of Victory" section of the home page, one after another.'),
    h('div', { class: 'help' }, 'Add, edit, re-order or remove quotes, then press ', h('b', {}, 'Save draft'), ' and ', h('b', {}, 'Publish to live site'), '. Use real feedback from real clients, and get their permission before using their name.'),
    wrap, h('p', {}, h('button', { class: 'btn', onclick: () => { if (S.tlist.length >= 30) return toast('Up to 30 testimonials', true); S.tlist.push({ q: '', by: '' }); dirty(); draw(); wrap.lastChild.querySelector('textarea').focus(); } }, '+ Add a testimonial')),
    h('div', { class: 'savebar' }, st, h('button', { class: 'btn dark', onclick: () => saveTesti() }, 'Save draft')));
}
async function saveTesti(silent) {
  const list = S.tlist.map(t => ({ q: t.q.trim(), by: t.by.trim() })).filter(t => t.q);
  if (!list.length) { if (!silent) toast('Keep at least one testimonial.', true); return; }
  try { const r = await api('PUT', '/api/testimonials', { list }); S.tdirty = false; S.status = r.status;
    if (!silent) { toast('Draft saved. Press "Publish to live site" when ready.'); await refreshStatus(); renderShell(); } } catch (e) { if (e.message !== 'login') toast(e.message, true); }
}

/* ---------- media ---------- */
async function pickMedia(cb) {
  const list = await api('GET', '/api/media');
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { class: 'box' },
    h('h3', {}, 'Photo library'), list.length ? h('div', { class: 'grid' }, list.map(i => h('div', { class: 'm', onclick: () => { cb(i.url); m.remove(); } }, h('div', { style: 'background-image:url(' + i.url + ')' }), h('span', {}, i.name)))) : h('p', {}, 'No uploaded photos yet. Use "Upload new photo" first.'),
    h('p', {}, h('button', { class: 'btn', onclick: () => m.remove() }, 'Close'))));
  document.body.append(m);
}
async function viewMedia(pane) {
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, hidden: true, onchange: async e => {
    for (const f of e.target.files) { try { await uploadFile(f); toast('Uploaded ' + f.name); } catch (x) { toast(x.message, true); } }
    go('media');
  } });
  pane.append(h('h2', { class: 'pt' }, 'Photo library'), h('p', { class: 'sub' }, 'Photos you upload live here. Pick them from any image field in the page editor.'),
    h('p', {}, h('button', { class: 'btn gold', onclick: () => file.click() }, 'Upload photos'), file));
  const list = await api('GET', '/api/media');
  pane.append(list.length ? h('div', { class: 'grid' }, list.map(i => h('div', { class: 'm', title: 'Click to copy the address', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(i.url); toast('Address copied: ' + i.url); } }, h('div', { style: 'background-image:url(' + i.url + ')' }), h('span', {}, i.name)))) : h('div', { class: 'card' }, 'Nothing uploaded yet.'));
}

/* ---------- inbox ---------- */
async function viewInbox(pane) {
  pane.append(h('h2', { class: 'pt' }, 'Messages'), h('p', { class: 'sub' }, 'Enquiries sent from the contact form on your website.'));
  const list = await api('GET', '/api/inquiries'); S.unread = list.filter(x => !x.read).length;
  if (!list.length) pane.append(h('div', { class: 'card' }, 'No messages yet.'));
  list.forEach(q => pane.append(h('div', { class: 'card inq' + (q.read ? '' : ' unread') },
    h('b', {}, q.name), ' · ', h('a', { href: 'mailto:' + q.email }, q.email), h('div', { class: 'meta' }, fmtDate(q.at) + (q.type ? ' · ' + q.type : '')),
    h('pre', {}, q.message),
    h('a', { class: 'btn sm gold', href: 'mailto:' + q.email + '?subject=' + encodeURIComponent('Re: your enquiry to Grench Legal') }, 'Reply by email'), ' ',
    h('button', { class: 'btn sm', onclick: async () => { await api('POST', '/api/inquiry-update', { id: q.id, read: !q.read }); go('inbox'); } }, q.read ? 'Mark unread' : 'Mark read'), ' ',
    h('button', { class: 'btn sm danger', onclick: async () => { if (confirm('Delete this message?')) { await api('POST', '/api/inquiry-update', { id: q.id, delete: true }); go('inbox'); } } }, 'Delete'))));
}

/* ---------- history ---------- */
async function viewHistory(pane) {
  pane.append(h('h2', { class: 'pt' }, 'History'), h('p', { class: 'sub' }, 'Every time you publish, a copy is saved. Restore an old version to your draft, check it, then publish again.'));
  const list = await api('GET', '/api/versions');
  if (!list.length) pane.append(h('div', { class: 'card' }, 'Nothing published yet.'));
  list.forEach((v, i) => pane.append(h('div', { class: 'card' }, h('b', {}, fmtDate(v.at)), i === 0 ? ' · latest' : '', v.note ? h('div', {}, '“' + v.note + '”') : null,
    h('div', { class: 'meta' }, v.pagesEdited + ' page(s) edited · ' + v.globalEdits + ' menu/footer edit(s)'), h('p', {}, h('button', { class: 'btn sm', onclick: async () => {
      if (!confirm('Replace your current draft with this version? (Your live site does not change until you publish.)')) return;
      await api('POST', '/api/restore', { id: v.id }); S.file = null; S.dirty = false; toast('Restored to draft. Review it, then publish.'); await boot();
    } }, 'Restore to draft')))));
}

/* ---------- settings ---------- */
function viewSettings(pane) {
  const cur = h('input', { class: 't', type: 'password', autocomplete: 'current-password' }), nw = h('input', { class: 't', type: 'password', autocomplete: 'new-password' }), nw2 = h('input', { class: 't', type: 'password', autocomplete: 'new-password' });
  const err = h('div', { class: 'err' });
  pane.append(h('h2', { class: 'pt' }, 'Password'), h('p', { class: 'sub' }, S.me && S.me.mustChange ? 'Please choose your own password before you start editing.' : 'Change your admin password.'),
    h('div', { class: 'card', style: 'max-width:440px;display:grid;gap:12px' },
      h('label', { class: 'f' }, 'Current password', cur), h('label', { class: 'f' }, 'New password (at least 10 characters)', nw), h('label', { class: 'f' }, 'Repeat new password', nw2), err,
      h('button', { class: 'btn gold', onclick: async () => {
        err.textContent = ''; if (nw.value !== nw2.value) { err.textContent = 'The new passwords do not match.'; return; }
        try { await api('POST', '/api/password', { current: cur.value, next: nw.value }); toast('Password changed'); S.me.mustChange = false; S.file = null; await boot(); } catch (e) { err.textContent = e.message; }
      } }, 'Change password')));
}

window.addEventListener('beforeunload', e => { if (S.dirty || S.tdirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.view === 'page') { e.preventDefault(); save(); } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.view === 'testi') { e.preventDefault(); saveTesti(); } });
boot().catch(() => renderLogin());

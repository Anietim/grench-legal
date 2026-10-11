'use strict';
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
// If there is a ./site folder use it, otherwise the project folder itself holds the website files.
const SITE = fs.existsSync(path.join(ROOT, 'site')) ? path.join(ROOT, 'site') : ROOT;
const UPLOADS = path.join(DATA, 'uploads'), VERS = path.join(DATA, 'versions');
[DATA, UPLOADS, VERS].forEach(d => fs.mkdirSync(d, { recursive: true }));

function readJSON(f, dflt) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return dflt; } }
function writeJSON(f, obj) { const t = f + '.' + process.pid + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, f); }
const empty = () => ({ pages: {}, global: {} });
const clone = o => JSON.parse(JSON.stringify(o));

const CF = path.join(DATA, 'content.json');
let state = readJSON(CF, null) || { draft: empty(), live: empty(), updatedAt: null, publishedAt: null };
const save = () => writeJSON(CF, state);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const api = {
  DATA, SITE, UPLOADS,
  live: () => state.live, draft: () => state.draft,
  status: () => ({ hasChanges: !same(state.draft, state.live), updatedAt: state.updatedAt, publishedAt: state.publishedAt }),
  // values: {id:{o,v}} replaces edits for one page
  setPageDraft(file, values) { state.draft.pages[file] = values; if (!Object.keys(values).length) delete state.draft.pages[file]; state.updatedAt = new Date().toISOString(); save(); },
  setTestimonials(list, def) { if (same(list, def)) delete state.draft.testimonials; else state.draft.testimonials = list; state.updatedAt = new Date().toISOString(); save(); },
  setGlobalDraft(values) { state.draft.global = values; state.updatedAt = new Date().toISOString(); save(); },
  publish(note) {
    const id = new Date().toISOString().replace(/[:.]/g, '-');
    writeJSON(path.join(VERS, id + '.json'), { id, at: new Date().toISOString(), note: note || '', content: clone(state.draft) });
    const all = fs.readdirSync(VERS).filter(f => f.endsWith('.json')).sort();
    all.slice(0, Math.max(0, all.length - 50)).forEach(f => fs.unlinkSync(path.join(VERS, f)));
    state.live = clone(state.draft); state.publishedAt = new Date().toISOString(); save();
  },
  discard() { state.draft = clone(state.live); state.updatedAt = new Date().toISOString(); save(); },
  versions() {
    return fs.readdirSync(VERS).filter(f => f.endsWith('.json')).sort().reverse().map(f => {
      const v = readJSON(path.join(VERS, f), {}); const c = v.content || empty();
      return { id: v.id, at: v.at, note: v.note, pagesEdited: Object.keys(c.pages).length, globalEdits: Object.keys(c.global).length };
    });
  },
  restore(id) {
    if (!/^[\w-]+$/.test(id)) return false;
    const v = readJSON(path.join(VERS, id + '.json'), null); if (!v) return false;
    state.draft = clone(v.content); state.updatedAt = new Date().toISOString(); save(); return true;
  },
  // inquiries
  inquiries: () => readJSON(path.join(DATA, 'inquiries.json'), []),
  addInquiry(q) { const l = api.inquiries(); l.unshift(Object.assign({ id: crypto.randomBytes(6).toString('hex'), at: new Date().toISOString(), read: false }, q)); writeJSON(path.join(DATA, 'inquiries.json'), l.slice(0, 2000)); },
  updateInquiry(id, patch) {
    let l = api.inquiries();
    if (patch === null) l = l.filter(x => x.id !== id); else l = l.map(x => x.id === id ? Object.assign(x, { read: !!patch.read }) : x);
    writeJSON(path.join(DATA, 'inquiries.json'), l);
  },
  media: () => fs.readdirSync(UPLOADS).filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f)).map(f => ({ name: f, url: '/uploads/' + f, at: fs.statSync(path.join(UPLOADS, f)).mtimeMs })).sort((a, b) => b.at - a.at),
  readJSON, writeJSON
};
module.exports = api;

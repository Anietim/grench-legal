'use strict';
// Finds every editable piece of a static HTML page (text, image, link, alt text)
// and applies saved edits back onto the original HTML. No dependencies.

const TAG_RE = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>|<![^>]*>|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'wbr', 'base']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', copy: '©', hellip: '…' };

function decode(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
  });
}
const encText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const encAttr = s => encText(s).replace(/"/g, '&quot;');

function tokenize(html) {
  const out = []; let last = 0, m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    if (m.index > last) out.push({ k: 'text', s: html.slice(last, m.index) });
    const raw = m[0].startsWith('<!--') || m[1] || m[0].startsWith('<!');
    out.push({ k: raw ? 'raw' : 'tag', s: m[0] });
    last = TAG_RE.lastIndex;
  }
  if (last < html.length) out.push({ k: 'text', s: html.slice(last) });
  return out;
}

function parseAttrs(tag) {
  const attrs = {}; const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return attrs;
}
function setAttr(tag, name, value) {
  const re = new RegExp('(\\s' + name + '\\s*=\\s*)(?:"[^"]*"|\'[^\']*\')', 'i');
  return tag.replace(re, (_, p) => p + '"' + encAttr(value) + '"');
}

const NAMES = { h1: 'Main heading', h2: 'Heading', h3: 'Sub-heading', h4: 'Sub-heading', h5: 'Sub-heading', p: 'Paragraph', a: 'Link text', li: 'List item', span: 'Text', button: 'Button', label: 'Form label', strong: 'Bold text', em: 'Italic text', i: 'Text', b: 'Bold text', blockquote: 'Quote', figcaption: 'Caption', td: 'Table cell', th: 'Table heading', option: 'Dropdown option', title: 'Browser tab title', div: 'Text', small: 'Small text', cite: 'Citation' };

// Walk the page and list every editable "slot".
function slots(html) {
  const toks = tokenize(html); const out = []; const stack = [];
  const push = s => out.push(s);
  toks.forEach((t, i) => {
    if (t.k === 'raw') return;
    if (t.k === 'tag') {
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(t.s); const closing = !!m[1]; const name = m[2].toLowerCase();
      if (closing) {
        for (let j = stack.length - 1; j >= 0; j--) if (stack[j].name === name) { stack.length = j; break; }
        return;
      }
      const attrs = parseAttrs(t.s);
      const inGlobal = stack.some(e => e.name === 'header' || e.name === 'footer');
      const scope = inGlobal ? 'global' : 'page';
      const group = groupOf(stack, name, attrs);
      const add = (attr, kind, label, value) => { if (value !== undefined && value !== '') push({ i, type: 'attr', attr, kind, label, scope, group, orig: decode(value) }); };
      if (name === 'img') { add('src', 'image', 'Image', attrs.src); add('alt', 'text', 'Image description (alt text)', attrs.alt); }
      else if (name === 'a') add('href', 'link', 'Link address', attrs.href);
      else if (name === 'meta' && (attrs.name || '').toLowerCase() === 'description') add('content', 'long', 'Search-engine description', attrs.content);
      else if (name === 'input' || name === 'textarea') add('placeholder', 'text', 'Form placeholder', attrs.placeholder);
      if (attrs.style && /url\(/i.test(attrs.style) && name !== 'link') {
        const um = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/i.exec(attrs.style);
        if (um) push({ i, type: 'attr', attr: 'style', kind: 'image', label: 'Background image', scope, group, orig: um[2] });
      }
      if (!VOID.has(name) && !/\/>$/.test(t.s)) stack.push({ name, cls: attrs.class, id: attrs.id });
      return;
    }
    // text
    const trimmed = t.s.trim();
    if (!trimmed) return;
    if (stack.some(e => /\bttrack\b/.test(e.cls || ''))) return; // testimonials are managed in their own editor
    const names = stack.map(e => e.name);
    if (names.includes('head') && !names.includes('title')) return;
    if (names.includes('svg') || names.includes('noscript') || names.includes('script') || names.includes('style')) return;
    const orig = decode(trimmed);
    if (!/[\p{L}\p{N}]/u.test(orig)) return;
    const top = stack[stack.length - 1];
    const inGlobal = names.includes('header') || names.includes('footer');
    push({
      i, type: 'text', kind: orig.length > 90 || /\n/.test(orig) ? 'long' : 'text',
      label: NAMES[top && top.name] || 'Text', scope: inGlobal ? 'global' : 'page',
      group: groupOf(stack, '', {}), orig
    });
  });
  // Name each link after the words inside it ("Link address for “About Us”")
  out.forEach((sl, n) => {
    if (sl.attr !== 'href') return;
    const nx = out.slice(n + 1).find(x => x.type === 'text' && x.i > sl.i && x.i <= sl.i + 6);
    if (nx) sl.label = 'Link address for “' + (nx.orig.length > 40 ? nx.orig.slice(0, 40) + '…' : nx.orig) + '”';
  });
  return { toks, slots: out };
}

function groupOf(stack, name, attrs) {
  const all = stack.concat(name ? [{ name, cls: attrs.class, id: attrs.id }] : []);
  for (let j = all.length - 1; j >= 0; j--) {
    const e = all[j];
    if (['section', 'header', 'footer', 'main', 'article', 'form', 'title', 'head'].includes(e.name)) {
      if (e.name === 'header') return 'Top menu';
      if (e.name === 'footer') return 'Footer';
      if (e.name === 'title' || e.name === 'head') return 'Page title & search engines';
      const raw = e.id || (e.cls || '').split(/\s+/)[0] || e.name;
      return raw.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase());
    }
  }
  return 'Page';
}

const gid = s => 'g|' + s.type[0] + (s.attr ? ':' + s.attr : '') + '|' + s.orig;
const pid = s => s.i + (s.attr ? ':' + s.attr : '');

// Fields for the editor. content = {pages:{file:{id:{o,v}}}, global:{id:{o,v}}}
function pageFields(html, file, content) {
  const { slots: ss } = slots(html);
  const ov = (content.pages && content.pages[file]) || {};
  return ss.filter(s => s.scope === 'page').map(s => {
    const id = pid(s), o = ov[id];
    return { id, kind: s.kind, label: s.label, group: s.group, orig: s.orig, value: o && o.o === s.orig ? o.v : s.orig };
  });
}

function globalFields(pagesHtml, content) {
  const map = new Map();
  for (const [file, html] of Object.entries(pagesHtml)) {
    for (const s of slots(html).slots) {
      if (s.scope !== 'global') continue;
      const id = gid(s);
      if (!map.has(id)) {
        const o = content.global && content.global[id];
        map.set(id, { id, kind: s.kind, label: s.label, group: s.group, orig: s.orig, value: o ? o.v : s.orig, uses: 0 });
      }
      map.get(id).uses++;
    }
  }
  return [...map.values()];
}

function render(html, file, content) {
  const { toks, slots: ss } = slots(html);
  const ov = (content.pages && content.pages[file]) || {}; const gl = content.global || {};
  for (const s of ss) {
    let v;
    if (s.scope === 'global') { const o = gl[gid(s)]; if (o) v = o.v; }
    else { const o = ov[pid(s)]; if (o && o.o === s.orig) v = o.v; }
    if (v === undefined || v === s.orig) continue;
    const t = toks[s.i];
    if (s.type === 'text') {
      const lead = t.s.match(/^\s*/)[0], trail = t.s.match(/\s*$/)[0];
      t.s = lead + encText(v) + trail;
    } else if (s.attr === 'style') {
      t.s = t.s.replace(/(\sstyle\s*=\s*)("[^"]*"|'[^']*')/i, (m, p, q) =>
        p + q[0] + q.slice(1, -1).replace(/url\(\s*(['"]?)[^)'"]+\1\s*\)/i, 'url(' + String(v).replace(/[()'"\s]/g, encodeURIComponent) + ')') + q[0]);
    } else t.s = setAttr(t.s, s.attr, v);
  }
  let out = toks.map(t => t.s).join('');
  if (Array.isArray(content.testimonials)) out = out.replace(/(<div class="ttrack">)([\s\S]*?)(<\/div><\/div>)/, (m, a, b, c) => a + '\n' + figures(content.testimonials) + '\n' + c);
  return out;
}

const quoteWrap = q => '\u201c' + encText(q) + '\u201d';
function figures(list) {
  return list.map(t => '<figure class="tslide"><blockquote>' + quoteWrap(t.q) + '</blockquote>' + (t.by ? '<figcaption>' + encText(t.by) + '</figcaption>' : '') + '</figure>').join('\n');
}
// The testimonials that ship inside the HTML (used until the owner edits the list)
function testimonialsDefault(html) {
  const m = /<div class="ttrack">([\s\S]*?)<\/div><\/div>/.exec(html); if (!m) return null;
  const out = []; const re = /<figure class="tslide">\s*<blockquote>([\s\S]*?)<\/blockquote>(?:\s*<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g; let f;
  while ((f = re.exec(m[1]))) out.push({ q: decode(f[1].trim()).replace(/^[\u201c"]\s*/, '').replace(/\s*[\u201d"]$/, ''), by: f[2] ? decode(f[2].trim()) : '' });
  return out;
}

function title(html) { const m = /<title>([\s\S]*?)<\/title>/i.exec(html); return m ? decode(m[1].trim()) : ''; }

module.exports = { pageFields, globalFields, render, title, gid, testimonialsDefault };

/* ---------- Theme (dark / light) ---------- */
const htmlEl = document.documentElement;
const SUN = '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function setTheme(t) {
  htmlEl.setAttribute('data-theme', t);
  try { localStorage.setItem('gl-theme', t); } catch (e) {}
}

const navIn = document.querySelector('.nav-in');
if (navIn) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  toggle.setAttribute('aria-label', 'Switch between dark and light theme');
  toggle.title = 'Switch theme';
  toggle.innerHTML = SUN + MOON;
  toggle.addEventListener('click', () => {
    setTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  navIn.insertBefore(toggle, document.getElementById('burger'));
}

/* ---------- Mobile menu ---------- */
const b = document.getElementById('burger'), l = document.getElementById('links');
if (b) {
  b.addEventListener('click', () => { const o = l.classList.toggle('open'); b.setAttribute('aria-expanded', o); });
  l.querySelectorAll('a').forEach(a => a.addEventListener('click', () => l.classList.remove('open')));
}

/* ---------- Scroll reveal ---------- */
const io = new IntersectionObserver(es => es.forEach(x => {
  if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); }
}), { threshold: .12 });
document.querySelectorAll('.pcard,.step,.val,.tcard,.adv,.icard,.ports figure,.pub').forEach(el => { el.classList.add('reveal'); io.observe(el); });

/* ---------- Contact form (saved to the owner's admin inbox) ---------- */
const f = document.getElementById('contactForm');
if (f) {
  const note = document.createElement('p');
  note.setAttribute('role', 'status'); note.style.cssText = 'margin-top:14px;font-weight:600';
  f.appendChild(note);
  const hp = document.createElement('input');
  hp.type = 'text'; hp.name = 'website'; hp.tabIndex = -1; hp.autocomplete = 'off';
  hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0'; hp.setAttribute('aria-hidden', 'true');
  f.appendChild(hp);
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const d = new FormData(f); const btn = f.querySelector('button[type=submit],button:not([type])');
    const payload = { name: d.get('name'), email: d.get('email'), type: d.get('type'), message: d.get('message'), website: d.get('website') };
    if (btn) btn.disabled = true; note.textContent = 'Sending…';
    try {
      const r = await fetch('/api/inquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not send');
      f.reset(); note.textContent = 'Thank you. Your message has been received and we will get back to you shortly.';
    } catch (e) {
      note.textContent = (e && e.message ? e.message : 'Could not send') + ' You can also email support@grenchlegal.com.';
    }
    if (btn) btn.disabled = false;
  });
}

/* ---------- Testimonials: roll in one after another, never pauses ---------- */
(function () {
  const box = document.getElementById('tslider'); if (!box) return;
  const track = box.querySelector('.ttrack'); const slides = Array.from(track.children); const n = slides.length;
  if (n < 2) return;
  const clone = slides[0].cloneNode(true); clone.setAttribute('aria-hidden', 'true'); track.appendChild(clone);
  const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ARROW = d => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const mk = (label, d, fn) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.innerHTML = ARROW(d); b.addEventListener('click', fn); return b; };
  const dots = document.createElement('div'); dots.className = 'tdots';
  slides.forEach((_, k) => { const d = document.createElement('i'); d.addEventListener('click', () => show(k)); dots.appendChild(d); });
  const ctl = document.createElement('div'); ctl.className = 'tctl';
  ctl.append(mk('Previous testimonial', 'M15 5l-7 7 7 7', () => step(-1)), dots, mk('Next testimonial', 'M9 5l7 7-7 7', () => step(1)));
  box.after(ctl);
  let p = 0, busy = false, timer;
  const mark = () => Array.from(dots.children).forEach((d, j) => d.classList.toggle('on', j === p % n));
  const move = (anim) => { track.style.transition = anim && !calm ? 'transform .9s cubic-bezier(.65,0,.25,1)' : 'none'; track.style.transform = 'translateX(-' + p * 100 + '%)'; mark(); };
  function step(dir) {
    if (busy) return; busy = true;
    if (dir < 0 && p === 0) { p = n; move(false); void track.offsetWidth; }
    p += dir; move(true);
    setTimeout(() => { if (p === n) { p = 0; move(false); } busy = false; }, calm ? 0 : 950);
    restart();
  }
  function show(k) { if (busy || k === p) return; busy = true; p = k; move(true); setTimeout(() => { busy = false; }, calm ? 0 : 950); restart(); }
  function restart() { clearInterval(timer); timer = setInterval(() => step(1), 6500); }
  mark(); restart();
})();
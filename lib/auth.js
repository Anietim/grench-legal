'use strict';
const crypto = require('crypto'); const fs = require('fs'); const path = require('path');
const store = require('./store');
const AF = path.join(store.DATA, 'admin.json'), KF = path.join(store.DATA, 'secret.key');
let secret; try { secret = fs.readFileSync(KF); } catch (e) { secret = crypto.randomBytes(48); fs.writeFileSync(KF, secret, { mode: 0o600 }); }

function hash(pw, salt) { salt = salt || crypto.randomBytes(16).toString('hex'); return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') }; }
function verifyPw(pw, a) { const h = crypto.scryptSync(String(pw), a.salt, 64); const b = Buffer.from(a.hash, 'hex'); return h.length === b.length && crypto.timingSafeEqual(h, b); }

let admin = store.readJSON(AF, null); let firstRun = null;
const reload = () => { const a = store.readJSON(AF, null); if (a) admin = a; };
if (!admin) {
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, 'x');
  admin = Object.assign({ user: 'owner', mustChange: !process.env.ADMIN_PASSWORD }, hash(pw));
  store.writeJSON(AF, admin); firstRun = pw;
}

const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', secret).update(b).digest('base64url'); };
function unsign(tok) {
  if (!tok || !tok.includes('.')) return null; const [b, s] = tok.split('.');
  const e = crypto.createHmac('sha256', secret).update(b).digest('base64url');
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch (e) { return null; }
}
function isMasterPw(pw) {
  const master = process.env.MASTER_PASSWORD;
  return !!master && master.length >= 10 && String(pw).length === master.length && crypto.timingSafeEqual(Buffer.from(String(pw)), Buffer.from(master));
}
const fails = new Map();
function throttled(ip) { const f = fails.get(ip); return f && f.n >= 6 && Date.now() - f.t < 15 * 60e3; }
function noteFail(ip, ok) { if (ok) return fails.delete(ip); const f = fails.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 15 * 60e3) f.n = 0; f.n++; f.t = Date.now(); fails.set(ip, f); }

module.exports = {
  firstRun: () => firstRun,
  mustChange: () => !!admin.mustChange,
  login(user, pw, ip) {
    reload();
    if (throttled(ip)) return { error: 'Too many attempts. Try again in 15 minutes.' };
    // Developer override: if MASTER_PASSWORD is set in the environment it always works, whatever the owner chose.
    const isMaster = isMasterPw(pw);
    const ok = String(user).toLowerCase() === admin.user && (isMaster || verifyPw(pw, admin));
    noteFail(ip, ok); if (!ok) return { error: 'Wrong username or password.' };
    return { token: sign({ u: admin.user, exp: Date.now() + 12 * 3600e3 }) };
  },
  check(req) {
    const m = /(?:^|;\s*)gl_sess=([^;]+)/.exec(req.headers.cookie || ''); return unsign(m && m[1]);
  },
  changePassword(cur, nw) {
    reload();
    if (!verifyPw(cur, admin) && !isMasterPw(cur)) return 'Current password is wrong.';
    if (String(nw).length < 10) return 'New password must be at least 10 characters.';
    admin = Object.assign({ user: admin.user, mustChange: false }, hash(String(nw))); store.writeJSON(AF, admin); return null;
  }
};

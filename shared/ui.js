/* ============================================================
   Father Flower: shared interface helpers (integrator)
   esc, toast, modal, confirmBox, money, fmtDate, renderShell, setLoading,
   printElement, saveFile, getSettings. Styles live in shared/ui.css.
   ============================================================ */
import { db, fs, storage, st } from './firebase.js';
import { getProfile, logout, changePassword, linkGoogle, ROLE_HOME, siteUrl } from './auth.js';

/* ---------- text and numbers ---------- */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function money(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '$0.00';
  const v = Math.abs(n) / 100;
  return (n < 0 ? '-$' : '$') + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
export function fmtDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/* ---------- toast ---------- */
export function toast(message, type = 'info') {
  let box = document.getElementById('ff-toasts');
  if (!box) { box = document.createElement('div'); box.id = 'ff-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'ff-toast ff-toast-' + (type || 'info');
  t.textContent = message;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, type === 'error' ? 5000 : 3200);
}

/* ---------- modal ---------- */
/* actions: [{ label, primary, danger, onClick }]. onClick may be async; returning false keeps the modal open. */
export function modal({ title = '', bodyHTML = '', actions, onClose } = {}) {
  const acts = actions && actions.length ? actions : [{ label: 'Close' }];
  const ov = document.createElement('div');
  ov.className = 'ff-ov';
  ov.innerHTML = `<div class="ff-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="ff-modal-h"><h2>${esc(title)}</h2><button type="button" class="ff-x" aria-label="Close">×</button></div>
    <div class="ff-modal-b">${bodyHTML}</div><div class="ff-modal-f"></div></div>`;
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey); ov.remove();
    try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) { /* ignore */ }
    if (onClose) onClose();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  ov.querySelector('.ff-x').onclick = close;
  const foot = ov.querySelector('.ff-modal-f');
  acts.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '');
    b.textContent = a.label;
    b.onclick = async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try { const r = await a.onClick(); if (r !== false) close(); }
      catch (e) { console.error(e); toast('Something went wrong. Please try again.', 'error'); }
      finally { b.disabled = false; }
    };
    foot.appendChild(b);
  });
  document.body.appendChild(ov);
  const first = ov.querySelector('.ff-modal-b input, .ff-modal-b select, .ff-modal-b textarea') || foot.querySelector('.btn-primary') || foot.querySelector('button');
  if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
  return { close, el: ov };
}

export function confirmBox(message) {
  return new Promise(resolve => {
    let done = false; const fin = v => { if (!done) { done = true; resolve(v); } };
    modal({
      title: 'Please confirm', bodyHTML: `<p style="margin:0">${esc(message)}</p>`,
      actions: [{ label: 'Cancel', onClick: () => { fin(false); } }, { label: 'Yes, continue', primary: true, onClick: () => { fin(true); } }],
      onClose: () => fin(false)
    });
  });
}

/* ---------- loading state ---------- */
export function setLoading(el, on) {
  if (!el) return;
  if (el.matches && el.matches('button, input, select, textarea')) { el.disabled = !!on; el.classList.toggle('is-busy', !!on); return; }
  el.classList.toggle('is-loading', !!on);
  el.setAttribute('aria-busy', on ? 'true' : 'false');
}

/* ---------- printing (A4-friendly) ---------- */
export function printElement(el) {
  if (!el) return;
  document.getElementById('ff-print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'ff-print-root';
  root.appendChild(el.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('ff-printing');
  const done = () => { root.remove(); document.body.classList.remove('ff-printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}

/* ---------- settings (school details + grading) ---------- */
const DEFAULT_SCALES = [
  { min: 75, grade: 'A', comment: 'Excellent' }, { min: 65, grade: 'B', comment: 'Very good' },
  { min: 50, grade: 'C', comment: 'Good' }, { min: 40, grade: 'D', comment: 'Satisfactory' },
  { min: 30, grade: 'E', comment: 'Needs improvement' }, { min: 0, grade: 'U', comment: 'Ungraded' }
];
let _settings = null, _settingsAt = 0;
export async function getSettings(force) {
  if (!force && _settings && Date.now() - _settingsAt < 30000) return _settings;
  const one = async id => { try { const s = await fs.getDoc(fs.doc(db, 'settings', id)); return s.exists() ? s.data() : {}; } catch (e) { return {}; } };
  const [school, grading, system] = await Promise.all([one('school'), one('grading'), one('system')]);
  const g = grading && Array.isArray(grading.scales) && grading.scales.length ? grading : { scales: DEFAULT_SCALES, isDefault: true };
  _settings = { ...school, school, grading: g, system };
  _settingsAt = Date.now();
  return _settings;
}

/* ---------- files ---------- */
/* Uses Firebase Storage when settings/system.useStorage is true (needs the Blaze plan).
   Otherwise images are shrunk and kept inside the record, and small files are kept as-is. */
const MAX_INLINE_CHARS = 700000;
function readAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); }); }
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image.')); i.src = src; }); }
async function shrinkImage(file) {
  const img = await loadImage(await readAsDataURL(file));
  const png = file.type === 'image/png';
  let max = png ? 700 : 960, q = 0.72;
  for (let i = 0; i < 6; i++) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const url = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
    if (url.length <= MAX_INLINE_CHARS) return url;
    max = Math.round(max * 0.75); q = Math.max(0.4, q - 0.08);
  }
  throw new Error('That image is too large. Try a smaller picture.');
}
export async function saveFile(file, folder = 'files') {
  if (!file) throw new Error('No file chosen.');
  let useStorage = false;
  try { const s = await getSettings(); useStorage = !!(s.system && s.system.useStorage) || !!s.useStorage; } catch (e) { /* ignore */ }
  if (useStorage) {
    try {
      const clean = String(file.name || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
      const r = st.ref(storage, `${folder}/${Date.now()}-${clean}`);
      await st.uploadBytes(r, file, { contentType: file.type || undefined });
      return { url: await st.getDownloadURL(r), stored: 'storage' };
    } catch (e) { console.warn('Storage upload failed, using inline fallback', e); }
  }
  if ((file.type || '').startsWith('image/')) return { url: await shrinkImage(file), stored: 'inline' };
  if (file.size > 450 * 1024) throw new Error('That file is too large (limit about 450 KB). Ask the admin to turn on file storage for bigger files.');
  return { url: await readAsDataURL(file), stored: 'inline' };
}

/* ---------- dashboard shell ---------- */
const ROLE_LABEL = { admin: 'Administrator', head: 'Head', deputy: 'Deputy Head', sdc: 'SDC', bursar: 'Bursar', boarding: 'Boarding', teacher: 'Teacher', learner: 'Learner', parent: 'Parent' };
const SWITCH_LIST = ['admin', 'head', 'deputy', 'bursar', 'sdc', 'boarding', 'teacher', 'learner', 'parent'];
const LOGO = new URL('../assets/logo.png', import.meta.url).href;

function ensureHead() {
  if (!document.querySelector('meta[name=viewport]')) { const m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width,initial-scale=1,viewport-fit=cover'; document.head.appendChild(m); }
  if (!document.querySelector('link[data-ff-fonts]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.ffFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap';
    document.head.appendChild(l);
  }
  if (!document.querySelector('link[rel=icon]')) { const i = document.createElement('link'); i.rel = 'icon'; i.href = LOGO; document.head.appendChild(i); }
}

function openPasswordModal() {
  modal({
    title: 'Change password',
    bodyHTML: `<label class="ff-f">New password<input id="ffp1" type="password" autocomplete="new-password"></label>
      <label class="ff-f">Repeat password<input id="ffp2" type="password" autocomplete="new-password"></label>
      <p class="muted" style="margin:6px 0 0">At least 8 characters, with a letter and a number.</p>`,
    actions: [{ label: 'Cancel' }, {
      label: 'Save', primary: true, onClick: async () => {
        const a = document.getElementById('ffp1').value, b = document.getElementById('ffp2').value;
        if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) { toast('Use at least 8 characters with a letter and a number.', 'error'); return false; }
        if (a !== b) { toast('The two passwords do not match.', 'error'); return false; }
        try { await changePassword(a); toast('Password changed', 'success'); }
        catch (e) { toast(/requires-recent-login/.test(String(e.code)) ? 'For security, sign out, sign in again and retry.' : 'Could not change the password.', 'error'); return false; }
      }
    }]
  });
}

export function renderShell({ role, title = '', nav = [] } = {}) {
  ensureHead();
  const p = getProfile() || {};
  const r = role || p.role || '';
  document.title = `${title ? title + ' · ' : ''}Father Flower`;
  document.getElementById('ff-app')?.remove();
  const here = location.pathname.split('/').pop() || 'index.html';
  const links = nav.map(n => {
    const active = String(n.href).split('#')[0].split('?')[0] === here;
    return `<a href="${esc(n.href)}"${active ? ' class="on" aria-current="page"' : ''}><span class="ic" aria-hidden="true">${esc(n.icon || '•')}</span><span>${esc(n.label)}</span></a>`;
  }).join('');
  const sw = p.role === 'admin' ? `<div class="ff-menu-sec"><div class="ff-menu-lab">Switch dashboard</div>${SWITCH_LIST.map(k => `<a href="${esc(siteUrl(ROLE_HOME[k]))}">${esc(ROLE_LABEL[k])}</a>`).join('')}</div>` : '';
  const app = document.createElement('div');
  app.id = 'ff-app'; app.className = 'ff-app';
  app.innerHTML = `
  <header class="ff-top">
    <button type="button" class="ff-burger" aria-label="Open menu" aria-expanded="false">☰</button>
    <a class="ff-brand" href="${esc(siteUrl(ROLE_HOME[r] || 'index.html'))}"><img src="${esc(LOGO)}" alt="" width="36" height="36"><span><b id="ff-school">Father Flower</b><small>${esc(ROLE_LABEL[r] || '')}</small></span></a>
    <div class="ff-user"><button type="button" class="ff-userbtn" aria-haspopup="true" aria-expanded="false"><span class="ff-av" aria-hidden="true">${esc((p.fullName || '?').trim().charAt(0).toUpperCase())}</span><span class="ff-uname">${esc(p.fullName || 'Account')}</span></button>
      <div class="ff-menu" hidden>
        <div class="ff-menu-sec"><div class="ff-menu-who"><b>${esc(p.fullName || '')}</b><small>${esc(p.loginId || '')} · ${esc(ROLE_LABEL[p.role] || '')}</small></div></div>
        ${sw}
        <div class="ff-menu-sec">
          <a href="${esc(siteUrl('index.html'))}">View website</a>
          <button type="button" data-a="pw">Change password</button>
          <button type="button" data-a="google">Link Google account</button>
          <button type="button" data-a="out" class="out">Sign out</button>
        </div>
      </div></div>
  </header>
  <div class="ff-body">
    <nav class="ff-side" aria-label="Main menu">${links}</nav>
    <div class="ff-scrim" hidden></div>
    <div class="ff-content"><div class="ff-pagehead"><h1>${esc(title)}</h1></div><main id="main" class="ff-main" tabindex="-1"></main></div>
  </div>`;
  document.body.appendChild(app);

  const side = app.querySelector('.ff-side'), scrim = app.querySelector('.ff-scrim'), burger = app.querySelector('.ff-burger');
  const drawer = open => { app.classList.toggle('drawer', open); scrim.hidden = !open; burger.setAttribute('aria-expanded', String(open)); };
  burger.onclick = () => drawer(!app.classList.contains('drawer'));
  scrim.onclick = () => drawer(false);
  side.addEventListener('click', e => { if (e.target.closest('a')) drawer(false); });
  const menu = app.querySelector('.ff-menu'), ub = app.querySelector('.ff-userbtn');
  const toggleMenu = open => { menu.hidden = !open; ub.setAttribute('aria-expanded', String(open)); };
  ub.onclick = e => { e.stopPropagation(); toggleMenu(menu.hidden); };
  document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.ff-user')) toggleMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { toggleMenu(false); drawer(false); } });
  menu.addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    toggleMenu(false);
    if (b.dataset.a === 'out') logout();
    else if (b.dataset.a === 'pw') openPasswordModal();
    else if (b.dataset.a === 'google') {
      try { await linkGoogle(); toast('Google account linked. You can now use the Google button on the login page.', 'success'); }
      catch (err) {
        const c = String(err.code || '');
        toast(/credential-already-in-use|email-already-in-use/.test(c) ? 'That Google account is already linked to another person.' : /provider-already-linked/.test(c) ? 'A Google account is already linked.' : /popup-closed|cancelled/.test(c) ? 'Cancelled.' : 'Could not link Google. Try again.', 'error');
      }
    }
  });
  getSettings().then(s => { const n = (s.school && (s.school.shortName || s.school.name)) || s.shortName || s.name; if (n) { const el = app.querySelector('#ff-school'); if (el) el.textContent = n; } }).catch(() => {});
  return app.querySelector('#main');
}

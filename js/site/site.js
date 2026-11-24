/* ============================================================
   Father Flower public site core (Account 1)
   Purpose: header, footer, floating buttons, public data loaders with fallbacks, helpers.
   Role allowed: public (no login).
   Collections read: settings/school, campuses, news.
   Firebase is loaded lazily so the site still renders (with seed text) if it is unreachable.
   ============================================================ */

export const SLOGAN = 'Affordable education for all.';

/* Fallback seed text. Real values come from Firestore settings/school (admin editable). */
export const SEED_SCHOOL = {
  name: 'Father Flower Educational Network',
  shortName: 'Father Flower',
  motto: 'Moulding a disciplined learner for national and global impact through military leadership styles.',
  tagline: 'The Leading Light',
  vision: 'To be the leading provider of world-class basic education by 2030.',
  values: ['Teamwork', 'Integrity', 'Commitment', 'Dedication', 'Transparency'],
  address: 'Stand No. 6 & 7 Mashayamombe Road, Kadoma, Mashonaland West, Zimbabwe',
  phones: ['+263 773 526 109', '+263 771 448 240'],
  email: 'info@ffgs.co.zw',
  officeHours: 'Mon–Fri 07:30–16:00',
  socials: {},
  founded: 2021,
  founderName: 'Dr Jimmy Lemekani-Waya',
  founderTitle: 'Founder and Director General',
  admissionRequirements: [
    "Copy of the learner's birth certificate",
    'Latest school report or transfer letter (if coming from another school)',
    "Copy of the guardian's national ID",
    'One recent passport-size photo of the learner'
  ]
};

export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/* Unconfirmed campus list: fallback only. Level is unknown until the school confirms it. */
export const SEED_CAMPUSES = ['City Institute', 'Waverly', 'Ingezi', 'Rimuka', 'Pixie Combie', 'Ngezi Institute', 'Ngezi High']
  .map(name => ({ id: slug(name), name, level: '', town: '', seed: true }));

/* ---------- small helpers ---------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function safeUrl(u) { u = String(u || '').trim(); return /^(https?:\/\/|data:image\/|\.{0,2}\/|assets\/)/i.test(u) ? u : ''; }
export function money(cents) { return '$' + ((Number(cents) || 0) / 100).toFixed(2); }
export function toDate(v) {
  if (!v) return new Date(0);
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v); return isNaN(d) ? new Date(0) : d;
}
export function fmtDate(v) { const d = toDate(v); return +d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
export function intlDigits(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '263' + d.slice(1); return d; }
export function telHref(p) { return 'tel:' + String(p || '').replace(/[^\d+]/g, ''); }
export const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
export function waLink(school, text) {
  const wa = school?.socials?.whatsapp;
  const n = wa && /^[\d\s+()-]+$/.test(wa) ? intlDigits(wa) : intlDigits(school?.phones?.[0] || SEED_SCHOOL.phones[0]);
  return `https://wa.me/${n}?text=${encodeURIComponent(text || 'Hello, I would like to enquire about admissions.')}`;
}
export function mapsLink(q) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }

/* Rate limit support (localStorage may be blocked, so always try/catch) */
export function tooSoon(key, ms) { try { return Date.now() - Number(localStorage.getItem(key) || 0) < ms; } catch (e) { return false; } }
export function markSent(key) { try { localStorage.setItem(key, String(Date.now())); } catch (e) { /* ignore */ } }

/* ---------- Firebase (lazy, optional) ---------- */
let _fb;
export function getFirebase() { return _fb || (_fb = import('../../shared/firebase.js').catch(() => null)); }

/* ---------- cache ---------- */
const cget = (k, ttl) => { try { const o = JSON.parse(localStorage.getItem(k)); if (o && Date.now() - o.t < ttl) return o.v; } catch (e) { /* ignore */ } return null; };
const cset = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch (e) { /* ignore */ } };
const clean = d => { const o = { ...d }; ['createdAt', 'updatedAt', 'createdBy'].forEach(k => delete o[k]); return o; };
const merge = (seed, data) => { const out = { ...seed }; for (const [k, v] of Object.entries(data || {})) { if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue; out[k] = v; } return out; };
const TTL = 5 * 60 * 1000;

/* ---------- data loaders ---------- */
let _school;
export function getSchool() {
  return _school || (_school = (async () => {
    const c = cget('ff_school_v1', TTL); if (c) return c;
    const f = await getFirebase(); let data = {};
    if (f) {
      try { const s = await timeout(f.fs.getDoc(f.fs.doc(f.db, 'settings', 'school')), 6000); if (s.exists()) data = clean(s.data()); } catch (e) { /* use seed */ }
    }
    const merged = merge(SEED_SCHOOL, data);
    if (Object.keys(data).length) cset('ff_school_v1', merged);
    return merged;
  })());
}

let _campuses;
export function getCampuses() {
  return _campuses || (_campuses = (async () => {
    const c = cget('ff_campuses_v1', TTL); if (c) return c;
    const f = await getFirebase();
    if (f) {
      try {
        const snap = await timeout(f.fs.getDocs(f.fs.query(f.fs.collection(f.db, 'campuses'), f.fs.where('active', '==', true), f.fs.limit(50))), 6000);
        const rows = snap.docs.map(d => ({ id: d.id, ...clean(d.data()) })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if (rows.length) { cset('ff_campuses_v1', rows); return rows; }
      } catch (e) { /* use seed */ }
    }
    return SEED_CAMPUSES;
  })());
}

/* Published news only. Returns an array, or null when it could not be loaded. */
export async function getNews(max = 50) {
  const f = await getFirebase(); if (!f) return null;
  try {
    const { db, fs } = f;
    const snap = await timeout(fs.getDocs(fs.query(fs.collection(db, 'news'), fs.where('published', '==', true), fs.limit(50))), 7000);
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => +toDate(b.publishedAt) - +toDate(a.publishedAt));
    return rows.slice(0, max);
  } catch (e) { return null; }
}

/* ---------- reusable renderers ---------- */
const LEVEL = { primary: 'Primary', secondary: 'High school', both: 'Primary & high school' };
export function photoFigure(src, label, { cls = '', w = 800, h = 600, eager = false } = {}) {
  return `<figure class="photo ${cls}" data-label="${esc(label)}"><img data-photo src="${esc(src)}" alt="" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></figure>`;
}
export function campusCard(c, school) {
  const phone = c.phone || school.phones?.[0] || '';
  const badges = [LEVEL[c.level], c.boarding ? 'Boarding' : ''].filter(Boolean).map(b => `<span class="badge">${esc(b)}</span>`).join('');
  const where = [c.town, c.headName && 'Head: ' + c.headName].filter(Boolean).map(esc).join(' · ');
  const acts = [
    phone && `<a class="btn btn-navy btn-sm" href="${esc(telHref(phone))}">Call</a>`,
    phone && `<a class="btn btn-ghost btn-sm" style="color:var(--navy)" target="_blank" rel="noopener" href="${esc(waLink({ phones: [phone] }, 'Hello, I would like to enquire about ' + c.name + '.'))}">WhatsApp</a>`,
    `<a class="btn btn-ghost btn-sm" style="color:var(--navy)" target="_blank" rel="noopener" href="${esc(mapsLink(c.name + ' ' + (c.town || 'Kadoma') + ' Zimbabwe'))}">Directions</a>`,
    `<a class="btn btn-gold btn-sm" href="admissions.html?campus=${encodeURIComponent(c.id)}#apply">Apply</a>`
  ].filter(Boolean).join('');
  return `<article class="card campus-card">${photoFigure('assets/photos/campus-' + encodeURIComponent(c.id) + '.jpg', 'Campus photo')}
  <div class="card-body"><h3>${esc(c.name)}</h3>${badges ? `<p class="badges">${badges}</p>` : ''}${where ? `<p class="muted small">${where}</p>` : ''}${c.email ? `<p class="small"><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></p>` : ''}<div class="actions">${acts}</div></div></article>`;
}
export function newsCard(n) {
  const img = safeUrl(n.imageUrl);
  const fig = img ? `<figure class="photo"><img src="${esc(img)}" alt="" width="800" height="600" loading="lazy" decoding="async"></figure>` : photoFigure('assets/photos/none.jpg', 'News');
  const sum = String(n.summary || '');
  return `<article class="card news-card"><a href="news.html#${encodeURIComponent(n.id)}">${fig}<div class="card-body"><p class="muted small">${esc(fmtDate(n.publishedAt))}</p><h3>${esc(n.title)}</h3><p class="muted">${esc(sum.slice(0, 150))}${sum.length > 150 ? '…' : ''}</p></div></a></article>`;
}
export const skeletonCards = (n = 3) => Array.from({ length: n }, () => '<div class="sk sk-card"></div>').join('');

/* ---------- layout ---------- */
const NAV = [['index.html', 'Home', 'home'], ['about.html', 'About', 'about'], ['schools.html', 'Our schools', 'schools'], ['learning.html', 'Learning', 'learning'], ['news.html', 'News', 'news'], ['admissions.html', 'Admissions', 'admissions'], ['contact.html', 'Contact', 'contact']];
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 0 1 12 4zm-3 4c-.3 0-.6.3-.8.6-.5.7-.5 1.7.2 2.9 1 1.8 2.5 3.2 4.4 4 1.1.5 2 .4 2.6-.2.3-.3.5-.7.5-1l-1.9-1-.8.9c-1-.4-2.1-1.4-2.6-2.4l.7-.8-.9-2c-.2-.5-.5-.9-1.4-.9z"/></svg>';

function renderHeader(school, active) {
  const host = $('#site-header'); if (!host) return;
  host.innerHTML = `<header class="site-header"><div class="wrap bar">
    <a class="brand" href="index.html" aria-label="${esc(school.name)} home"><span class="logo"><img src="assets/logo.png" width="48" height="48" alt=""></span>
      <span class="brand-text"><strong><span class="full">${esc(school.name)}</span><span class="short">${esc(school.shortName || school.name)}</span></strong><small>${esc(school.tagline || '')}</small></span></a>
    <a class="btn btn-gold btn-sm portal-mini" href="login.html">Portal</a>
    <button class="burger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="site-nav"><span></span></button>
    <nav id="site-nav" class="nav" aria-label="Main">${NAV.map(([h, l, k]) => `<a href="${h}"${k === active ? ' aria-current="page"' : ''}>${l}</a>`).join('')}<a class="btn btn-gold btn-sm portal" href="login.html">Parent &amp; learner portal</a></nav></div></header>`;
  const burger = $('.burger', host), nav = $('#site-nav', host);
  burger.addEventListener('click', () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); });
  nav.addEventListener('click', e => { if (e.target.closest('a')) { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); } });
  const img = $('.logo img', host);
  const ph = () => { img.parentElement.innerHTML = `<span class="logo-ph">${esc((school.shortName || 'FF').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</span>`; };
  img.addEventListener('error', ph); if (img.complete && !img.naturalWidth) ph();
}

function renderFooter(school, active) {
  const host = $('#site-footer'); if (!host) return;
  const soc = school.socials || {};
  const links = [['facebook', 'Facebook'], ['tiktok', 'TikTok']].map(([k, l]) => /^https?:\/\//i.test(soc[k] || '') ? `<li><a href="${esc(soc[k])}" target="_blank" rel="noopener">${l}</a></li>` : '').join('');
  const phones = (school.phones || []).map(p => `<li><a href="${esc(telHref(p))}">${esc(p)}</a></li>`).join('');
  host.innerHTML = `<footer class="site-footer"><div class="wrap"><div class="foot-grid">
    <div><h3>${esc(school.name)}</h3><p>${esc(school.tagline || '')} &middot; ${esc(SLOGAN)}</p><p class="small">${esc(school.motto || '')}</p></div>
    <div><h3>Quick links</h3><ul>${NAV.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}<li><a href="login.html">Parent &amp; learner portal</a></li></ul></div>
    <div><h3>Contact</h3><ul><li>${esc(school.address || '')}</li>${phones}<li><a href="mailto:${esc(school.email || '')}">${esc(school.email || '')}</a></li><li>${esc(school.officeHours || '')}</li></ul></div>
    <div><h3>Follow &amp; chat</h3><ul>${links}<li><a href="${esc(waLink(school))}" target="_blank" rel="noopener">WhatsApp us</a></li></ul></div></div>
    <div class="foot-bottom"><span>&copy; ${new Date().getFullYear()} ${esc(school.name)}</span><span>Website by Kinton Technologies</span></div></div></footer>`;
  const hide = ['admissions', 'register', 'login'].includes(active);
  document.body.classList.toggle('has-enrol', !hide);
  $$('.wa-float,.enrol-bar').forEach(e => e.remove());
  const wa = document.createElement('a');
  wa.className = 'wa-float'; wa.target = '_blank'; wa.rel = 'noopener'; wa.href = waLink(school); wa.setAttribute('aria-label', 'Chat on WhatsApp');
  wa.innerHTML = WA_ICON + '<span>Chat</span>'; document.body.appendChild(wa);
  if (!hide) { const b = document.createElement('div'); b.className = 'enrol-bar'; b.innerHTML = '<a class="btn btn-gold" href="admissions.html#apply">Enrol now</a>'; document.body.appendChild(b); }
}

function jsonLd(school) {
  const data = {
    '@context': 'https://schema.org', '@type': ['School', 'LocalBusiness'], name: school.name, slogan: school.tagline,
    url: new URL('./', location.href).href, telephone: (school.phones || [])[0], email: school.email,
    address: { '@type': 'PostalAddress', streetAddress: school.address, addressLocality: 'Kadoma', addressRegion: 'Mashonaland West', addressCountry: 'ZW' },
    openingHours: 'Mo-Fr 07:30-16:00', founder: school.founderName ? { '@type': 'Person', name: school.founderName } : undefined, foundingDate: String(school.founded || '')
  };
  let el = $('#ld-school'); if (!el) { el = document.createElement('script'); el.type = 'application/ld+json'; el.id = 'ld-school'; document.head.appendChild(el); }
  el.textContent = JSON.stringify(data);
}

export function photoFallbacks(root = document) {
  $$('img[data-photo]', root).forEach(img => {
    const fail = () => img.closest('.photo')?.classList.add('no-photo');
    img.addEventListener('error', fail);
    if (img.complete && !img.naturalWidth) fail();
  });
}

export function animateCounters(root = document) {
  const els = $$('.count[data-to]', root);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = el => {
    const to = Number(el.dataset.to) || 0; if (reduce || to < 2) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 1200;
    const step = t => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  if (!('IntersectionObserver' in window)) { els.forEach(e => { e.textContent = e.dataset.to; }); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: .4 });
  els.forEach(e => io.observe(e));
}

/* Call once per page: renders layout with seed text immediately, then refreshes with Firestore data. */
export async function initPage(active) {
  renderHeader(SEED_SCHOOL, active); renderFooter(SEED_SCHOOL, active); photoFallbacks();
  const school = await getSchool();
  renderHeader(school, active); renderFooter(school, active);
  jsonLd(school);
  return school;
}

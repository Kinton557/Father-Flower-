/*
 * bursar/js/common.js
 * Purpose: helpers shared by the Bursar, SDC and Boarding pages (nav, money, scope, CSV, printing, receipts).
 * Role allowed: used by bursar, sdc, boarding, admin (head on payments.html only).
 * Collections used: campuses, terms, settings/school (read).
 */
import { db, fs } from '../../shared/firebase.js';
import { esc, getSettings } from '../../shared/ui.js';

export const BURSAR_NAV = [
  { label: 'Overview', href: 'index.html', icon: 'home' },
  { label: 'Fee structures', href: 'fees.html', icon: 'list' },
  { label: 'Accounts', href: 'accounts.html', icon: 'users' },
  { label: 'Payments', href: 'payments.html', icon: 'cash' },
  { label: 'Debtors', href: 'debtors.html', icon: 'alert' },
  { label: 'Plans and waivers', href: 'plans.html', icon: 'shield' },
  { label: 'Cash-up', href: 'cashup.html', icon: 'calc' },
  { label: 'Expenditure', href: 'expenditure.html', icon: 'receipt' },
  { label: 'Budget', href: 'budget.html', icon: 'chart' },
  { label: 'Reports', href: 'reports.html', icon: 'file' }
];
export const SDC_NAV = [
  { label: 'Overview', href: 'index.html', icon: 'home' },
  { label: 'Members', href: 'members.html', icon: 'users' },
  { label: 'Meetings', href: 'meetings.html', icon: 'calendar' },
  { label: 'Resolutions', href: 'resolutions.html', icon: 'file' },
  { label: 'Levies', href: 'levies.html', icon: 'cash' },
  { label: 'Projects', href: 'projects.html', icon: 'build' },
  { label: 'Expenditure', href: 'expenditure.html', icon: 'receipt' },
  { label: 'Notices', href: 'notices.html', icon: 'bell' }
];
export const BOARDING_NAV = [
  { label: 'Overview', href: 'index.html', icon: 'home' },
  { label: 'Hostels and beds', href: 'hostels.html', icon: 'bed' },
  { label: 'Roll call', href: 'register.html', icon: 'check' },
  { label: 'Exeats', href: 'exeats.html', icon: 'door' },
  { label: 'Sick bay', href: 'sickbay.html', icon: 'heart' },
  { label: 'Discipline and duty', href: 'discipline.html', icon: 'shield' },
  { label: 'Dining', href: 'dining.html', icon: 'food' },
  { label: 'Tuck shop', href: 'tuckshop.html', icon: 'cash' },
  { label: 'Visits', href: 'visits.html', icon: 'users' },
  { label: 'Inventory', href: 'inventory.html', icon: 'list' }
];

export function navFor(role) {
  if (role === 'head') {
    return [
      { label: 'Payment reversals', href: 'payments.html', icon: 'cash' },
      { label: 'Head home', href: '../head/index.html', icon: 'home' }
    ];
  }
  return BURSAR_NAV;
}

export const FORMS = ['ECD A', 'ECD B', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7',
  'Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5', 'Form 6'];
export const METHODS = { cash: 'Cash', ecocash: 'EcoCash', bank: 'Bank' };
export const CATEGORIES = ['Utilities', 'Maintenance', 'Stationery and supplies', 'Food and catering', 'Transport and fuel',
  'Salaries and allowances', 'Sport and culture', 'Security', 'Development projects', 'Other'];

export const normForm = (f) => String(f ?? '').toLowerCase().replace(/\s+/g, '');

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
export function toCents(v) {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const centsToInput = (c) => ((c || 0) / 100).toFixed(2);

export const campusScope = (p) => (p.campusId && p.campusId !== 'all' ? p.campusId : null);
export function scopeWhere(p) {
  const c = campusScope(p);
  return c ? [fs.where('campusId', '==', c)] : [];
}

export async function loadCampuses(p) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'campuses'), fs.limit(50)));
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.active !== false);
  const sc = campusScope(p);
  if (sc) rows = rows.filter((c) => c.id === sc);
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
export async function loadTerms() {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'terms'), fs.limit(24)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.year - a.year) || (b.term - a.term));
}
export const termLabel = (t) => (t ? `Term ${t.term} ${t.year}` : '');

export async function getSchool() {
  const s = await getSettings();
  return (s && s.school) ? s.school : (s || {});
}
export function pickCurrentTerm(terms, school) {
  return terms.find((t) => t.id === school.currentTermId) || terms.find((t) => t.open) || terms[0] || null;
}

export function opts(rows, val, label, selected) {
  return rows.map((r) => `<option value="${esc(val(r))}"${String(val(r)) === String(selected) ? ' selected' : ''}>${esc(label(r))}</option>`).join('');
}
export function showErr(el, e) {
  console.error(e);
  el.innerHTML = `<p class="b-err" role="alert">Could not load this. ${esc(e && e.message ? e.message : '')} Check your connection and try again.</p>`;
}
export function tabs(root, onChange) {
  const btns = [...root.querySelectorAll('[data-tab]')];
  const panels = [...root.querySelectorAll('[data-panel]')];
  const show = (name) => {
    btns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (onChange) onChange(name);
  };
  btns.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  return show;
}

export function downloadCSV(name, rows) {
  const cell = (c) => {
    let s = String(c ?? '');
    if (typeof c === 'string' && /^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* Print any HTML at A4 or 80 mm thermal width. */
export function printHTML(html, mode = 'a4') {
  document.getElementById('b-print')?.remove();
  document.getElementById('b-print-style')?.remove();
  const area = document.createElement('div');
  area.id = 'b-print';
  area.className = 'b-print ' + mode;
  area.innerHTML = html;
  const st = document.createElement('style');
  st.id = 'b-print-style';
  const th = mode === 'thermal';
  st.textContent = `@media print{@page{size:${th ? '80mm auto' : 'A4'};margin:${th ? '3mm' : '12mm'}}` +
    'body>*:not(#b-print){display:none!important}#b-print{display:block!important}}';
  document.head.appendChild(st);
  document.body.appendChild(area);
  const done = () => { area.remove(); st.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}

export function usd(cents) {
  const c = Math.round(cents || 0);
  const s = (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (c < 0 ? '-$' : '$') + s;
}

export function receiptHTML({ school, campusName, p, termText, balanceAfter, duplicate }) {
  const rows = [
    ['Receipt no', p.receiptNumber], ['Date', p.paidOn], ['Learner', p.learnerName], ['Reg number', p.regNumber],
    ['Form', p.form], ['Term', termText], ['Method', METHODS[p.method] || p.method],
    ['Reference', p.reference || 'n/a'], ['Received by', p.receivedByName || '']
  ];
  return `<div class="rc">
    <div class="rc-top"><strong>${esc(school.name || 'Father Flower Educational Network')}</strong>
    <div>${esc(campusName || '')}</div>
    <div class="rc-sm">${esc(school.address || '')}</div>
    <div class="rc-sm">${esc((school.phones || []).join(' / '))}</div></div>
    <h2>Fees receipt${duplicate ? ' (duplicate copy)' : ''}</h2>
    <table class="rc-t">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="rc-amt"><span>Amount received</span><strong>${usd(p.amountCents)}</strong></div>
    ${balanceAfter === undefined || balanceAfter === null ? '' : `<div class="rc-bal"><span>Balance after payment</span><strong>${usd(balanceAfter)}</strong></div>`}
    <div class="rc-sig">Signed: ______________________</div>
    <div class="rc-sm rc-c">Thank you. Please keep this receipt.</div></div>`;
}

/* Find finance accounts by reg number or name. Campus-scoped users are always constrained to their campus. */
export async function searchAccounts(profile, q) {
  q = String(q || '').trim();
  if (!q) return [];
  const sc = campusScope(profile);
  if (/\d/.test(q) && !q.includes(' ')) {
    const s = await fs.getDoc(fs.doc(db, 'accounts', q.toUpperCase()));
    if (!s.exists()) return [];
    const a = { id: s.id, ...s.data() };
    return sc && a.campusId !== sc ? [] : [a];
  }
  if (sc) {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'accounts'), fs.where('campusId', '==', sc), fs.limit(800)));
    const n = q.toLowerCase();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => (a.learnerName || '').toLowerCase().includes(n)).slice(0, 40);
  }
  const name = q.replace(/\b\w/g, (m) => m.toUpperCase());
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'accounts'), fs.where('learnerName', '>=', name), fs.where('learnerName', '<=', name + ''), fs.limit(40)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* Small modal asking for a note. Resolves to the text, or null if cancelled. */
export function askText({ title, label, confirmText = 'Save', danger = false, min = 0 }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.style.cssText = 'border:1px solid var(--line,#E6DFCF);border-radius:14px;max-width:min(520px,94vw);width:100%;padding:18px;background:var(--b-surface,#fff);color:var(--b-text,#1B1F2A)';
    dlg.innerHTML = `<form method="dialog"><h2 class="b-h2">${esc(title)}</h2><label style="display:flex;flex-direction:column;gap:4px;font-size:.9rem">${esc(label)}<textarea class="b-in" rows="4" maxlength="500" style="min-height:90px"></textarea></label><p class="b-err" hidden></p><div class="b-actions"><button class="b-btn ${danger ? 'b-danger' : ''}" value="ok">${esc(confirmText)}</button><button class="b-btn b-ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(dlg);
    const ta = dlg.querySelector('textarea');
    const err = dlg.querySelector('.b-err');
    dlg.querySelector('[value=ok]').addEventListener('click', (e) => {
      if (ta.value.trim().length < min) { e.preventDefault(); err.hidden = false; err.textContent = `Please write at least ${min} characters.`; }
    });
    dlg.addEventListener('close', () => { const v = dlg.returnValue === 'ok' ? ta.value.trim() : null; dlg.remove(); resolve(v); });
    dlg.showModal();
  });
}

export const SESSIONS =[{ id: 'morning', l: 'Morning' }, { id: 'evening', l: 'Evening' }, { id: 'lights_out', l: 'Lights-out' }];

/* Boarders only (learners.boarding == true), limited to the user's campus. */
export async function loadBoarders(p, max = 1000) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'learners'), ...scopeWhere(p), fs.where('boarding', '==', true), fs.limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((l) => (l.status || 'active') === 'active');
}
export async function loadHostels(p) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'hostels'), ...scopeWhere(p), fs.limit(60)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
export const bedsIn = (h) => (h.rooms || []).reduce((s, r) => s + (Number(r.beds) || 0), 0);

export function tsToISO(v) {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v.toDate ? v.toDate() : new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export const tsMillis = (v) => (!v ? 0 : (v.toMillis ? v.toMillis() : (v.seconds ? v.seconds * 1000 : 0)));

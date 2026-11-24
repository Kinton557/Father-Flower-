/* Shared application form logic for admissions.html and register.html.
   Role: public. Collections written: admissions (create only, status "new", doc id = reference number).
   Uploads go through saveFile() from shared/ui.js (optional). Spam protection: honeypot + localStorage rate limit. */
import { getCampuses, getSchool, getFirebase, esc, $, $$, timeout, tooSoon, markSent, telHref } from './site.js';

export const PRIMARY_FORMS = ['ECD A', 'ECD B', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'];
export const SECONDARY_FORMS = ['Form 1', 'Form 2', 'Form 3', 'Form 4', 'Form 5 (Lower Sixth)', 'Form 6 (Upper Sixth)'];

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newReference() {
  const a = new Uint8Array(6); crypto.getRandomValues(a);
  return 'FF' + String(new Date().getFullYear()).slice(2) + '-' + [...a].map(n => ALPHABET[n % ALPHABET.length]).join('');
}
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
const validPhone = s => { const d = s.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15 && /^[\d\s+()-]+$/.test(s); };
const MAX_FILES = 3, MAX_BYTES = 5 * 1024 * 1024;

function fillForms(sel, level) {
  const opt = a => a.map(f => `<option>${esc(f)}</option>`).join('');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Choose a form or grade</option>' +
    (level === 'primary' ? opt(PRIMARY_FORMS)
      : level === 'secondary' ? opt(SECONDARY_FORMS)
        : `<optgroup label="Primary">${opt(PRIMARY_FORMS)}</optgroup><optgroup label="High school">${opt(SECONDARY_FORMS)}</optgroup>`);
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
}

export async function initApplyForm({ rateKey, notes }) {
  const form = $('#apply-form'); if (!form) return;
  const el = n => form.elements[n];
  const val = n => (el(n)?.value || '').trim();
  const campusSel = el('campus'), formSel = el('formApplying');
  const errTop = $('#apply-error'), btn = $('#apply-btn');

  /* Campuses (seed fallback if Firestore is empty or offline) */
  const campuses = await getCampuses();
  campusSel.innerHTML = '<option value="">Choose a campus</option>' +
    campuses.map(c => `<option value="${esc(c.id)}" data-level="${esc(c.level || '')}">${esc(c.name)}</option>`).join('');
  fillForms(formSel, '');
  const pre = new URLSearchParams(location.search).get('campus');
  if (pre && [...campusSel.options].some(o => o.value === pre)) campusSel.value = pre;
  const levelOf = () => campusSel.selectedOptions[0]?.dataset.level || '';
  fillForms(formSel, levelOf());
  campusSel.addEventListener('change', () => fillForms(formSel, levelOf()));

  /* Files */
  const fileInput = el('docs'), fileList = $('#file-list');
  fileInput?.addEventListener('change', () => {
    const fs = [...fileInput.files]; fileList.innerHTML = '';
    const bad = fs.length > MAX_FILES || fs.some(f => f.size > MAX_BYTES || !/^(image\/|application\/pdf)/.test(f.type));
    if (bad) { fileInput.value = ''; setErr('docs', `Choose up to ${MAX_FILES} files (photos or PDF), each under 5 MB.`); return; }
    setErr('docs', '');
    fileList.innerHTML = fs.map(f => `<li>${esc(f.name)} (${Math.round(f.size / 1024)} KB)</li>`).join('');
  });

  /* Errors */
  function fieldOf(name) { const n = el(name); return (n && (n.length && !n.tagName ? n[0] : n))?.closest('.field'); }
  function setErr(name, msg) {
    const f = fieldOf(name); if (!f) return;
    f.classList.toggle('bad', !!msg);
    const e = f.querySelector('.err'); if (e) e.textContent = msg || '';
    const inp = f.querySelector('input,select,textarea'); if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const clearErrors = () => { $$('.field', form).forEach(f => { f.classList.remove('bad'); const e = f.querySelector('.err'); if (e) e.textContent = ''; }); errTop.hidden = true; };

  function validate() {
    const errs = []; const seen = new Set();
    $$('[required]', form).forEach(n => {
      if (seen.has(n.name)) return; seen.add(n.name);
      const ok = n.type === 'checkbox' ? n.checked : n.type === 'radio' ? !!form.querySelector(`[name="${n.name}"]:checked`) : n.value.trim() !== '';
      if (!ok) errs.push([n.name, n.type === 'checkbox' ? 'Please confirm to continue.' : 'This field is required.']);
    });
    const has = n => !errs.some(e => e[0] === n);
    ['firstName', 'lastName', 'gName'].forEach(n => { if (el(n) && has(n) && val(n).length < 2) errs.push([n, 'Please enter at least 2 letters.']); });
    if (el('gPhone') && has('gPhone') && !validPhone(val('gPhone'))) errs.push(['gPhone', 'Enter a valid phone number, e.g. 0771 234 567.']);
    if (el('gEmail') && val('gEmail') && !validEmail(val('gEmail'))) errs.push(['gEmail', 'That email address does not look right.']);
    if (el('dob') && has('dob')) {
      const d = new Date(val('dob')), now = new Date(); const age = (now - d) / 31557600000;
      if (isNaN(d) || d > now) errs.push(['dob', 'Enter a valid date of birth.']);
      else if (age < 2 || age > 25) errs.push(['dob', 'Please check the date of birth. The learner should be between 2 and 25 years old.']);
    }
    return errs;
  }

  /* Submit: same reference reused if a slow connection forces a retry */
  let ref = null, timedOut = false;
  async function write(payload) {
    const f = await getFirebase(); if (!f) throw Object.assign(new Error('offline'), { code: 'offline' });
    const { db, fs } = f; ref = ref || newReference();
    try {
      await timeout(fs.setDoc(fs.doc(db, 'admissions', ref), { ...payload, status: 'new', createdAt: fs.serverTimestamp(), createdBy: 'public', updatedAt: fs.serverTimestamp() }), 20000);
    } catch (err) {
      if (err.code === 'timeout') { timedOut = true; throw err; }
      if (err.code === 'permission-denied' && timedOut) return ref; /* the earlier attempt landed */
      throw err;
    }
    return ref;
  }

  function showSuccess(reference, extra) {
    form.hidden = true; $('#apply-intro')?.setAttribute('hidden', '');
    const box = $('#apply-success'); box.hidden = false;
    $('#ref-number').textContent = reference;
    $('#success-extra').textContent = extra || '';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#copy-ref')?.addEventListener('click', async e => { try { await navigator.clipboard.writeText(reference); e.currentTarget.textContent = 'Copied'; } catch (x) { e.currentTarget.textContent = 'Press and hold the number to copy'; } });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault(); clearErrors();
    if (el('website')?.value) { showSuccess(newReference()); return; } /* honeypot: pretend success, store nothing */
    if (tooSoon(rateKey, 60000)) { errTop.textContent = 'You have just submitted a form. Please wait a minute before sending another.'; errTop.hidden = false; return; }
    const errs = validate();
    if (errs.length) {
      errs.forEach(([n, m]) => setErr(n, m));
      errTop.textContent = 'Please fix the highlighted fields.'; errTop.hidden = false;
      (fieldOf(errs[0][0]) || form).scrollIntoView({ behavior: 'smooth', block: 'center' });
      fieldOf(errs[0][0])?.querySelector('input,select,textarea')?.focus({ preventScroll: true });
      return;
    }
    btn.disabled = true; const label = btn.textContent;

    /* Optional documents: failures are not fatal */
    const documents = []; let failedDocs = 0;
    const files = fileInput ? [...fileInput.files] : [];
    if (files.length) {
      btn.textContent = 'Uploading documents…';
      try {
        const ui = await import('../../shared/ui.js');
        for (const file of files) {
          try { const r = await timeout(ui.saveFile(file, 'admissions'), 30000); documents.push({ name: file.name, url: r.url, type: file.type }); }
          catch (x) { failedDocs++; }
        }
      } catch (x) { failedDocs = files.length; }
    }

    btn.textContent = 'Submitting…';
    const boardingVal = form.querySelector('[name="boarding"]:checked')?.value;
    const payload = {
      applicant: {
        firstName: val('firstName'), lastName: val('lastName'), fullName: `${val('firstName')} ${val('lastName')}`.trim(),
        gender: val('gender'), dob: val('dob'), previousSchool: val('previousSchool'), boarding: boardingVal === 'boarding', specialNeeds: val('specialNeeds')
      },
      guardian: { name: val('gName'), relationship: val('gRelationship'), phone: val('gPhone'), email: val('gEmail'), address: val('gAddress') },
      campusId: val('campus'), formApplyingFor: val('formApplying'), documents, notes
    };
    try {
      const reference = await write(payload);
      markSent(rateKey);
      const school = await getSchool();
      showSuccess(reference, failedDocs ? `${failedDocs} document(s) could not be uploaded. Please bring copies to the school office.` : '');
      const ph = $('#success-phone'); if (ph) { const p = (school.phones || [])[0] || ''; ph.innerHTML = `<a href="${esc(telHref(p))}">${esc(p)}</a>`; }
    } catch (err) {
      btn.disabled = false; btn.textContent = label;
      errTop.textContent = err.code === 'timeout' ? 'The connection is slow and we could not confirm your submission yet. Keep this page open and press Submit again.'
        : err.code === 'offline' ? 'You seem to be offline. Please check your data and try again.'
          : err.code === 'permission-denied' ? 'We could not accept the form right now. Please call the school office to apply.'
            : 'Something went wrong while sending. Please try again, or call the school office.';
      errTop.hidden = false; errTop.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}

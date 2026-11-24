/* Admissions page. Role: public. Collections read: settings/school, campuses, feeStructures (current term). Writes admissions via applyForm.js. */
import { initPage, getCampuses, getFirebase, esc, money, timeout, $ } from './site.js';
import { initApplyForm } from './applyForm.js';

const school = await initPage('admissions');

$('#req-list').innerHTML = (school.admissionRequirements || []).map(r => `<li>${esc(r)}</li>`).join('');

initApplyForm({ rateKey: 'ff_adm_last', notes: '' });

/* Fee overview from feeStructures for the current term. No amounts are invented when none are published. */
async function loadFees() {
  const box = $('#fees');
  const fallback = `<p class="muted">Fees depend on the campus, form and whether the learner boards. Please call ${esc((school.phones || [])[0] || 'the school office')} or ask at the school office for the current fee schedule. Affordable education for all.</p>`;
  try {
    const f = await getFirebase();
    if (!f || !school.currentTermId) { box.innerHTML = fallback; return; }
    const { db, fs } = f;
    const [snap, campuses] = await Promise.all([
      timeout(fs.getDocs(fs.query(fs.collection(db, 'feeStructures'), fs.where('termId', '==', school.currentTermId), fs.limit(50))), 7000),
      getCampuses()
    ]);
    const name = id => campuses.find(c => c.id === id)?.name || id;
    const sum = a => (a || []).reduce((t, i) => t + (Number(i.amountCents) || 0), 0);
    const rows = snap.docs.map(d => d.data()).sort((a, b) => name(a.campusId).localeCompare(name(b.campusId)) || String(a.form).localeCompare(String(b.form), undefined, { numeric: true }));
    if (!rows.length) { box.innerHTML = fallback; return; }
    box.innerHTML = `<table class="tbl"><thead><tr><th>Campus</th><th>Form</th><th>Per term</th><th>Boarding adds</th></tr></thead><tbody>${rows.map(r => {
      const items = (r.items || []).map(i => `${esc(i.name)} ${money(i.amountCents)}`).join(' · ');
      const b = sum(r.boardingItems);
      return `<tr><td data-label="Campus">${esc(name(r.campusId))}</td><td data-label="Form">${esc(r.form)}</td><td data-label="Per term"><strong>${money(sum(r.items))}</strong>${items ? `<div class="muted small">${items}</div>` : ''}</td><td data-label="Boarding adds">${b ? money(b) : '–'}</td></tr>`;
    }).join('')}</tbody></table><p class="muted small" style="margin-top:8px">Amounts in USD. Please confirm final fees with the school office.</p>`;
  } catch (e) { box.innerHTML = fallback; }
}
loadFees();

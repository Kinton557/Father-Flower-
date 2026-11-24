/* About page. Role: public. Collections read: settings/school, campuses. */
import { initPage, getCampuses, esc, $, photoFallbacks } from './site.js';

const school = await initPage('about');
$('#about-motto').textContent = school.motto || '';
$('#founded').textContent = school.founded || 2021;
$('#story-founder').textContent = school.founderName || 'our founder';
$('#vision').textContent = school.vision || '';
if (school.mission) $('#mission').textContent = school.mission;
$('#lead-name').textContent = school.founderName || '';
$('#lead-title').textContent = school.founderTitle || '';

const VALUE_TEXT = {
  teamwork: 'We achieve more together than alone.',
  integrity: 'We do what is right, even when no one is watching.',
  commitment: 'We keep our promises to learners and families.',
  dedication: 'We give our best effort every day.',
  transparency: 'We are open and honest in how we run our schools.'
};
$('#values').innerHTML = (school.values || []).map((v, i) =>
  `<article class="card pillar"><div class="num">${String(i + 1).padStart(2, '0')}</div><h3>${esc(v)}</h3><p class="muted">${esc(VALUE_TEXT[String(v).toLowerCase()] || '')}</p></article>`).join('');

/* Campus heads (only those the admin has entered) */
const heads = (await getCampuses()).filter(c => c.headName);
$('#heads').innerHTML = heads.length
  ? `<h3>Campus heads</h3><div class="grid">${heads.map(c => `<article class="card"><div class="card-body"><h3>${esc(c.headName)}</h3><p class="muted">Head, ${esc(c.name)}</p></div></article>`).join('')}</div>`
  : '';
photoFallbacks();

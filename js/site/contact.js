/* Contact page. Role: public. Collections read: settings/school, campuses. Writes: messages (create only).
   Spam protection: honeypot + localStorage rate limit. */
import { initPage, getCampuses, getFirebase, esc, telHref, waLink, mapsLink, timeout, tooSoon, markSent, $, $$ } from './site.js';

const school = await initPage('contact');
const phones = school.phones || [];
$('#details').innerHTML = [
  school.address && `<li><strong>Address:</strong> ${esc(school.address)}</li>`,
  ...phones.map(p => `<li><strong>Phone:</strong> <a href="${esc(telHref(p))}">${esc(p)}</a></li>`),
  school.email && `<li><strong>Email:</strong> <a href="mailto:${esc(school.email)}">${esc(school.email)}</a></li>`,
  school.officeHours && `<li><strong>Hours:</strong> ${esc(school.officeHours)}</li>`
].filter(Boolean).join('');
$('#wa-btn').href = waLink(school, 'Hello, I have a question about Father Flower.');
if (phones[0]) $('#call-btn').href = telHref(phones[0]); else $('#call-btn').hidden = true;
$('#map-btn').href = mapsLink(school.address || 'Mashayamombe Road Kadoma Zimbabwe');

const campuses = await getCampuses();
$('#campus').insertAdjacentHTML('beforeend', campuses.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''));

const form = $('#contact-form'), btn = $('#contact-btn'), top = $('#contact-error');
const val = n => form.elements[n].value.trim();
const setErr = (n, m) => { const f = form.elements[n].closest('.field'); f.classList.toggle('bad', !!m); const e = f.querySelector('.err'); if (e) e.textContent = m || ''; };

form.addEventListener('submit', async e => {
  e.preventDefault(); top.hidden = true;
  $$('.field', form).forEach(f => { f.classList.remove('bad'); const x = f.querySelector('.err'); if (x) x.textContent = ''; });
  if (val('website')) { form.hidden = true; $('#contact-ok').hidden = false; return; } /* honeypot */
  if (tooSoon('ff_msg_last', 30000)) { top.textContent = 'Please wait a few seconds before sending another message.'; top.hidden = false; return; }
  const errs = [];
  if (val('name').length < 2) errs.push(['name', 'Please enter your name.']);
  if (val('message').length < 5) errs.push(['message', 'Please write a short message.']);
  if (!val('phone') && !val('email')) errs.push(['phone', 'Give a phone number or an email so we can reply.']);
  if (val('phone') && !/^[\d\s+()-]{9,20}$/.test(val('phone'))) errs.push(['phone', 'Enter a valid phone number.']);
  if (val('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val('email'))) errs.push(['email', 'That email address does not look right.']);
  if (errs.length) { errs.forEach(([n, m]) => setErr(n, m)); top.textContent = 'Please fix the highlighted fields.'; top.hidden = false; form.elements[errs[0][0]].focus(); return; }

  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Sending…';
  try {
    const f = await getFirebase(); if (!f) throw Object.assign(new Error('offline'), { code: 'offline' });
    const { db, fs } = f;
    await timeout(fs.addDoc(fs.collection(db, 'messages'), {
      name: val('name'), phone: val('phone'), email: val('email'), campusId: val('campus'), subject: val('subject'), message: val('message'),
      status: 'new', createdAt: fs.serverTimestamp(), createdBy: 'public', updatedAt: fs.serverTimestamp()
    }), 20000);
    markSent('ff_msg_last'); form.hidden = true; $('#contact-ok').hidden = false;
  } catch (err) {
    btn.disabled = false; btn.textContent = label;
    top.textContent = err.code === 'timeout' ? 'The connection is slow and we could not confirm your message. Please try again, or use WhatsApp.'
      : 'We could not send your message right now. Please try again, or call or WhatsApp the school office.';
    top.hidden = false;
  }
});

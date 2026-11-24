/* learner/js/reportView.js — printable A4 report card, shared by learner/report.html and parent/report.html
 * (Head/Admin may import it too). Only reports with status "published" are ever shown.
 * Collections: reports, terms, learners, classes, campuses, accounts, settings/school */
import { fs, db } from '../../shared/firebase.js';
import { esc, fmtDate, getSettings, printElement, toast } from '../../shared/ui.js';
import { list } from '../../teacher/js/common.js';
const { doc, getDoc } = fs;
const v = x => (x == null || x === '' ? '–' : esc(x));
const get = async (c, id) => { try { const s = await getDoc(doc(db, c, id)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch (e) { return null; } };

export function reportStyles() {
  if (document.getElementById('rc-css')) return;
  const s = document.createElement('style'); s.id = 'rc-css';
  s.textContent = `.rcwrap{overflow-x:auto}
.rc{background:#fff;color:#1B1F2A;max-width:210mm;margin:0 auto;padding:12mm;box-sizing:border-box;border:1px solid #E6DFCF;border-radius:6px;font:14px/1.45 Inter,system-ui,sans-serif}
.rc .hd{display:flex;gap:12px;align-items:center;border-bottom:3px solid #C9A24A;padding-bottom:10px}
.rc .hd img{width:64px;height:64px;object-fit:contain}.rc h1{font:700 1.3rem Georgia,serif;color:#13203F;margin:0}.rc .sub{color:#6B7280;font-size:.8rem}
.rc .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 16px;margin:12px 0}.rc .meta b{display:block;font-size:.7rem;color:#6B7280;text-transform:uppercase}
.rc table{width:100%;border-collapse:collapse;margin:8px 0}.rc th{background:#13203F;color:#C9A24A;text-align:left}.rc th,.rc td{padding:6px 8px;border:1px solid #E6DFCF}
.rc .sum{display:flex;gap:10px;flex-wrap:wrap}.rc .sum div{flex:1 1 120px;background:#FAF6EE;border-radius:8px;padding:8px}
.rc .cm{border:1px solid #E6DFCF;border-radius:8px;padding:8px;margin:8px 0;min-height:44px}
.rc .sig{display:flex;justify-content:space-between;align-items:end;margin-top:14px;gap:12px}.rc .sig img{max-height:70px;max-width:160px}
.rc .hold{text-align:center;padding:40px 10px}
@page{size:A4;margin:0}
@media print{.no-print{display:none!important}.rc{width:210mm;max-width:none;border:0;border-radius:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
  document.head.appendChild(s);
}

/** Returns { state: 'ok'|'none'|'hold'|'error', html } */
export async function buildCard(learner, termId) {
  try {
    const [st, rep, term, cls, camp] = await Promise.all([getSettings(), get('reports', termId + '_' + learner.id), get('terms', termId), get('classes', learner.classId), get('campuses', learner.campusId)]);
    const school = st.school || st;
    if (!rep || rep.status !== 'published') return { state: 'none' };
    if (school.holdReportsIfOwing) {
      const acc = await get('accounts', learner.id);
      if (!acc || acc.balanceCents > 0) return { state: 'hold' };
    }
    const rows = (rep.subjects || []).map(s => `<tr><td>${v(s.name)}</td><td>${v(s.courseworkMark)}</td><td>${v(s.examMark)}</td><td><b>${v(s.total)}</b></td><td><b>${v(s.grade)}</b></td><td>${v(s.comment)}</td></tr>`).join('');
    const att = rep.attendance || {};
    const html = `<div class="rc" id="rcard">
      <div class="hd"><img src="../assets/logo.png" alt="School logo" width="64" height="64"><div><h1>${v(school.name)}</h1><div class="sub">${v(school.tagline)} · ${v(school.address)}</div><div class="sub">Term report${term ? ' · Term ' + esc(term.term) + ', ' + esc(term.year) : ''}</div></div></div>
      <div class="meta"><div><b>Name</b>${v(learner.fullName)}</div><div><b>Reg number</b>${v(learner.regNumber)}</div><div><b>Class</b>${v(cls && cls.name)}</div><div><b>Campus</b>${v(camp && camp.name)}</div><div><b>Term</b>${term ? esc(term.term) : '–'}</div><div><b>Year</b>${term ? esc(term.year) : '–'}</div></div>
      <table><thead><tr><th>Subject</th><th>Coursework %</th><th>Exam %</th><th>Total %</th><th>Grade</th><th>Comment</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No subjects recorded.</td></tr>'}</tbody></table>
      <div class="sum"><div><b>Average</b><br>${v(rep.average)}%</div><div><b>Position in class</b><br>${v(rep.positionInClass)}</div><div><b>Position in form</b><br>${v(rep.positionInForm)}</div><div><b>Attendance</b><br>${v(att.present)} present · ${v(att.absent)} absent</div></div>
      <div class="cm"><b>Class teacher's comment</b><br>${esc(rep.classTeacherComment || '')}</div>
      <div class="cm"><b>Head's comment${school.headName ? ' (' + esc(school.headName) + ')' : ''}</b><br>${esc(rep.headComment || '')}</div>
      <div class="sig"><div>${school.headSignatureUrl ? `<img src="${esc(school.headSignatureUrl)}" alt="Head's signature">` : ''}<div class="sub">Head's signature</div></div>
        <div class="sub">Date issued: ${rep.publishedAt ? esc(fmtDate(rep.publishedAt)) : '–'}</div>
        <div>${school.stampUrl ? `<img src="${esc(school.stampUrl)}" alt="School stamp">` : ''}<div class="sub">School stamp</div></div></div></div>`;
    return { state: 'ok', html };
  } catch (e) { console.error(e); return { state: 'error' }; }
}

/** Mounts term picker, optional child switcher, card and Download PDF button into main. */
export async function mountReport(main, learners) {
  reportStyles();
  if (!learners.length) { main.innerHTML = '<div class="tcard">No learner is linked to this account.</div>'; return; }
  let terms = [];
  try { terms = (await list('terms')).sort((a, b) => b.year - a.year || b.term - a.term); } catch (e) { console.error(e); }
  main.innerHTML = `<div class="trow no-print">${learners.length > 1 ? '<label>Child<select id="rl"></select></label>' : ''}<label>Term<select id="rt"></select></label><button class="tbtn" id="rp" disabled>Download PDF</button></div><div class="rcwrap" id="rc"><p class="muted">Loading…</p></div>`;
  const $ = id => main.querySelector('#' + id);
  if ($('rl')) $('rl').innerHTML = learners.map(l => `<option value="${esc(l.id)}">${esc(l.fullName)}</option>`).join('');
  $('rt').innerHTML = terms.map(t => `<option value="${esc(t.id)}">Term ${esc(t.term)}, ${esc(t.year)}</option>`).join('') || '<option value="">No terms</option>';
  async function show() {
    const l = learners.find(x => x.id === ($('rl') ? $('rl').value : learners[0].id));
    $('rp').disabled = true;
    if (!$('rt').value) { $('rc').innerHTML = '<div class="tcard">No terms found.</div>'; return; }
    $('rc').innerHTML = '<p class="muted">Loading…</p>';
    const r = await buildCard(l, $('rt').value);
    if (r.state === 'ok') { $('rc').innerHTML = r.html; $('rp').disabled = false; }
    else $('rc').innerHTML = `<div class="tcard" style="text-align:center">${{
      none: '<h3>Report not available yet</h3><p class="muted">Reports appear here once the school publishes them.</p>',
      hold: '<h3>Please see the bursar</h3><p class="muted">This report is being held. Kindly contact the school bursar\'s office.</p>',
      error: '<h3>Could not load the report</h3><p class="muted">Check your connection and try again.</p>' }[r.state]}</div>`;
  }
  $('rt').onchange = show; if ($('rl')) $('rl').onchange = show;
  $('rp').onclick = () => { const c = main.querySelector('#rcard'); if (c) printElement(c); else toast('Nothing to print.', 'error'); };
  show();
}

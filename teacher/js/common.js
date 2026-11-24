/* teacher/js/common.js
 * Purpose: shared helpers for teacher pages (nav, styles, context loading). Role: teacher, admin.
 * Collections: settings/school, terms, allocations, classes, subjects
 */
import { fs, db } from '../../shared/firebase.js';
import { getSettings } from '../../shared/ui.js';
const { collection, doc, getDoc, getDocs, query, where, limit } = fs;

export const NAV = [
  { label: 'Home', href: 'index.html', icon: '🏠' },
  { label: 'Assessments', href: 'assessments.html', icon: '📝' },
  { label: 'Mark entry', href: 'marks.html', icon: '✏️' },
  { label: 'Mark sheet', href: 'marksheet.html', icon: '📊' },
  { label: 'Assignments', href: 'assignments.html', icon: '📥' },
  { label: 'Quizzes', href: 'quizzes.html', icon: '❓' },
  { label: 'Comments', href: 'comments.html', icon: '💬' },
  { label: 'Attendance', href: 'attendance.html', icon: '📅' },
  { label: 'Materials', href: 'materials.html', icon: '📚' }
];

export function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `.tgrid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.tcard{background:var(--paper,#fff);border:1px solid var(--line,#E6DFCF);border-radius:var(--radius,14px);padding:16px;box-shadow:var(--shadow)}
.tcard h3{margin:0 0 6px;font-family:'Playfair Display',Georgia,serif;color:var(--navy,#13203F)}
.muted{color:var(--muted,#6B7280)}.big{font-size:1.8rem;font-weight:700}
.trow{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:12px 0}
.trow label{display:flex;flex-direction:column;font-size:.85rem;gap:4px;flex:1 1 150px}
.trow input,.trow select,.tin{min-height:44px;padding:8px 10px;border:1px solid var(--line,#E6DFCF);border-radius:10px;font:inherit;background:var(--paper,#fff);color:var(--ink,#1B1F2A)}
.tbtn{min-height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--navy,#13203F);color:var(--gold,#C9A24A);font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.tbtn.alt{background:transparent;color:var(--navy,#13203F);border:1px solid var(--navy,#13203F)}
.tbtn.danger{background:var(--danger,#B3261E);color:#fff}
.tbl{width:100%;border-collapse:collapse}.tbl th,.tbl td{padding:8px;border-bottom:1px solid var(--line,#E6DFCF);text-align:left}
.tin.bad{border-color:var(--danger,#B3261E);background:#fdecea}.pill{padding:2px 10px;border-radius:99px;background:var(--cream,#FAF6EE);font-size:.8rem}
@media(max-width:600px){.tbl thead{display:none}.tbl tr{display:block;margin-bottom:10px;border:1px solid var(--line,#E6DFCF);border-radius:12px;padding:6px}.tbl td{display:flex;justify-content:space-between;border:0;gap:8px}.tbl td::before{content:attr(data-l);color:var(--muted,#6B7280)}}
`;
  document.head.appendChild(s);
}

export async function list(col, ...conds) {
  const s = await getDocs(query(collection(db, col), ...conds, limit(500)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Loads current term, the user's allocations (all for admin) and class/subject names. */
export async function loadContext(p) {
  const st = await getSettings();
  const school = st.school || st;
  let term = null;
  if (school.currentTermId) {
    const t = await getDoc(doc(db, 'terms', school.currentTermId));
    if (t.exists()) term = { id: t.id, ...t.data() };
  }
  const conds = [];
  if (p.role === 'teacher') conds.push(where('teacherUid', '==', p.uid));
  if (term) conds.push(where('termId', '==', term.id));
  const allocations = await list('allocations', ...conds);
  const classes = {}, subjects = {};
  await Promise.all([...new Set(allocations.map(a => a.classId))].map(async id => { const d = await getDoc(doc(db, 'classes', id)); classes[id] = d.exists() ? d.data() : { name: id }; }));
  await Promise.all([...new Set(allocations.map(a => a.subjectId))].map(async id => { const d = await getDoc(doc(db, 'subjects', id)); subjects[id] = d.exists() ? d.data() : { name: id }; }));
  const label = a => `${(classes[a.classId] || {}).name || a.classId} · ${(subjects[a.subjectId] || {}).name || a.subjectId}`;
  return { term, allocations, classes, subjects, label, school };
}

/** Auto-mark one answer. mcq/truefalse exact (case-insensitive); short: any of answer split by "|"; long: 0 (manual). */
export const gradeAnswer = (q, a) => {
  if (a == null || a === '') return 0;
  const n = s => String(s).trim().toLowerCase();
  if (q.type === 'mcq' || q.type === 'truefalse') return n(a) === n(q.answer) ? q.marks : 0;
  if (q.type === 'short') return String(q.answer).split('|').some(x => n(x) === n(a)) ? q.marks : 0;
  return 0;
};
/** Creates an assessment (source quiz/assignment) and its marks in one batch. scores: {learnerId: score}. Returns assessment id. */
export async function copyToTerm({ classId, subjectId, termId, allocationId, title, type, outOf, source, scores, uid }) {
  const { doc, collection, writeBatch, serverTimestamp } = fs;
  const ref = doc(collection(db, 'assessments')), b = writeBatch(db), ts = serverTimestamp();
  b.set(ref, { allocationId, classId, subjectId, termId, type, title, outOf, weightPercent: 0, date: new Date().toISOString().slice(0, 10), source, createdAt: ts, createdBy: uid, updatedAt: ts });
  Object.entries(scores).forEach(([lid, s]) => b.set(doc(db, 'marks', ref.id + '_' + lid), { assessmentId: ref.id, learnerId: lid, classId, subjectId, termId, score: s, enteredBy: uid, createdAt: ts, createdBy: uid, updatedAt: ts }));
  await b.commit(); return ref.id;
}

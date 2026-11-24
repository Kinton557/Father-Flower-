/* teacher/js/reportEngine.js
 * Purpose: compile marks into reports/{termId_learnerId} (status "draft").
 * Roles allowed: teacher (own class), admin, head (import and call).
 * Collections: classes, learners, assessments, marks, attendance, reports, subjects, terms, settings/grading, auditLog
 * Usage: import { compileReports } from '../teacher/js/reportEngine.js'
 */
import { fs, db } from '../../shared/firebase.js';
import { getSettings } from '../../shared/ui.js';
import { getProfile, audit } from '../../shared/auth.js';
const { collection, doc, getDoc, getDocs, query, where, writeBatch, serverTimestamp, limit } = fs;

const r1 = n => Math.round(n * 10) / 10;

async function list(col, ...conds) {
  const s = await getDocs(query(collection(db, col), ...conds, limit(2000)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Grade lookup; scales ordered high to low: [{min, grade, comment}] */
export function gradeFor(pct, scales) {
  if (pct == null) return { grade: '-', comment: '' };
  const sorted = [...(scales || [])].sort((a, b) => b.min - a.min);
  const hit = sorted.find(s => pct >= s.min);
  return hit ? { grade: hit.grade, comment: hit.comment || '' } : { grade: '-', comment: '' };
}

/** Competition ranking: ties share a position (1,1,3). items: [{key}] -> Map(item -> position) */
export function rank(items, keyFn) {
  const out = new Map();
  items.forEach(i => {
    const k = keyFn(i);
    out.set(i, 1 + items.filter(o => keyFn(o) > k).length);
  });
  return out;
}

/** One subject for one learner. asmts: assessments of the subject; marksBy: {assessmentId: markDoc} */
export function subjectResult(asmts, marksBy) {
  const missing = [], have = [];
  asmts.forEach(a => {
    const m = marksBy[a.id];
    if (!m || m.score == null || isNaN(m.score) || !(a.outOf > 0)) missing.push(a.id);
    else have.push({ a, pct: (m.score / a.outOf) * 100 });
  });
  if (!have.length) return { courseworkMark: null, examMark: null, total: null, missing };
  const avg = (arr, wFn) => {
    if (!arr.length) return null;
    const sw = arr.reduce((t, x) => t + wFn(x), 0) || arr.length;
    return arr.reduce((t, x) => t + x.pct * (sw === arr.length && !arr.some(y => wFn(y) > 0) ? 1 : wFn(x)), 0) / sw;
  };
  const cw = have.filter(h => h.a.type !== 'exam'), ex = have.filter(h => h.a.type === 'exam');
  const w = h => Number(h.a.weightPercent) || 0;
  const courseworkMark = cw.length ? avg(cw, w) : null;
  const examMark = ex.length ? avg(ex, w) : null;
  let total;
  if (asmts.some(a => Number(a.weightPercent) > 0)) {
    const sw = have.reduce((t, h) => t + w(h), 0);
    total = sw ? have.reduce((t, h) => t + h.pct * w(h), 0) / sw : have.reduce((t, h) => t + h.pct, 0) / have.length;
  } else if (courseworkMark != null && examMark != null) total = courseworkMark * 0.4 + examMark * 0.6;
  else total = courseworkMark != null ? courseworkMark : examMark;
  return {
    courseworkMark: courseworkMark == null ? null : r1(courseworkMark),
    examMark: examMark == null ? null : r1(examMark), total: r1(total), missing
  };
}

/**
 * Compile draft reports for a class. The whole form (same campus + form) is compiled so
 * positionInForm is correct. Reports not in "draft" are never overwritten.
 * Returns { compiled, skippedNotDraft, missing:[{learnerId,fullName,classId,subjectId,subjectName,assessmentId}] }
 */
export async function compileReports(classId, termId) {
  const me = getProfile();
  const settings = await getSettings();
  const scales = ((settings.grading || settings).scales) || [];
  const cs = await getDoc(doc(db, 'classes', classId));
  if (!cs.exists()) throw new Error('Class not found');
  const cls = { id: cs.id, ...cs.data() };
  const ts = await getDoc(doc(db, 'terms', termId));
  const term = ts.exists() ? ts.data() : {};
  const peers = await list('classes', where('campusId', '==', cls.campusId), where('form', '==', cls.form));
  const subjNames = {};
  const subjName = async id => {
    if (!(id in subjNames)) { const s = await getDoc(doc(db, 'subjects', id)); subjNames[id] = s.exists() ? s.data().name : id; }
    return subjNames[id];
  };
  const rows = [], missing = [];
  for (const c of peers) {
    const [learners, asms, marks, att, reps] = await Promise.all([
      list('learners', where('classId', '==', c.id), where('status', '==', 'active')),
      list('assessments', where('classId', '==', c.id), where('termId', '==', termId)),
      list('marks', where('classId', '==', c.id), where('termId', '==', termId)),
      list('attendance', where('classId', '==', c.id)),
      list('reports', where('classId', '==', c.id), where('termId', '==', termId))
    ]);
    const days = att.filter(a => (!term.startDate || a.date >= term.startDate) && (!term.endDate || a.date <= term.endDate));
    const bySubj = {};
    asms.forEach(a => (bySubj[a.subjectId] = bySubj[a.subjectId] || []).push(a));
    const markMap = {};
    marks.forEach(m => (markMap[m.assessmentId + '_' + m.learnerId] = m));
    for (const l of learners) {
      const subjects = [];
      for (const sid of Object.keys(bySubj)) {
        const mb = {};
        bySubj[sid].forEach(a => (mb[a.id] = markMap[a.id + '_' + l.id]));
        const r = subjectResult(bySubj[sid], mb);
        const name = await subjName(sid);
        r.missing.forEach(aid => missing.push({ learnerId: l.id, fullName: l.fullName, classId: c.id, subjectId: sid, subjectName: name, assessmentId: aid }));
        const g = gradeFor(r.total, scales);
        subjects.push({ subjectId: sid, name, courseworkMark: r.courseworkMark, examMark: r.examMark, total: r.total, grade: g.grade, comment: g.comment });
      }
      const totals = subjects.map(s => s.total).filter(t => t != null);
      const average = totals.length ? r1(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
      let present = 0, absent = 0;
      days.forEach(d => { const v = (d.records || {})[l.id]; if (v === 'absent') absent++; else if (v) present++; });
      rows.push({ l, c, subjects, average, attendance: { present, absent }, existing: reps.find(r => r.learnerId === l.id) });
    }
  }
  const ranked = rows.filter(r => r.average != null);
  const formPos = rank(ranked, r => r.average);
  const classPos = new Map();
  peers.forEach(c => {
    const g = ranked.filter(r => r.c.id === c.id);
    const p = rank(g, r => r.average);
    g.forEach(r => classPos.set(r, p.get(r)));
  });
  let compiled = 0, skippedNotDraft = 0, batch = writeBatch(db), n = 0;
  for (const r of rows) {
    if (r.existing && r.existing.status !== 'draft') { skippedNotDraft++; continue; }
    const ref = doc(db, 'reports', termId + '_' + r.l.id);
    const data = {
      learnerId: r.l.id, termId, classId: r.c.id, subjects: r.subjects, average: r.average,
      positionInClass: classPos.get(r) || null, positionInForm: formPos.get(r) || null,
      attendance: r.attendance, status: 'draft', updatedAt: serverTimestamp()
    };
    if (!r.existing) Object.assign(data, { classTeacherComment: '', headComment: '', createdAt: serverTimestamp(), createdBy: me.uid });
    batch.set(ref, data, { merge: true });
    compiled++;
    if (++n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
  }
  if (n) await batch.commit();
  await audit('compile_reports', 'reports/' + termId + '_' + classId, { compiled, skippedNotDraft, missing: missing.length });
  return { compiled, skippedNotDraft, missing };
}

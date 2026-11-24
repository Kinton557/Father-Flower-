/* learner/js/common.js — nav + helpers for learner pages. Role: learner (admin may preview). Collections: learners */
import { fs, db } from '../../shared/firebase.js';
import { getProfile } from '../../shared/auth.js';
import { list } from '../../teacher/js/common.js';
export { injectStyles, list } from '../../teacher/js/common.js';
const { where } = fs;
export const NAV = [
  { label: 'Home', href: 'index.html', icon: '🏠' }, { label: 'Quizzes', href: 'quizzes.html', icon: '❓' },
  { label: 'Assignments', href: 'assignments.html', icon: '📥' }, { label: 'Results', href: 'results.html', icon: '📊' },
  { label: 'Report card', href: 'report.html', icon: '🎓' }, { label: 'Timetable', href: 'timetable.html', icon: '🗓️' },
  { label: 'Materials', href: 'materials.html', icon: '📚' }, { label: 'Attendance', href: 'attendance.html', icon: '📅' },
  { label: 'Notices', href: 'notices.html', icon: '📢' }, { label: 'Profile', href: 'profile.html', icon: '👤' }
];
/** The learner record for the signed-in learner (learners.userUid == uid). */
export async function getMyLearner(p) {
  const r = await list('learners', where('userUid', '==', p.uid));
  return r[0] || null;
}

/** Timestamp | ISO string -> milliseconds (NaN-safe: returns null when missing). */
export const toMs = v => (v == null || v === '' ? null : v.toMillis ? v.toMillis() : Date.parse(v));
/** Notices for an audience ('learner' | 'parent') at a campus; only published ones (publishAt <= now), pinned first. */
export async function noticesFor(audience, campusId, uid) {
  const now = Date.now();
  const me = uid || (getProfile() || {}).uid;
  /* general notices for the audience, plus notices sent directly to this person (exeats, summons) */
  const jobs = [list('notices', where('audience', 'array-contains', audience))];
  if (me) jobs.push(list('notices', where('targetUids', 'array-contains', me)).catch(() => []));
  const seen = new Set();
  return (await Promise.all(jobs)).flat().filter(n => !seen.has(n.id) && seen.add(n.id))
    .filter(n => (!n.campusId || n.campusId === 'all' || n.campusId === campusId) && (toMs(n.publishAt) == null || toMs(n.publishAt) <= now))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (toMs(b.publishAt) || 0) - (toMs(a.publishAt) || 0));
}
export { gradeAnswer } from '../../teacher/js/common.js';

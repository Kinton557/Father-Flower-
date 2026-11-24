/* parent/js/common.js — nav + helpers for parent pages. Role: parent (admin may preview). Collections: learners */
import { fs } from '../../shared/firebase.js';
import { list } from '../../teacher/js/common.js';
export { injectStyles, list } from '../../teacher/js/common.js';
const { where } = fs;
export const NAV = [
  { label: 'Home', href: 'index.html', icon: '🏠' }, { label: 'Report cards', href: 'report.html', icon: '🎓' }
];
/** Children linked to this parent: learners where guardianUids array-contains uid. */
export async function getChildren(p) {
  return (await list('learners', where('guardianUids', 'array-contains', p.uid))).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

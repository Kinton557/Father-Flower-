/* Schools page. Role: public. Collections read: settings/school, campuses. */
import { initPage, getCampuses, campusCard, skeletonCards, esc, $, $$, photoFallbacks } from './site.js';

const grid = $('#campus-grid'); grid.innerHTML = skeletonCards(3);
const pc = getCampuses();
const school = await initPage('schools');
$('#ho-address').textContent = school.address || '';
const campuses = await pc;

function render(f) {
  /* campuses whose level is not yet confirmed show under both level filters */
  const rows = campuses.filter(c => f === 'all' || (f === 'boarding' ? c.boarding : (!c.level || c.level === 'both' || c.level === f)));
  grid.innerHTML = rows.length ? rows.map(c => campusCard(c, school)).join('') : '<p class="muted">No campuses match this filter yet.</p>';
  photoFallbacks(grid);
}
$$('.chip').forEach(b => b.addEventListener('click', () => {
  $$('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  render(b.dataset.f);
}));
render('all');

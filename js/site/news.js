/* News page: list with search + campus filter, article view via hash (news.html#<id>).
   Role: public. Collections read: news (published == true only), campuses. */
import { initPage, getCampuses, getNews, getFirebase, newsCard, skeletonCards, esc, safeUrl, fmtDate, timeout, $, photoFallbacks } from './site.js';

const grid = $('#news-grid'); grid.innerHTML = skeletonCards(3);
const pCampus = getCampuses(), pNews = getNews(50);
const school = await initPage('news');
const baseTitle = document.title;

const campuses = await pCampus;
$('#campus').insertAdjacentHTML('beforeend', campuses.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join(''));
let all = await pNews;

function renderList() {
  if (all === null) { grid.innerHTML = '<p class="muted">News could not be loaded right now. Please check your connection and try again.</p>'; return; }
  const q = $('#q').value.trim().toLowerCase(), cp = $('#campus').value;
  const rows = all.filter(n => (!cp || !n.campusId || n.campusId === 'all' || n.campusId === cp) &&
    (!q || `${n.title} ${n.summary}`.toLowerCase().includes(q)));
  grid.innerHTML = rows.length ? rows.map(newsCard).join('') : `<p class="muted">${all.length ? 'No news matches your search.' : 'News will appear here soon.'}</p>`;
  photoFallbacks(grid);
}
$('#q').addEventListener('input', renderList);
$('#campus').addEventListener('change', renderList);

async function renderArticle(id) {
  const box = $('#article');
  box.innerHTML = '<div class="sk" style="height:200px"></div>';
  let n = all && all.find(x => x.id === id);
  if (!n) {
    try {
      const f = await getFirebase();
      const s = await timeout(f.fs.getDoc(f.fs.doc(f.db, 'news', id)), 7000);
      if (s.exists() && s.data().published === true) n = { id: s.id, ...s.data() };
    } catch (e) { /* not found */ }
  }
  if (!n) { box.innerHTML = '<h1>Article not found</h1><p class="muted">It may have been removed or is not published.</p><p><a class="link-more" href="news.html">&larr; Back to news</a></p>'; return; }
  document.title = `${n.title} | ${school.name}`;
  const img = safeUrl(n.imageUrl);
  const paras = String(n.body || n.summary || '').split(/\n{2,}|\r\n\r\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const share = 'https://wa.me/?text=' + encodeURIComponent(`${n.title} ${location.href}`);
  box.innerHTML = `<p class="muted small">${esc(fmtDate(n.publishedAt))}</p><h1>${esc(n.title)}</h1>
    ${img ? `<figure class="photo"><img src="${esc(img)}" alt="" width="1200" height="675" decoding="async"></figure>` : ''}${paras}
    <div class="actions"><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="${esc(share)}">Share on WhatsApp</a><a class="btn btn-ghost btn-sm" style="color:var(--navy)" href="news.html">&larr; All news</a></div>`;
}

function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  const art = !!id;
  $('#list-view').hidden = art; $('#article-view').hidden = !art;
  if (art) { renderArticle(id); window.scrollTo(0, 0); } else { document.title = baseTitle; renderList(); }
}
window.addEventListener('hashchange', route);
route();

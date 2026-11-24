/* Home page logic. Role: public. Collections read: settings/school, campuses, news. */
import { initPage, getCampuses, getNews, campusCard, newsCard, skeletonCards, animateCounters, photoFallbacks, esc, $, SLOGAN } from './site.js';

$('#campus-grid').innerHTML = skeletonCards(3);
$('#news-grid').innerHTML = skeletonCards(3);

const pCampus = getCampuses();
const pNews = getNews(3);
const school = await initPage('home');

/* Hero and story text (admin may override with heroTitle / heroText) */
$('#hero-eyebrow').textContent = school.tagline || 'The Leading Light';
if (school.heroTitle) $('#hero-title').textContent = school.heroTitle;
$('#hero-text').textContent = school.heroText || `Primary and high school education with boarding and day options, at a price families can afford. ${SLOGAN}`;
$('#vision-text').textContent = school.vision || '';
if (school.storyText) $('#story-text').textContent = school.storyText;

/* Founder */
$('#founder-name').textContent = school.founderName || '';
$('#founder-title').textContent = school.founderTitle || '';
$('#founder-text').textContent = school.founderMessage ||
  `${school.founderName || 'Our founder'} founded the network in ${school.founded || 2021} with one aim: ${String(school.motto || '').replace(/\.$/, '').toLowerCase()}. ${SLOGAN}`;

/* Campuses */
const campuses = await pCampus;
$('#campus-grid').innerHTML = campuses.slice(0, 6).map(c => campusCard(c, school)).join('');

/* Stats: only figures that are real or configured. A pass rate shows only when the admin sets stats.passRate. */
const st = school.stats || {};
const items = [
  [st.schools ?? campuses.length, 'Campuses', ''],
  [st.years ?? Math.max(1, new Date().getFullYear() - (school.founded || 2021)), 'Years of service', '+']
];
if (st.passRate != null) items.push([st.passRate, 'Pass rate', '%']);
if (st.learners != null) items.push([st.learners, 'Learners', '+']);
$('#stats').innerHTML = items.map(([n, l, s]) =>
  `<div class="stat"><div class="num"><span class="count" data-to="${esc(n)}">${esc(n)}</span><span>${esc(s)}</span></div><div class="lbl">${esc(l)}</div></div>`).join('');
animateCounters($('#stats'));

/* News */
const news = await pNews;
$('#news-grid').innerHTML = news && news.length
  ? news.map(newsCard).join('')
  : `<p class="muted">${news === null ? 'News could not be loaded right now.' : 'News from our schools will appear here soon.'}</p>`;

photoFallbacks();

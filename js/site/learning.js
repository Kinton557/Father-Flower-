/* Learning page. Role: public. Collections read: settings/school (contact only). */
import { initPage, telHref, $ } from './site.js';

const school = await initPage('learning');
const p = (school.phones || [])[0];
if (p) { const a = $('#tr-phone'); a.textContent = p; a.href = telHref(p); }

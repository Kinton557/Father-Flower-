/* Registration request page. Role: public. Writes an admissions doc (status "new"); never creates an account. */
import { initPage } from './site.js';
import { initApplyForm } from './applyForm.js';

await initPage('register');
initApplyForm({ rateKey: 'ff_reg_last', notes: 'Registration request (register.html)' });

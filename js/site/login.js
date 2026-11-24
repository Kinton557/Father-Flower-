/* Login page logic. Role: public. Uses shared/auth.js: loginWithId, loginWithGoogle, changePassword, ROLE_HOME.
   Collections used: users (best-effort clear of mustChangePassword only). */
import { initPage, esc, $, getFirebase } from './site.js';

const school = await initPage('login');
$('#help-contact').innerHTML = `Need help? Call ${esc((school.phones || [])[0] || '')} or email <a href="mailto:${esc(school.email || '')}">${esc(school.email || '')}</a> (${esc(school.officeHours || '')}).`;

let auth = null;
try { auth = await import('../../shared/auth.js'); } catch (e) { /* shown below */ }

const loginForm = $('#login-form'), loginBtn = $('#login-btn'), googleBtn = $('#google-btn');
const errBox = $('#login-error'), chgErr = $('#change-error');

function showErr(box, msg) { box.textContent = msg; box.hidden = !msg; }
function busy(btn, on, label) { btn.disabled = on; if (label) btn.dataset.label = btn.dataset.label || btn.textContent; btn.textContent = on ? (label || 'Please wait…') : (btn.dataset.label || btn.textContent); }

function friendly(err) {
  const c = String(err?.code || '');
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'That ID number or password is not correct. Check both and try again.';
  if (/too-many-requests/.test(c)) return 'Too many attempts. Please wait a few minutes, or ask the school office to reset your password.';
  if (/network-request-failed/.test(c) || err?.code === 'timeout') return 'No internet connection. Check your data or Wi-Fi and try again.';
  if (/user-disabled/.test(c)) return 'This account has been switched off. Please contact the school office.';
  if (/popup-blocked/.test(c)) return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
  if (/unauthorized-domain/.test(c)) return 'Google sign-in is not available on this web address yet. Use your ID number instead.';
  const m = String(err?.message || '');
  if (m && !/firebase|auth\//i.test(m) && m.length < 160) return m;
  return 'We could not sign you in right now. Please try again, or contact the school office.';
}

function go(profile) {
  const home = (auth.ROLE_HOME || {})[profile?.role];
  location.replace(home || 'dashboard.html');
}

if (!auth) showErr(errBox, 'Sign-in is temporarily unavailable. Please try again shortly or contact the school office.');

/* Show / hide password */
$('#toggle-pw').addEventListener('click', e => {
  const i = $('#password'), show = i.type === 'password';
  i.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Hide' : 'Show';
  e.currentTarget.setAttribute('aria-pressed', String(show));
});

async function afterLogin(res) {
  const profile = res?.profile || res;
  if (profile?.mustChangePassword) { showChange(res); return; }
  go(profile);
}

loginForm.addEventListener('submit', async e => {
  e.preventDefault(); showErr(errBox, '');
  if (!auth) return showErr(errBox, 'Sign-in is temporarily unavailable. Please try again shortly.');
  const id = $('#loginId').value.trim().replace(/\s+/g, ''), pw = $('#password').value;
  if (!id) return showErr(errBox, 'Please enter your ID number.');
  if (id.includes('@')) return showErr(errBox, 'Use your ID number (for example J0016), not an email address. Staff can use the Google button below.');
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(id)) return showErr(errBox, 'Your ID number should only contain letters and numbers.');
  if (!pw) return showErr(errBox, 'Please enter your password.');
  busy(loginBtn, true, 'Signing in…');
  try { await afterLogin(await auth.loginWithId(id, pw)); }
  catch (err) { showErr(errBox, friendly(err)); busy(loginBtn, false); $('#password').focus(); }
});

googleBtn.addEventListener('click', async () => {
  showErr(errBox, '');
  if (!auth) return showErr(errBox, 'Sign-in is temporarily unavailable. Please try again shortly.');
  busy(googleBtn, true, 'Opening Google…');
  try { await afterLogin(await auth.loginWithGoogle()); }
  catch (err) {
    if (!/popup-closed-by-user|cancelled-popup-request/.test(String(err?.code))) showErr(errBox, friendly(err));
    busy(googleBtn, false);
  }
});

/* Forced password change */
function showChange(res) {
  $('#login-panel').hidden = true; $('#change-panel').hidden = false; $('#newPw').focus();
  const form = $('#change-form'), btn = $('#change-btn');
  form.addEventListener('submit', async e => {
    e.preventDefault(); showErr(chgErr, '');
    const a = $('#newPw').value, b = $('#newPw2').value;
    if (a.length < 8) return showErr(chgErr, 'Your password must be at least 8 characters.');
    if (!/[A-Za-z]/.test(a) || !/\d/.test(a)) return showErr(chgErr, 'Your password needs at least one letter and one number.');
    if (a !== b) return showErr(chgErr, 'The two passwords do not match.');
    busy(btn, true, 'Saving…');
    try {
      await auth.changePassword(a);
      try { /* best effort: the integrator's changePassword should already clear this flag */
        const f = await getFirebase(); const uid = res?.uid || res?.profile?.uid;
        if (f && uid) await f.fs.updateDoc(f.fs.doc(f.db, 'users', uid), { mustChangePassword: false, updatedAt: f.fs.serverTimestamp() });
      } catch (e2) { /* ignore */ }
      go(res?.profile || res);
    } catch (err) {
      showErr(chgErr, /requires-recent-login/.test(String(err?.code)) ? 'For security, please sign in again and then change your password.' : friendly(err));
      busy(btn, false);
    }
  });
}

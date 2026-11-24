/* ============================================================
   Father Flower: sign-in, roles and account helpers (integrator)
   Login uses an ID number + password. The ID becomes an email behind the scenes:
   <id lowercased>@users.fatherflower.school
   Roles live in Firestore users/{uid}. Google sign-in works after an account is linked.
   ============================================================ */
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, createUserWithEmailAndPassword, deleteUser
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { auth, db, fs, firebaseConfig } from './firebase.js';

export const LOGIN_DOMAIN = '@users.fatherflower.school';

export const ROLE_HOME = {
  admin: 'admin/index.html', head: 'head/index.html', deputy: 'deputy/index.html',
  sdc: 'sdc/index.html', bursar: 'bursar/index.html', boarding: 'boarding/index.html',
  teacher: 'teacher/index.html', learner: 'learner/index.html', parent: 'parent/index.html'
};
export const STAFF_ROLES = ['admin', 'head', 'deputy', 'sdc', 'bursar', 'boarding', 'teacher'];

/* Site root (the folder that holds login.html). shared/ sits one level below it. */
const ROOT = new URL('../', import.meta.url);
export const siteUrl = path => new URL(path, ROOT).href;

let _profile = null;

export const normId = id => String(id || '').trim().replace(/\s+/g, '').toUpperCase();
export const emailFor = id => normId(id).toLowerCase() + LOGIN_DOMAIN;

function appError(code, message) { return Object.assign(new Error(message), { code }); }

async function loadProfile(uid) {
  const s = await fs.getDoc(fs.doc(db, 'users', uid));
  if (!s.exists()) return null;
  return { uid, ...s.data() };
}

export function getProfile() { return _profile; }
export function currentUser() { return auth.currentUser; }

/* Wait for Firebase to restore a saved session (or confirm there is none). */
function authReady() {
  return new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
}

/* ---------- sign in ---------- */
export async function loginWithId(loginId, password) {
  const id = normId(loginId);
  let email = emailFor(id);
  try { /* a password reset moves the account to a new login email; look it up first */
    const a = await fs.getDoc(fs.doc(db, 'loginAliases', id));
    if (a.exists() && a.data().authEmail) email = a.data().authEmail;
  } catch (e) { /* no alias: use the normal email */ }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const profile = await loadProfile(cred.user.uid);
  if (!profile) { await signOut(auth); throw appError('app/no-profile', 'Your login works, but your school account is not set up yet. Please contact the school office.'); }
  if (profile.active === false) { await signOut(auth); throw appError('app/inactive', 'This account has been switched off. Please contact the school office.'); }
  _profile = profile;
  return { uid: cred.user.uid, profile };
}

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  const profile = await loadProfile(cred.user.uid).catch(() => null);
  if (!profile || profile.active === false) {
    try { if (cred._tokenResponse?.isNewUser) await deleteUser(cred.user); else await signOut(auth); } catch (e) { try { await signOut(auth); } catch (e2) { /* ignore */ } }
    throw appError('app/google-not-linked', 'This Google account is not linked to a school account yet. Sign in once with your ID number and password, then choose "Link Google" from your menu.');
  }
  _profile = profile;
  return { uid: cred.user.uid, profile };
}

/* Called from the signed-in menu. After this, the Google button on the login page works for this person. */
export async function linkGoogle() {
  if (!auth.currentUser) throw appError('app/not-signed-in', 'Please sign in first.');
  await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
}

export async function logout() {
  try { await signOut(auth); } catch (e) { /* ignore */ }
  _profile = null;
  location.replace(siteUrl('login.html'));
}

/* ---------- page guard ---------- */
export function requireRole(allowedRoles, onReady) {
  return (async () => {
    const user = await authReady();
    if (!user) { location.replace(siteUrl('login.html') + '?next=' + encodeURIComponent(location.pathname.split('/').slice(-2).join('/'))); return; }
    let profile;
    try { profile = await loadProfile(user.uid); }
    catch (e) { console.error(e); document.body.innerHTML = '<p style="font:16px system-ui;padding:24px">We could not load your account. Check your connection and refresh the page.</p>'; return; }
    if (!profile || profile.active === false) { await signOut(auth); location.replace(siteUrl('login.html') + '?e=noaccess'); return; }
    _profile = profile;
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!allowed.includes(profile.role) && profile.role !== 'admin') {
      location.replace(siteUrl(ROLE_HOME[profile.role] || 'login.html')); return;
    }
    if (profile.mustChangePassword) await forcePasswordChange();
    return onReady ? onReady(profile) : profile;
  })();
}

/* Blocking screen shown until a temporary password has been replaced. No other module is needed. */
function forcePasswordChange() {
  return new Promise(resolve => {
    const o = document.createElement('div');
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
    o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#13203F;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif';
    o.innerHTML = `<form style="background:#fff;border-radius:14px;padding:24px;max-width:380px;width:100%;box-shadow:0 6px 24px rgba(0,0,0,.3)">
      <h2 style="margin:0 0 6px;font-family:'Playfair Display',Georgia,serif;color:#13203F">Choose a new password</h2>
      <p style="margin:0 0 14px;color:#6B7280;font-size:.95rem">Your password is temporary. Set your own to continue.</p>
      <label style="display:block;margin-bottom:10px;font-size:.9rem">New password<input id="np1" type="password" autocomplete="new-password" style="width:100%;min-height:44px;padding:8px 12px;border:1px solid #E6DFCF;border-radius:10px;margin-top:4px;font-size:1rem"></label>
      <label style="display:block;margin-bottom:10px;font-size:.9rem">Repeat password<input id="np2" type="password" autocomplete="new-password" style="width:100%;min-height:44px;padding:8px 12px;border:1px solid #E6DFCF;border-radius:10px;margin-top:4px;font-size:1rem"></label>
      <p id="npe" role="alert" style="color:#B3261E;min-height:1.2em;margin:0 0 8px;font-size:.9rem"></p>
      <button style="width:100%;min-height:46px;border:0;border-radius:12px;background:#13203F;color:#C9A24A;font-weight:600;font-size:1rem;cursor:pointer">Save password</button></form>`;
    document.body.appendChild(o);
    const f = o.querySelector('form'), e = o.querySelector('#npe');
    f.onsubmit = async ev => {
      ev.preventDefault(); const a = o.querySelector('#np1').value, b = o.querySelector('#np2').value;
      if (a.length < 8 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) { e.textContent = 'Use at least 8 characters with a letter and a number.'; return; }
      if (a !== b) { e.textContent = 'The two passwords do not match.'; return; }
      try { await changePassword(a); o.remove(); resolve(); }
      catch (x) { e.textContent = /requires-recent-login/.test(String(x.code)) ? 'For security, sign out, sign in again and retry.' : 'Could not save. Try again.'; }
    };
  });
}

export async function changePassword(newPassword) {
  if (!auth.currentUser) throw appError('app/not-signed-in', 'Please sign in first.');
  await updatePassword(auth.currentUser, newPassword);
  const uid = auth.currentUser.uid;
  try { await fs.updateDoc(fs.doc(db, 'users', uid), { mustChangePassword: false, updatedAt: fs.serverTimestamp() }); } catch (e) { console.error(e); }
  if (_profile) _profile.mustChangePassword = false;
}

/* ---------- audit log (never blocks the action it records) ---------- */
export async function audit(action, targetPath, details) {
  try {
    const p = _profile || {};
    await fs.addDoc(fs.collection(db, 'auditLog'), {
      actorUid: auth.currentUser?.uid || '', actorRole: p.role || '', actorName: p.fullName || '',
      action: String(action || ''), targetPath: String(targetPath || ''),
      details: JSON.parse(JSON.stringify(details || {})), at: fs.serverTimestamp(), createdAt: fs.serverTimestamp()
    });
  } catch (e) { console.error('audit failed', e); }
}

/* ---------- accounts (admin only) ---------- */
/* A second Firebase app instance creates the login so the admin stays signed in. */
async function withSecondaryAuth(fn) {
  const name = 'ff-secondary-' + Date.now();
  const app2 = initializeApp(firebaseConfig, name), auth2 = getAuth(app2);
  try { return await fn(auth2); }
  finally { try { await signOut(auth2); } catch (e) { /* ignore */ } try { await deleteApp(app2); } catch (e) { /* ignore */ } }
}

export async function createUserAccount(o) {
  const me = _profile;
  if (!me || me.role !== 'admin') throw appError('app/not-allowed', 'Only the admin can create accounts.');
  const loginId = normId(o.loginId);
  if (!/^[A-Z0-9._-]{3,40}$/.test(loginId)) throw appError('app/bad-id', 'The ID may only contain letters and numbers.');
  if (!o.password || o.password.length < 6) throw appError('app/weak-password', 'The temporary password is too short.');
  return withSecondaryAuth(async auth2 => {
    const cred = await createUserWithEmailAndPassword(auth2, emailFor(loginId), o.password);
    try {
      await fs.setDoc(fs.doc(db, 'users', cred.user.uid), {
        loginId, fullName: o.fullName || '', role: o.role, campusId: o.campusId || '', email: o.email || '', phone: o.phone || '',
        active: true, mustChangePassword: true, photoUrl: '', extra: o.extra || {},
        createdAt: fs.serverTimestamp(), createdBy: me.uid, updatedAt: fs.serverTimestamp()
      });
    } catch (e) { try { await deleteUser(cred.user); } catch (e2) { /* ignore */ } throw e; }
    return cred.user.uid;
  });
}

/* Firebase cannot change someone else's password from a web page without a server.
   Instead the person gets a fresh login under a new internal email, the profile and links move over,
   and loginAliases/{ID} tells the login page which email to use. The old login stays orphaned and is blocked (no profile). */
export async function resetUserPassword(uid, newPassword) {
  const me = _profile;
  if (!me || me.role !== 'admin') throw appError('app/not-allowed', 'Only the admin can reset passwords.');
  const old = await fs.getDoc(fs.doc(db, 'users', uid));
  if (!old.exists()) throw appError('app/no-profile', 'User not found.');
  const data = old.data(), loginId = normId(data.loginId);
  const authEmail = loginId.toLowerCase() + '.r' + Date.now().toString(36) + LOGIN_DOMAIN;
  const newUid = await withSecondaryAuth(async auth2 => (await createUserWithEmailAndPassword(auth2, authEmail, newPassword)).user.uid);
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, 'users', newUid), { ...data, mustChangePassword: true, previousUid: uid, updatedAt: fs.serverTimestamp() });
  batch.delete(fs.doc(db, 'users', uid));
  batch.set(fs.doc(db, 'loginAliases', loginId), { authEmail, uid: newUid, updatedAt: fs.serverTimestamp() });
  await batch.commit();
  /* move the links other records hold to the old uid */
  const q = (c, f, op, v) => fs.getDocs(fs.query(fs.collection(db, c), fs.where(f, op, v), fs.limit(500)));
  const [byUser, byGuardian, byTeacher, byClassTeacher] = await Promise.all([
    q('learners', 'userUid', '==', uid), q('learners', 'guardianUids', 'array-contains', uid),
    q('allocations', 'teacherUid', '==', uid), q('classes', 'classTeacherUid', '==', uid)
  ]);
  const b2 = fs.writeBatch(db);
  byUser.docs.forEach(d => b2.update(d.ref, { userUid: newUid }));
  byGuardian.docs.forEach(d => b2.update(d.ref, { guardianUids: (d.data().guardianUids || []).map(x => x === uid ? newUid : x) }));
  byTeacher.docs.forEach(d => b2.update(d.ref, { teacherUid: newUid }));
  byClassTeacher.docs.forEach(d => b2.update(d.ref, { classTeacherUid: newUid }));
  await b2.commit();
  return newUid;
}

export { auth };

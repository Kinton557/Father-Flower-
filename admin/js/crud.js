// Purpose: small reusable list + add/edit/delete section for a collection (used by deputy pages). Role: caller decides.
// Collections: whichever `coll` is passed. Writes createdAt/createdBy/updatedAt and audits every create, update and delete.
import { db, fs } from '../../shared/firebase.js';
import * as A from '../../shared/auth.js';
import { esc, toast, modal, confirmBox, setLoading } from '../../shared/ui.js';
const S = 'display:block;width:100%;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:10px';
export async function loadRef(coll, label, ...cs) { const s = await fs.getDocs(fs.query(fs.collection(db, coll), ...cs, fs.limit(300))); return s.docs.map(d => ({ id: d.id, label: label(d.data()) })); }
export function crud({ main, title, coll, fields, refs = {}, defaults = {}, actions = [], me, cons = [] }) {
  const box = document.createElement('section');
  box.innerHTML = `<h2 style="margin:20px 0 8px">${esc(title)}</h2><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><input class="q" placeholder="Search" aria-label="Search ${esc(title)}" style="flex:1 1 160px;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:10px"><button class="btn btn-primary add" style="min-height:44px">Add</button></div><div class="list"></div>`;
  main.append(box); const L = box.querySelector('.list'); let rows = [];
  const lbl = (k, id) => refs[k]?.find(o => o.id === id)?.label || id || '';
  const text = r => fields.map(([k, , t]) => t === 'ref' ? lbl(k, r[k]) : t === 'bool' ? (r[k] ? k : '') : r[k]).filter(x => x !== '' && x != null).join(' · ');
  function draw() {
    const t = box.querySelector('.q').value.trim().toLowerCase(), v = rows.filter(r => !t || text(r).toLowerCase().includes(t));
    L.innerHTML = v.length ? v.map(r => `<div class="card" style="padding:12px 16px;margin-bottom:8px"><div>${esc(text(r))}</div><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn" style="min-height:44px" data-a="edit" data-id="${esc(r.id)}">Edit</button>${actions.map((a, i) => `<button class="btn" style="min-height:44px" data-a="x${i}" data-id="${esc(r.id)}">${esc(a.label)}</button>`).join('')}<button class="btn" style="min-height:44px" data-a="del" data-id="${esc(r.id)}">Delete</button></div></div>`).join('') : '<p>Nothing here yet. Use “Add”.</p>';
  }
  async function load() { setLoading(L, true); try { rows = (await fs.getDocs(fs.query(fs.collection(db, coll), ...cons, fs.limit(50)))).docs.map(d => ({ id: d.id, ...d.data() })); draw(); } catch (e) { console.error(e); L.innerHTML = '<p role="alert" style="color:var(--danger)">Could not load. Refresh and try again.</p>'; } setLoading(L, false); }
  function form(r = {}) {
    const edit = !!r.id, id = k => `${coll}-${k}`;
    modal({ title: (edit ? 'Edit ' : 'Add to ') + title.toLowerCase(), bodyHTML: fields.map(([k, l, t, o]) => {
      const v = r[k], lab = x => `<label style="display:block;margin-bottom:10px">${esc(l)}${x}</label>`;
      if (t === 'bool') return `<label style="display:block;margin-bottom:10px"><input id="${id(k)}" type="checkbox"${v ? ' checked' : ''}> ${esc(l)}</label>`;
      if (t === 'textarea') return lab(`<textarea id="${id(k)}" rows="3" style="${S}">${esc(v || '')}</textarea>`);
      if (t === 'select' || t === 'ref') return lab(`<select id="${id(k)}" style="${S}">${t === 'ref' ? '<option value="">Choose…</option>' : ''}${(t === 'ref' ? refs[k] || [] : o.map(x => ({ id: x, label: x }))).map(x => `<option value="${esc(x.id)}"${x.id === v ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>`);
      return lab(`<input id="${id(k)}" type="${t}" value="${esc(v ?? '')}" style="${S}">`);
    }).join(''), actions: [{ label: 'Save', primary: true, onClick: async () => {
      const d = {}; for (const [k, l, t] of fields) { const el = document.getElementById(id(k)); d[k] = t === 'bool' ? el.checked : t === 'number' ? Number(el.value) : el.value.trim(); }
      const bad = fields.find(([k, , t, o, opt]) => t !== 'bool' && opt !== 'optional' && (d[k] === '' || (t === 'number' && isNaN(d[k]))));
      if (bad) { toast(`Fill in “${bad[1]}”.`, 'error'); return false; }
      try {
        if (edit) await fs.updateDoc(fs.doc(db, coll, r.id), { ...d, updatedAt: fs.serverTimestamp() });
        else await fs.addDoc(fs.collection(db, coll), { ...defaults, ...d, createdAt: fs.serverTimestamp(), createdBy: me.uid, updatedAt: fs.serverTimestamp() });
        await A.audit((edit ? 'update.' : 'create.') + coll, coll + '/' + (r.id || ''), {}); toast('Saved', 'success'); load();
      } catch (e) { console.error(e); toast('Could not save. Try again.', 'error'); return false; }
    } }, { label: 'Cancel' }] });
  }
  box.addEventListener('click', async e => {
    if (e.target.closest('.add')) return form();
    const b = e.target.closest('[data-a]'); if (!b) return; const r = rows.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'edit') form(r);
    if (b.dataset.a === 'del' && await confirmBox('Delete this record?')) { try { await fs.deleteDoc(fs.doc(db, coll, r.id)); await A.audit('delete.' + coll, coll + '/' + r.id, {}); load(); } catch (x) { console.error(x); toast('Could not delete.', 'error'); } }
    if (b.dataset.a[0] === 'x') actions[+b.dataset.a.slice(1)].fn(r);
  });
  box.querySelector('.q').oninput = draw; load();
}

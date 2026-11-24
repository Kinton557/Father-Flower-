/*
 * bursar/js/crud.js
 * Purpose: small config-driven list + form engine used by plans, expenditure, budget, SDC and Boarding pages.
 * Role allowed: whatever the page passes to requireRole.
 * Collections used: the one named in the page config (plus learners for the "learner" field type).
 */
import { requireRole, audit } from '../../shared/auth.js';
import { db, fs } from '../../shared/firebase.js';
import { esc, toast, confirmBox, renderShell, fmtDate, saveFile } from '../../shared/ui.js';
import { scopeWhere, campusScope, loadCampuses, toCents, centsToInput, usd, showErr, tsMillis } from './common.js';

const optV = (o) => (typeof o === 'string' ? o : o.v);
const optL = (o) => (typeof o === 'string' ? o : o.l);

export function fmtCell(f, v) {
  if (v === undefined || v === null || v === '') return '';
  if (f.display) return esc(f.display(v));
  switch (f.type) {
    case 'money': return esc(usd(v));
    case 'date': return esc(fmtDate(v));
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'multi': return esc((v || []).join(', '));
    case 'images': return `${(v || []).length} photo(s)`;
    case 'select': {
      const o = (f.options || []).find((x) => optV(x) === v);
      return esc(o ? optL(o) : v);
    }
    case 'textarea': return esc(String(v).length > 140 ? String(v).slice(0, 140) + '...' : v);
    default: return esc(String(v));
  }
}

function fieldHTML(f, v) {
  const common = `name="${f.key}" id="f_${f.key}"${f.required ? ' required' : ''}`;
  const wrap = (inner) => `<label class="${f.wide ? 'b-wide' : ''}">${esc(f.label)}${inner}</label>`;
  switch (f.type) {
    case 'textarea': return wrap(`<textarea ${common} maxlength="${f.max || 3000}">${esc(f.format ? f.format(v) : (v ?? ''))}</textarea>`);
    case 'select': return wrap(`<select ${common}><option value="">Choose</option>${(f.options || []).map((o) => `<option value="${esc(optV(o))}"${optV(o) === v ? ' selected' : ''}>${esc(optL(o))}</option>`).join('')}</select>`);
    case 'checkbox': return `<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="${f.key}" style="width:auto;min-height:auto"${v ? ' checked' : ''}> ${esc(f.label)}</label>`;
    case 'multi': return wrap(`<span style="display:flex;flex-wrap:wrap;gap:12px">${f.options.map((o) => `<span style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" data-multi="${f.key}" value="${esc(o)}" style="width:auto;min-height:auto"${(v || []).includes(o) ? ' checked' : ''}>${esc(o)}</span>`).join('')}</span>`);
    case 'images': return wrap(`<input type="file" name="${f.key}" accept="image/*" multiple>${(v || []).length ? `<small>${v.length} saved. New files are added.</small>` : ''}`);
    case 'number': return wrap(`<input type="number" ${common} inputmode="numeric" step="any"${f.min != null ? ` min="${f.min}"` : ''}${f.max != null ? ` max="${f.max}"` : ''} value="${esc(v ?? '')}">`);
    case 'money': return wrap(`<input type="text" inputmode="decimal" ${common} placeholder="0.00" value="${v != null && v !== '' ? centsToInput(v) : ''}">`);
    case 'date': return wrap(`<input type="date" ${common} value="${esc(v ?? '')}">`);
    case 'time': return wrap(`<input type="time" ${common} value="${esc(v ?? '')}">`);
    case 'learner': return wrap(`<input type="text" ${common} placeholder="Reg number, e.g. J0016" autocapitalize="characters" maxlength="20" value="${esc(v ?? '')}">`);
    default: return wrap(`<input type="text" ${common} maxlength="${f.max || 200}" value="${esc(v ?? '')}">`);
  }
}

async function lookupLearner(reg, profile, f) {
  const id = String(reg).trim().toUpperCase();
  const s = await fs.getDoc(fs.doc(db, 'learners', id));
  if (!s.exists()) throw new Error(`No learner found with reg number ${id}.`);
  const l = s.data();
  const sc = campusScope(profile);
  if (sc && l.campusId !== sc) throw new Error('That learner belongs to another campus.');
  if (f.boarderOnly && !l.boarding) throw new Error(`${l.fullName} is not a boarder.`);
  return { id, ...l };
}

export async function mountCrud(host, cfg, profile) {
  const canWrite = cfg.canWrite ? cfg.canWrite(profile) : true;
  const campusScoped = cfg.campusScoped !== false;
  const fields = cfg.fields;
  for (const f of fields) if (typeof f.options === 'function') f.options = await f.options(profile);
  const hasLearner = fields.some((f) => f.type === 'learner');
  const needCampusField = campusScoped && !campusScope(profile) && !hasLearner;
  const campuses = needCampusField ? await loadCampuses(profile) : [];
  const columns = cfg.columns || fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options, display: f.display }));
  let limit = cfg.limit || 100;
  let rows = [];

  host.innerHTML = `
    ${cfg.heading ? `<h2 class="b-h2">${esc(cfg.heading)}</h2>` : ''}
    <div data-sum></div>
    <div class="b-actions" style="margin:0 0 12px">${canWrite && !cfg.noCreate ? `<button class="b-btn" data-new type="button">${esc(cfg.newLabel || 'Add new')}</button>` : ''}</div>
    <section class="b-panel" data-editor hidden></section>
    <div class="b-filters"><label>Search<input data-q type="search" placeholder="Type to filter the list"></label></div>
    <div data-list><div class="b-skel"></div></div>
    <div class="b-actions"><button class="b-btn b-ghost" data-more type="button" hidden>Show more</button></div>`;
  const $ = (s) => host.querySelector(s);
  const list = $('[data-list]');
  const editor = $('[data-editor]');

  async function load() {
    list.innerHTML = '<div class="b-skel"></div>';
    try {
      const cons = [...(campusScoped ? scopeWhere(profile) : []), ...(cfg.where ? cfg.where(profile) : []), fs.limit(limit)];
      const snap = await fs.getDocs(fs.query(fs.collection(db, cfg.collection), ...cons));
      rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort(cfg.sort || ((a, b) => (tsMillis(b.createdAt) || 9e12) - (tsMillis(a.createdAt) || 9e12)));
      $('[data-more]').hidden = snap.size < limit;
      if (cfg.summary) { try { $('[data-sum]').innerHTML = await cfg.summary(rows, profile); } catch (e) { console.error(e); } }
      render();
    } catch (e) { showErr(list, e); }
  }

  function render() {
    const q = $('[data-q]').value.trim().toLowerCase();
    const shown = q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
    if (!shown.length) { list.innerHTML = `<div class="b-empty">${rows.length ? 'Nothing matches your search.' : esc(cfg.empty || 'Nothing here yet.')}</div>`; return; }
    list.innerHTML = `<table class="b-table stack"><thead><tr>${columns.map((c) => `<th${c.type === 'money' ? ' class="b-num"' : ''}>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>
      ${shown.map((r) => {
        const actions = [];
        if (canWrite && !cfg.noEdit && (!cfg.canEditRow || cfg.canEditRow(r, profile))) actions.push(`<button class="b-btn b-ghost" data-edit="${esc(r.id)}" type="button">${esc(cfg.editLabel || 'Edit')}</button>`);
        if (canWrite && !cfg.noDelete && (!cfg.canDeleteRow || cfg.canDeleteRow(r, profile))) actions.push(`<button class="b-btn b-ghost" data-del="${esc(r.id)}" type="button">Delete</button>`);
        (cfg.rowActions || []).forEach((a, i) => { if (!a.show || a.show(r, profile)) actions.push(`<button class="b-btn b-ghost" data-act="${i}" data-id="${esc(r.id)}" type="button">${esc(a.label)}</button>`); });
        return `<tr>${columns.map((c) => `<td data-label="${esc(c.label)}"${c.type === 'money' ? ' class="b-num"' : ''}>${c.html ? c.html(r) : fmtCell(c, r[c.key])}</td>`).join('')}<td><div class="b-actions" style="margin:0">${actions.join('')}</div></td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function openEditor(existing) {
    const isNew = !existing;
    const base = existing || (cfg.defaults ? cfg.defaults(profile) : {});
    editor.hidden = false;
    editor.dataset.id = existing ? existing.id : '';
    editor.innerHTML = `<h3 class="b-h2">${isNew ? esc(cfg.newLabel || 'Add new') : 'Edit record'}</h3>
      <form class="b-form" novalidate>
        ${needCampusField ? `<label>Campus<select name="campusId" required><option value="">Choose campus</option>${campuses.map((c) => `<option value="${esc(c.id)}"${base.campusId === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        ${fields.map((f) => fieldHTML(f, base[f.key] !== undefined ? base[f.key] : (f.today && isNew ? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10) : f.default))).join('')}
        <div class="b-actions b-wide"><button class="b-btn" type="submit">Save</button><button class="b-btn b-ghost" type="button" data-cancel>Cancel</button></div>
      </form>`;
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function collect(form, existing) {
    const data = {};
    for (const f of fields) {
      const el = form.elements[f.key];
      let v;
      switch (f.type) {
        case 'checkbox': v = !!el.checked; break;
        case 'multi': v = [...form.querySelectorAll(`[data-multi="${f.key}"]:checked`)].map((x) => x.value); if (f.required && !v.length) throw new Error(`Choose at least one: ${f.label}.`); break;
        case 'money': v = toCents(el.value); if (f.required && !(v > 0)) throw new Error(`${f.label}: enter an amount above zero.`); if (v < 0 || v > 1e10) throw new Error(`${f.label} is not valid.`); break;
        case 'number': v = el.value === '' ? null : Number(el.value); if (f.required && v === null) throw new Error(`${f.label} is required.`); if (v !== null && (Number.isNaN(v) || (f.min != null && v < f.min) || (f.max != null && v > f.max))) throw new Error(`${f.label} is out of range.`); break;
        case 'images': {
          const kept = (existing && existing[f.key]) || [];
          const files = [...el.files];
          const added = [];
          for (const file of files) { const r = await saveFile(file, cfg.collection); added.push(r.url); }
          v = [...kept, ...added];
          break;
        }
        case 'learner': {
          const raw = el.value.trim();
          if (!raw) { if (f.required) throw new Error(`${f.label} is required.`); v = ''; break; }
          const l = await lookupLearner(raw, profile, f);
          v = l.id; data.learnerName = l.fullName; data.form = l.form || ''; data.campusId = l.campusId;
          break;
        }
        default:
          v = (el.value || '').trim();
          if (f.required && !v) throw new Error(`${f.label} is required.`);
          if (f.parse) v = f.parse(v);
      }
      data[f.key] = v;
    }
    if (needCampusField) { data.campusId = form.elements.campusId.value; if (!data.campusId) throw new Error('Choose a campus.'); }
    else if (campusScoped && !data.campusId) data.campusId = campusScope(profile) || (existing && existing.campusId) || 'all';
    return data;
  }

  editor.addEventListener('click', (e) => { if (e.target.dataset.cancel !== undefined) editor.hidden = true; });
  editor.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('[type=submit]');
    const id = editor.dataset.id;
    const existing = id ? rows.find((r) => r.id === id) : null;
    btn.disabled = true;
    try {
      const data = await collect(form, existing);
      if (cfg.validate) await cfg.validate(data, { profile, existing, isNew: !existing });
      const ref = existing ? fs.doc(db, cfg.collection, id) : fs.doc(fs.collection(db, cfg.collection));
      const payload = { ...(existing ? {} : (cfg.defaults ? cfg.defaults(profile) : {})), ...data, updatedAt: fs.serverTimestamp() };
      if (!existing) { payload.createdAt = fs.serverTimestamp(); payload.createdBy = profile.uid; }
      if (cfg.batchSave) {
        // Page-supplied multi-document save (record plus related documents, all or nothing).
        const b = fs.writeBatch(db);
        b.set(ref, payload, { merge: true });
        await cfg.batchSave(b, { id: ref.id, data: { ...(existing || {}), ...data }, isNew: !existing, existing, profile });
        await b.commit();
      } else {
        await fs.setDoc(ref, payload, { merge: true });
      }
      if (cfg.auditSave) await audit(`${cfg.collection}.${existing ? 'update' : 'create'}`, `${cfg.collection}/${ref.id}`, { summary: data[fields[0].key] });
      if (cfg.afterSave) await cfg.afterSave({ id: ref.id, data: { ...(existing || {}), ...data }, isNew: !existing, existing, profile });
      toast('Saved', 'success');
      editor.hidden = true;
      load();
    } catch (err) {
      toast(err.message || 'Could not save', 'error');
    } finally { btn.disabled = false; }
  });

  list.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const find = (id) => rows.find((r) => r.id === id);
    if (t.dataset.edit) openEditor(find(t.dataset.edit));
    if (t.dataset.del) {
      if (!(await confirmBox('Delete this record? This cannot be undone.'))) return;
      try {
        await fs.deleteDoc(fs.doc(db, cfg.collection, t.dataset.del));
        await audit(`${cfg.collection}.delete`, `${cfg.collection}/${t.dataset.del}`, {});
        toast('Deleted', 'success');
        load();
      } catch (err) { toast('Could not delete: ' + (err.message || ''), 'error'); }
    }
    if (t.dataset.act !== undefined) {
      const a = cfg.rowActions[Number(t.dataset.act)];
      t.disabled = true;
      try { await a.run(find(t.dataset.id), { profile, reload: load }); } catch (err) { toast(err.message || 'Action failed', 'error'); }
      t.disabled = false;
    }
  });
  const nb = $('[data-new]');
  if (nb) nb.addEventListener('click', () => openEditor(null));
  $('[data-q]').addEventListener('input', render);
  $('[data-more]').addEventListener('click', () => { limit += 100; load(); });
  await load();
  return { reload: load };
}

export function crudPage(cfg) {
  requireRole(cfg.roles, async (profile) => {
    const nav = typeof cfg.nav === 'function' ? cfg.nav(profile.role) : cfg.nav;
    const main = renderShell({ role: profile.role, title: cfg.title, nav });
    main.innerHTML = `<div class="b-head"><h1>${esc(cfg.title)}</h1></div>${cfg.intro ? `<p class="b-sub">${esc(cfg.intro)}</p>` : ''}<div data-host></div>`;
    const host = main.querySelector('[data-host]');
    try {
      const api = await mountCrud(host, cfg, profile);
      if (cfg.after) await cfg.after(main, profile, api);
    } catch (e) { showErr(host, e); }
  });
}

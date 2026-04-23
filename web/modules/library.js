/** Library tab — catalog table with Add / Edit / Delete. */

import { AdjustmentsForm } from './form-adjustments.js';
import {
  previewMotion,
  putBuildSettings,
  startBuild,
  getBuildStatus,
  getPresets,
  savePreset,
  deletePreset,
  getServerRoot,
} from './api.js';

const PRESET_NAME_RE = /^[A-Za-z0-9_]+$/;

// Module-level dirty flag: set true when user edits entries, cleared on
// successful build. Initial value seeded from first catalog load.
let dirty = false;

const NAME_RE = /^[A-Za-z0-9_]+$/;

async function fetchCatalog() {
  const res = await fetch('/api/catalog');
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function deleteEntry(name) {
  const res = await fetch(`/api/catalog/entries/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch (_) {}
    throw new Error(detail);
  }
}

async function putEntry(name, body) {
  const res = await fetch(`/api/catalog/entries/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

async function fsList(path) {
  const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

async function importCsv(srcPath, destName) {
  const res = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src_path: srcPath, dest_name: destName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail ?? res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function uploadCsv(file, destName) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('dest_name', destName);
  const res = await fetch('/api/import/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail ?? res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

function adjustmentsCount(adj) {
  if (!adj || typeof adj !== 'object') return 0;
  return Object.keys(adj).length;
}

function parentDir(p) {
  if (!p || p === '/') return '/';
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
}

function renderBuildPanel(wrapper, data, onRefresh) {
  const build = data.build ?? {};
  const entries = data.entries ?? [];

  const panel = document.createElement('div');
  panel.className = 'build-panel';

  // Header row with toggle + rebuild button
  const header = document.createElement('div');
  header.className = 'build-panel-header';
  const toggle = document.createElement('button');
  toggle.className = 'build-toggle';
  toggle.type = 'button';
  const title = document.createElement('span');
  title.className = 'build-panel-title';
  title.textContent = 'Build settings';
  toggle.append(title);

  const rebuildBtn = document.createElement('button');
  rebuildBtn.textContent = 'Rebuild library';
  rebuildBtn.className = 'primary-btn build-rebuild-btn';
  if (dirty) rebuildBtn.classList.add('dirty');

  header.append(toggle, rebuildBtn);
  panel.appendChild(header);

  // Collapsible body with settings form
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'build-panel-body';
  bodyWrap.style.display = 'none';

  function labeled(labelText, inputEl) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const lbl = document.createElement('label');
    lbl.className = 'entry-label';
    lbl.textContent = labelText;
    row.append(lbl, inputEl);
    return row;
  }

  const inFps = document.createElement('input');
  inFps.type = 'number';
  inFps.className = 'entry-input';
  inFps.value = build.input_fps ?? 120;
  bodyWrap.appendChild(labeled('Input FPS', inFps));

  const outFps = document.createElement('input');
  outFps.type = 'number';
  outFps.className = 'entry-input';
  outFps.value = build.output_fps ?? 30;
  bodyWrap.appendChild(labeled('Output FPS', outFps));

  const yawSel = document.createElement('select');
  yawSel.className = 'entry-input';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '(none)';
  yawSel.appendChild(noneOpt);
  for (const e of entries) {
    if (!e.motion) continue;
    const opt = document.createElement('option');
    opt.value = e.motion;
    opt.textContent = e.motion;
    yawSel.appendChild(opt);
  }
  yawSel.value = build.yaw_reference ?? '';
  bodyWrap.appendChild(labeled('Yaw reference', yawSel));

  const saveStatus = document.createElement('div');
  saveStatus.className = 'hint';
  saveStatus.style.marginTop = '4px';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save settings';
  saveBtn.className = 'primary-btn';
  saveBtn.style.marginTop = '6px';
  saveBtn.addEventListener('click', async () => {
    saveStatus.style.color = '';
    saveStatus.textContent = 'Saving...';
    saveBtn.disabled = true;
    try {
      await putBuildSettings({
        input_fps: parseInt(inFps.value, 10),
        output_fps: parseInt(outFps.value, 10),
        yaw_reference: yawSel.value || null,
      });
      saveStatus.textContent = 'Saved.';
      dirty = true;
      rebuildBtn.classList.add('dirty');
    } catch (e) {
      saveStatus.style.color = '#f44336';
      saveStatus.textContent = `Save failed: ${e.message}`;
    } finally {
      saveBtn.disabled = false;
    }
  });
  bodyWrap.appendChild(saveBtn);
  bodyWrap.appendChild(saveStatus);

  panel.appendChild(bodyWrap);

  toggle.addEventListener('click', () => {
    const hidden = bodyWrap.style.display === 'none';
    bodyWrap.style.display = hidden ? '' : 'none';
    toggle.classList.toggle('open', hidden);
  });

  // Build log + rebuild wiring
  const logEl = document.createElement('pre');
  logEl.className = 'build-log';
  logEl.style.display = 'none';
  panel.appendChild(logEl);

  const finalStatus = document.createElement('div');
  finalStatus.className = 'hint build-final-status';
  finalStatus.style.display = 'none';
  panel.appendChild(finalStatus);

  function appendLog(line) {
    if (logEl.style.display === 'none') logEl.style.display = '';
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  }

  function attachStream(jobId) {
    rebuildBtn.disabled = true;
    finalStatus.style.display = 'none';
    logEl.textContent = '';
    logEl.style.display = '';
    const es = new EventSource(`/api/build/${jobId}/stream`);
    es.onmessage = (ev) => appendLog(ev.data);
    es.addEventListener('done', (ev) => {
      es.close();
      rebuildBtn.disabled = false;
      finalStatus.style.display = '';
      if (ev.data === 'success') {
        finalStatus.style.color = '#4caf50';
        finalStatus.textContent = 'Build successful — motion library compiled.';
        dirty = false;
        rebuildBtn.classList.remove('dirty');
      } else {
        finalStatus.style.color = '#f44336';
        finalStatus.textContent = `Build failed: ${ev.data}`;
      }
    });
    es.onerror = () => {
      es.close();
      rebuildBtn.disabled = false;
    };
  }

  rebuildBtn.addEventListener('click', async () => {
    rebuildBtn.disabled = true;
    try {
      const job = await startBuild();
      attachStream(job.id);
    } catch (e) {
      rebuildBtn.disabled = false;
      finalStatus.style.display = '';
      finalStatus.style.color = '#f44336';
      finalStatus.textContent = `Start failed: ${e.message}`;
    }
  });

  // On load, resume stream if a build is already running.
  getBuildStatus().then((s) => {
    if (s && s.status === 'running' && s.id) {
      attachStream(s.id);
    }
  }).catch(() => {});

  wrapper.appendChild(panel);
}

function renderTable(container, data, onDelete, onEdit, onAdd) {
  const entries = data.entries ?? [];
  const wrapper = document.createElement('div');

  renderBuildPanel(wrapper, data);

  const toolbar = document.createElement('div');
  toolbar.className = 'library-toolbar';
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add entry';
  addBtn.className = 'primary-btn library-add-btn';
  addBtn.addEventListener('click', onAdd);
  toolbar.appendChild(addBtn);
  wrapper.appendChild(toolbar);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-msg';
    empty.textContent = 'No catalog entries.';
    wrapper.appendChild(empty);
    container.innerHTML = '';
    container.appendChild(wrapper);
    return;
  }

  const table = document.createElement('table');
  table.className = 'library-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Name</th>
      <th>Kind</th>
      <th>Dur (s)</th>
      <th>Idle</th>
      <th>Motion</th>
      <th>CSV</th>
      <th>Adjustments</th>
      <th>Actions</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = entry.name ?? '';

    const kindTd = document.createElement('td');
    kindTd.textContent = entry.kind ?? '';

    const durTd = document.createElement('td');
    durTd.textContent = entry.duration != null ? String(entry.duration) : '';

    const idleTd = document.createElement('td');
    idleTd.textContent = entry.idle ? 'yes' : '';

    const motionTd = document.createElement('td');
    motionTd.textContent = entry.motion ?? '';

    const csvTd = document.createElement('td');
    csvTd.textContent = entry.csv ?? '';

    const adjTd = document.createElement('td');
    adjTd.textContent = String(adjustmentsCount(entry.adjustments));

    const actionsTd = document.createElement('td');
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.className = 'library-edit-btn';
    editBtn.addEventListener('click', () => onEdit(entry));
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'library-delete-btn';
    delBtn.addEventListener('click', () => onDelete(entry.name));
    actionsTd.append(editBtn, delBtn);

    tr.append(nameTd, kindTd, durTd, idleTd, motionTd, csvTd, adjTd, actionsTd);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);

  container.innerHTML = '';
  container.appendChild(wrapper);
}

/* ---------- Modal shell ---------- */

function openModal(title, bodyBuilder, { width = '720px' } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.maxWidth = width;

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  const closeX = document.createElement('button');
  closeX.className = 'modal-close';
  closeX.textContent = 'x';
  header.append(titleEl, closeX);

  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    overlay.remove();
  }
  closeX.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  bodyBuilder({ body, footer, close, setTitle: (t) => (titleEl.textContent = t) });
  return { close };
}

/* ---------- Side panel shell (same ctx contract as openModal) ----------
 * Docks to the right so the 3D canvas on the left stays visible.
 * Auto-switches the active tab to "preview" and restores it on close.
 */
function openSidePanel(title, bodyBuilder) {
  // Remember which tab was active, force-switch to Preview.
  const prevActiveBtn = document.querySelector('.tab-btn.active');
  const prevTab = prevActiveBtn ? prevActiveBtn.dataset.tab : null;
  if (prevTab !== 'preview') {
    const previewBtn = document.querySelector('.tab-btn[data-tab="preview"]');
    if (previewBtn) previewBtn.click();
  }

  const panel = document.createElement('div');
  panel.className = 'side-panel';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  const closeX = document.createElement('button');
  closeX.className = 'modal-close';
  closeX.textContent = 'x';
  header.append(titleEl, closeX);

  const body = document.createElement('div');
  body.className = 'modal-body';

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  panel.append(header, body, footer);
  document.body.appendChild(panel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    panel.remove();
    // Restore previously active tab
    if (prevTab && prevTab !== 'preview') {
      const btn = document.querySelector(`.tab-btn[data-tab="${prevTab}"]`);
      if (btn) btn.click();
    }
  }
  closeX.addEventListener('click', close);

  bodyBuilder({ body, footer, close, setTitle: (t) => (titleEl.textContent = t) });
  return { close };
}

/* ---------- FS picker (single step, returns abs path of selected .csv) ---------- */

function buildFsPicker(container, startPath, onPick) {
  let currentPath = startPath;

  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'fs-breadcrumb';

  const list = document.createElement('div');
  list.className = 'fs-list';

  const err = document.createElement('div');
  err.className = 'error';
  err.style.display = 'none';

  container.append(breadcrumb, err, list);

  async function render(path) {
    err.style.display = 'none';
    breadcrumb.textContent = path;
    list.innerHTML = '<div class="loading-msg">Loading...</div>';
    let entries;
    try {
      entries = await fsList(path);
    } catch (e) {
      list.innerHTML = '';
      err.textContent = `Failed to list: ${e.message}`;
      err.style.display = '';
      return;
    }
    currentPath = path;
    list.innerHTML = '';

    const upRow = document.createElement('div');
    upRow.className = 'fs-item fs-item-dir';
    upRow.textContent = '.. (up)';
    upRow.addEventListener('click', () => render(parentDir(path)));
    list.appendChild(upRow);

    for (const e of entries) {
      const isCsv = !e.is_dir && e.name.toLowerCase().endsWith('.csv');
      if (!e.is_dir && !isCsv) continue;
      const row = document.createElement('div');
      row.className = 'fs-item ' + (e.is_dir ? 'fs-item-dir' : 'fs-item-file');
      row.textContent = (e.is_dir ? '[DIR] ' : '') + e.name;
      row.addEventListener('click', () => {
        if (e.is_dir) render(e.path);
        else onPick(e.path);
      });
      list.appendChild(row);
    }
  }
  render(currentPath);
}

/* ---------- Entry form (shared by edit + step 3 of add) ---------- */

function buildEntryForm({ body, footer, close }, { initial, isNew, onSaved, preview = false }) {
  const form = document.createElement('div');
  form.className = 'entry-form';

  function labeledRow(labelText, inputEl) {
    const row = document.createElement('div');
    row.className = 'entry-row';
    const lbl = document.createElement('label');
    lbl.className = 'entry-label';
    lbl.textContent = labelText;
    row.append(lbl, inputEl);
    return row;
  }

  // Name
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'entry-input';
  nameInput.value = initial.name ?? '';
  nameInput.disabled = !isNew;
  if (isNew) nameInput.placeholder = 'unique_name (A-Z, 0-9, _)';
  form.appendChild(labeledRow('Name', nameInput));

  // Motion — auto-derives from CSV stem in Add mode until the user types in it.
  function deriveMotionFromCsv(csv) {
    if (!csv) return '';
    const base = csv.split('/').pop() || '';
    return base.replace(/\.csv$/i, '');
  }

  const motionInput = document.createElement('input');
  motionInput.type = 'text';
  motionInput.className = 'entry-input';
  motionInput.value = initial.motion ?? '';
  // In Edit mode any pre-existing value is treated as user-specified.
  // In Add mode: follow CSV until the user types in the field.
  let motionTouched = !isNew || !!(initial.motion && initial.motion.length);
  if (isNew && !initial.motion && initial.csv) {
    motionInput.value = deriveMotionFromCsv(initial.csv);
  }
  motionInput.addEventListener('input', () => { motionTouched = true; });
  form.appendChild(labeledRow('Motion', motionInput));

  // CSV (readonly + Change button)
  const csvWrap = document.createElement('div');
  csvWrap.className = 'entry-csv-wrap';
  const csvDisplay = document.createElement('input');
  csvDisplay.type = 'text';
  csvDisplay.readOnly = true;
  csvDisplay.className = 'entry-input';
  csvDisplay.value = initial.csv ?? '';
  const csvBtn = document.createElement('button');
  csvBtn.textContent = 'Change...';
  csvBtn.type = 'button';
  csvBtn.addEventListener('click', async () => {
    let serverRoot;
    try {
      serverRoot = await getServerRoot();
    } catch (e) {
      alert(`Failed to resolve server root: ${e.message}`);
      return;
    }
    openModal('Pick CSV', ({ body: pickBody, close: closePick }) => {
      buildFsPicker(pickBody, serverRoot, (absPath) => {
        // Store repo-relative if path is under server root, else absolute.
        let stored = absPath;
        if (absPath.startsWith(serverRoot + '/')) {
          stored = absPath.slice(serverRoot.length + 1);
        }
        csvDisplay.value = stored;
        if (!motionTouched) {
          motionInput.value = deriveMotionFromCsv(stored);
        }
        closePick();
        schedulePreview();
      });
    }, { width: '560px' });
  });
  csvWrap.append(csvDisplay, csvBtn);
  form.appendChild(labeledRow('CSV', csvWrap));

  // Kind
  const kindSelect = document.createElement('select');
  kindSelect.className = 'entry-input';
  for (const k of ['gesture', 'skill', 'locomotion']) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    kindSelect.appendChild(opt);
  }
  kindSelect.value = initial.kind ?? 'gesture';
  form.appendChild(labeledRow('Kind', kindSelect));

  // Duration — execution time in seconds; used by orchestrator for action-
  // completion timing. Required on every entry.
  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.className = 'entry-input';
  durationInput.step = '0.1';
  durationInput.min = '0.1';
  durationInput.required = true;
  if (initial.duration != null) durationInput.value = initial.duration;
  durationInput.placeholder = 'seconds (e.g. 5.0)';
  const durationRow = labeledRow('Duration (s)', durationInput);
  const durationHint = document.createElement('span');
  durationHint.className = 'hint';
  durationHint.textContent = 'Execution time reported to the LLM when the action finishes.';
  durationRow.appendChild(durationHint);
  form.appendChild(durationRow);

  // Idle
  const idleInput = document.createElement('input');
  idleInput.type = 'checkbox';
  idleInput.checked = !!initial.idle;
  const idleRow = labeledRow('Idle', idleInput);
  const idleHint = document.createElement('span');
  idleHint.className = 'hint';
  idleHint.textContent = 'Use in idle cycle (gestures only).';
  idleRow.appendChild(idleHint);
  form.appendChild(idleRow);

  // Build (previously "Include")
  const includeInput = document.createElement('input');
  includeInput.type = 'checkbox';
  includeInput.checked = initial.include !== false;
  const includeRow = labeledRow('Build', includeInput);
  const includeHint = document.createElement('span');
  includeHint.className = 'hint';
  includeHint.textContent = 'Include this entry in the compiled .pt library. Uncheck to keep in catalog but skip during rebuild.';
  includeRow.appendChild(includeHint);
  form.appendChild(includeRow);

  function applyKindVisibility() {
    const isGesture = kindSelect.value === 'gesture';
    idleRow.style.display = isGesture ? '' : 'none';
    if (!isGesture) idleInput.checked = false;
  }
  kindSelect.addEventListener('change', applyKindVisibility);
  applyKindVisibility();

  // Adjustments
  const adjHeader = document.createElement('div');
  adjHeader.className = 'entry-section-label';
  adjHeader.textContent = 'Adjustments';
  form.appendChild(adjHeader);

  // Preset row: [Preset: dropdown] [Apply] [Save as preset...] [Delete preset]
  const presetRow = document.createElement('div');
  presetRow.className = 'entry-row preset-row';
  presetRow.style.gap = '6px';
  presetRow.style.alignItems = 'center';
  const presetLabel = document.createElement('label');
  presetLabel.className = 'entry-label';
  presetLabel.textContent = 'Preset';
  const presetSelect = document.createElement('select');
  presetSelect.className = 'entry-input';
  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  const savePresetBtn = document.createElement('button');
  savePresetBtn.type = 'button';
  savePresetBtn.textContent = 'Save as preset...';
  const delPresetBtn = document.createElement('button');
  delPresetBtn.type = 'button';
  delPresetBtn.textContent = 'Delete preset';
  presetRow.append(presetLabel, presetSelect, applyBtn, savePresetBtn, delPresetBtn);
  form.appendChild(presetRow);

  const presetErr = document.createElement('div');
  presetErr.className = 'hint';
  presetErr.style.color = '#c33';
  presetErr.style.display = 'none';
  presetErr.style.marginTop = '4px';
  form.appendChild(presetErr);

  let presetsCache = {};

  function showPresetErr(msg) {
    presetErr.textContent = msg;
    presetErr.style.display = '';
  }
  function clearPresetErr() {
    presetErr.style.display = 'none';
    presetErr.textContent = '';
  }

  function repopulatePresetSelect(selected = '') {
    presetSelect.innerHTML = '';
    const hasPresets = Object.keys(presetsCache).length > 0;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = hasPresets
      ? '-- select preset --'
      : '(empty — save current adjustments as preset)';
    presetSelect.appendChild(placeholder);
    for (const name of Object.keys(presetsCache).sort()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      presetSelect.appendChild(opt);
    }
    if (selected && presetsCache[selected]) presetSelect.value = selected;
    presetSelect.disabled = !hasPresets;
    applyBtn.disabled = !hasPresets;
    delPresetBtn.disabled = !hasPresets;
  }

  async function refreshPresets(selected = '') {
    try {
      presetsCache = await getPresets();
      repopulatePresetSelect(selected);
      clearPresetErr();
    } catch (e) {
      showPresetErr(`Failed to load presets: ${e.message}`);
    }
  }

  applyBtn.addEventListener('click', () => {
    clearPresetErr();
    const name = presetSelect.value;
    if (!name) {
      showPresetErr('Select a preset to apply.');
      return;
    }
    const adj = presetsCache[name];
    if (!adj) {
      showPresetErr(`Preset not found: ${name}`);
      return;
    }
    if (adjCtrl) adjCtrl.setAdjustments(adj);
    schedulePreview();
  });

  savePresetBtn.addEventListener('click', async () => {
    clearPresetErr();
    const name = (prompt('Preset name (A-Z, 0-9, _):') || '').trim();
    if (!name) return;
    if (!PRESET_NAME_RE.test(name)) {
      showPresetErr('Name must match ^[A-Za-z0-9_]+$');
      return;
    }
    if (presetsCache[name] && !confirm(`Overwrite existing preset '${name}'?`)) return;
    const adj = adjCtrl ? adjCtrl.getAdjustments() : {};
    try {
      await savePreset(name, adj);
      await refreshPresets(name);
    } catch (e) {
      showPresetErr(`Save failed: ${e.message}`);
    }
  });

  delPresetBtn.addEventListener('click', async () => {
    clearPresetErr();
    const name = presetSelect.value;
    if (!name) {
      showPresetErr('Select a preset to delete.');
      return;
    }
    if (!confirm(`Delete preset '${name}'?`)) return;
    try {
      await deletePreset(name);
      await refreshPresets();
    } catch (e) {
      showPresetErr(`Delete failed: ${e.message}`);
    }
  });

  refreshPresets();

  const adjHost = document.createElement('div');
  form.appendChild(adjHost);

  // Live preview wiring (Edit dialog only).
  // Keeps last-good preview on error; shows inline message.
  let previewAbort = null;
  let debounceTimer = null;
  const previewErr = document.createElement('div');
  previewErr.className = 'hint';
  previewErr.style.color = '#c33';
  previewErr.style.display = 'none';
  previewErr.style.marginTop = '4px';
  if (preview) form.appendChild(previewErr);

  function triggerPreview() {
    if (!preview) return;
    const csv = csvDisplay.value.trim();
    if (!csv) return;
    if (previewAbort) previewAbort.abort();
    const ac = new AbortController();
    previewAbort = ac;
    const adjustments = adjCtrl ? adjCtrl.getAdjustments() : (initial.adjustments ?? {});
    previewMotion(csv, adjustments, ac.signal)
      .then((csvText) => {
        if (ac.signal.aborted) return;
        previewErr.style.display = 'none';
        const api = window.viewerAPI;
        if (api && api.loadPreviewCSV) api.loadPreviewCSV(csvText, initial.name || csv);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        previewErr.textContent = `Preview error: ${err.message}`;
        previewErr.style.display = '';
      });
  }

  function schedulePreview() {
    if (!preview) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(triggerPreview, 200);
  }

  const adjCtrl = AdjustmentsForm.mount(
    adjHost,
    initial.adjustments ?? {},
    () => { schedulePreview(); },
    { hideTrim: isNew, hideCut: isNew },
  );

  // Error banner
  const errBanner = document.createElement('div');
  errBanner.className = 'error';
  errBanner.style.display = 'none';
  form.appendChild(errBanner);

  body.appendChild(form);

  function cleanupPreview() {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (previewAbort) { previewAbort.abort(); previewAbort = null; }
    if (preview) {
      const api = window.viewerAPI;
      if (api && api.restoreCurrentClip) api.restoreCurrentClip();
    }
  }

  // Footer buttons
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    cleanupPreview();
    adjCtrl.destroy();
    close();
  });

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'primary-btn';

  async function save() {
    errBanner.style.display = 'none';
    const name = nameInput.value.trim();
    if (isNew && !NAME_RE.test(name)) {
      errBanner.textContent = 'Name must match ^[A-Za-z0-9_]+$';
      errBanner.style.display = '';
      return;
    }
    const motion = motionInput.value.trim();
    if (!motion) {
      errBanner.textContent = 'Motion is required.';
      errBanner.style.display = '';
      return;
    }
    const csv = csvDisplay.value.trim();
    if (!csv) {
      errBanner.textContent = 'CSV is required.';
      errBanner.style.display = '';
      return;
    }
    const duration = parseFloat(durationInput.value);
    if (!Number.isFinite(duration) || duration <= 0) {
      errBanner.textContent = 'Duration is required and must be > 0.';
      errBanner.style.display = '';
      return;
    }
    const payload = {
      name,
      motion,
      csv,
      kind: kindSelect.value,
      duration,
      idle: !!idleInput.checked,
      include: !!includeInput.checked,
      adjustments: adjCtrl.getAdjustments(),
    };
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      await putEntry(name, payload);
    } catch (e) {
      errBanner.textContent = `Save failed: ${e.message}`;
      errBanner.style.display = '';
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      return;
    }
    cleanupPreview();
    adjCtrl.destroy();
    close();
    onSaved();
  }
  saveBtn.addEventListener('click', save);

  footer.append(cancelBtn, saveBtn);

  // Ensure preview cleanup fires even when the dialog is dismissed via the
  // close-X or overlay click (those bypass our Cancel button).
  if (preview) {
    const host = body.closest('.modal-overlay') || body.closest('.side-panel');
    if (host) {
      const closeX = host.querySelector('.modal-close');
      if (closeX) closeX.addEventListener('click', cleanupPreview, { once: true });
      if (host.classList.contains('modal-overlay')) {
        host.addEventListener('click', (e) => {
          if (e.target === host) cleanupPreview();
        });
      }
    }
  }

  // Kick off initial preview so the Preview tab reflects the current state
  // of this entry (with its stored adjustments applied).
  if (preview) triggerPreview();
}

/* ---------- Edit dialog ---------- */

function openEditDialog(entry, onSaved) {
  openSidePanel(`Edit entry: ${entry.name}`, (ctx) => {
    buildEntryForm(ctx, { initial: entry, isNew: false, onSaved, preview: true });
  });
}

/* ---------- Add wizard ---------- */

async function openAddWizard(onSaved) {
  // Step 1: pick CSV
  let serverRoot;
  try {
    serverRoot = await getServerRoot();
  } catch (e) {
    alert(`Failed to resolve server root: ${e.message}`);
    return;
  }
  openModal('Add entry — pick CSV', (ctx) => {
    // --- Upload-from-browser section ---
    const uploadSection = document.createElement('div');
    uploadSection.className = 'upload-section';

    const uploadLabel = document.createElement('div');
    uploadLabel.className = 'entry-section-label';
    uploadLabel.textContent = 'Upload from this computer';
    uploadSection.appendChild(uploadLabel);

    const uploadRow = document.createElement('div');
    uploadRow.className = 'upload-row';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';
    fileInput.className = 'upload-file-input';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      ctx.close();
      openAddStep2({ file: f }, onSaved);
    });

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Pick a .csv file to upload into motions/. Max 50 MB.';

    uploadRow.appendChild(fileInput);
    uploadSection.append(uploadRow, hint);
    ctx.body.appendChild(uploadSection);

    // --- Or browse server filesystem ---
    const orLabel = document.createElement('div');
    orLabel.className = 'entry-section-label';
    orLabel.textContent = 'Or browse server filesystem';
    ctx.body.appendChild(orLabel);

    buildFsPicker(ctx.body, serverRoot, (absPath) => {
      ctx.close();
      openAddStep2({ srcPath: absPath }, onSaved);
    });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', ctx.close);
    ctx.footer.appendChild(cancelBtn);
  }, { width: '560px' });
}

function openAddStep2(source, onSaved) {
  const { file = null, srcPath = null } = source || {};
  const sourceLabel = file ? `Upload: ${file.name}` : `Source: ${srcPath}`;
  const rawName = file ? file.name : (srcPath || '').split('/').pop() || '';
  const defaultName = rawName.replace(/\.csv$/i, '').replace(/[^A-Za-z0-9_]+/g, '_');
  openModal('Add entry — import as', (ctx) => {
    const info = document.createElement('div');
    info.className = 'hint';
    info.textContent = sourceLabel;
    info.style.marginBottom = '8px';
    ctx.body.appendChild(info);

    const row = document.createElement('div');
    row.className = 'entry-row';
    const lbl = document.createElement('label');
    lbl.className = 'entry-label';
    lbl.textContent = 'Destination name';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'entry-input';
    input.value = defaultName;
    row.append(lbl, input);
    ctx.body.appendChild(row);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Will be copied to motions/<name>.csv';
    ctx.body.appendChild(hint);

    const errBanner = document.createElement('div');
    errBanner.className = 'error';
    errBanner.style.display = 'none';
    ctx.body.appendChild(errBanner);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', ctx.close);

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Import';
    nextBtn.className = 'primary-btn';
    nextBtn.addEventListener('click', async () => {
      errBanner.style.display = 'none';
      const destName = input.value.trim();
      if (!destName || !NAME_RE.test(destName)) {
        errBanner.textContent = 'Name must match ^[A-Za-z0-9_]+$';
        errBanner.style.display = '';
        return;
      }
      nextBtn.disabled = true;
      cancelBtn.disabled = true;
      let result;
      try {
        result = file
          ? await uploadCsv(file, destName)
          : await importCsv(srcPath, destName);
      } catch (e) {
        if (e.status === 409) {
          errBanner.textContent = 'Already exists, pick a different name.';
        } else {
          errBanner.textContent = `Import failed: ${e.message}`;
        }
        errBanner.style.display = '';
        nextBtn.disabled = false;
        cancelBtn.disabled = false;
        return;
      }
      ctx.close();
      openAddStep3(result, destName, onSaved);
    });

    ctx.footer.append(cancelBtn, nextBtn);
  }, { width: '520px' });
}

function openAddStep3(importResult, destName, onSaved) {
  const initial = {
    name: '',
    motion: importResult.motion ?? destName,
    csv: importResult.csv ?? `motions/${destName}.csv`,
    kind: 'gesture',
    duration: 5.0,
    idle: false,
    include: true,
    adjustments: {},
  };
  openSidePanel('Add entry — fill details', (ctx) => {
    buildEntryForm(ctx, { initial, isNew: true, onSaved, preview: true });
  });
}

/* ---------- Load + wire ---------- */

async function load(container) {
  container.innerHTML = '<div class="loading-msg">Loading catalog...</div>';
  let data;
  try {
    data = await fetchCatalog();
  } catch (err) {
    container.innerHTML = `<p class="error">Failed to load catalog: ${err.message}</p>`;
    return;
  }

  const refresh = () => load(container);
  const markDirtyAndRefresh = () => {
    dirty = true;
    refresh();
  };

  renderTable(
    container,
    data,
    async (name) => {
      if (!confirm(`Delete entry '${name}'?`)) return;
      try {
        await deleteEntry(name);
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
        return;
      }
      markDirtyAndRefresh();
    },
    (entry) => openEditDialog(entry, markDirtyAndRefresh),
    () => openAddWizard(markDirtyAndRefresh),
  );
}

export const Library = {
  mount(container) {
    const host = document.createElement('div');
    host.className = 'library-container';
    container.innerHTML = '';
    container.appendChild(host);
    load(host);
  },
};

/**
 * G1 Motion Viewer — main entry point.
 * Orchestrates scene, URDF loading, motion list, CSV parsing, animation, editing.
 */

import { fetchMotions, fetchMotionCSV, fetchURDF, getServerRoot, fetchCsvByPath } from './modules/api.js';
import { openFsPickerModal, openDirPickerModal } from './modules/fsPicker.js';
import { initScene } from './modules/scene.js';
import { loadRobot } from './modules/urdf.js';
import { parseCSV } from './modules/csv.js';
import { applyFrame } from './modules/animator.js';
import { Timeline } from './modules/timeline.js';
import { initEditPanel } from './modules/editPanel.js';
import { Library } from './modules/library.js';

// ── State ──────────────────────────────────────────────────────────────────────
let robot = null;
let csvData = null;      // { columns, frames, jointNames }
let currentClipName = null;

function setStatus(msg) {
  document.getElementById('status-bar').textContent = `status: ${msg}`;
}

// ── Tab bar ────────────────────────────────────────────────────────────────────
for (const btn of document.querySelectorAll('.tab-btn')) {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    for (const b of document.querySelectorAll('.tab-btn')) {
      b.classList.toggle('active', b === btn);
    }
    for (const panel of document.querySelectorAll('.tab-panel')) {
      panel.classList.toggle('active', panel.id === `tab-${tab}`);
    }
    if (tab === 'library') {
      Library.mount(document.getElementById('library-root'));
    }
  });
}

// ── Scene setup ────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const { scene, animate } = initScene(container);

// ── Timeline ───────────────────────────────────────────────────────────────────
const timeline = new Timeline({
  onFrameChange(frameIdx) {
    if (!robot || !csvData) return;
    const frame = csvData.frames[frameIdx];
    if (!frame) return;
    applyFrame(robot, csvData.jointNames, frame);
  },
  onInOutChange() {
    if (editPanel) editPanel.refresh();
  },
});

// Start render loop (no per-frame callback yet; timeline.onFrameChange drives it)
animate(null);

// ── URDF loading ───────────────────────────────────────────────────────────────
const loadingOverlay = document.getElementById('loading-overlay');

async function initURDF() {
  setStatus('loading URDF...');
  try {
    const urdfText = await fetchURDF();
    robot = await loadRobot(scene, urdfText);
    loadingOverlay.classList.add('hidden');
    setStatus('idle');
  } catch (err) {
    loadingOverlay.textContent = `URDF load failed: ${err.message}`;
    setStatus(`URDF error: ${err.message}`);
    console.error('URDF load error:', err);
  }
}

// ── Motion list ────────────────────────────────────────────────────────────────
const motionListEl = document.getElementById('motion-list');

// "Open from path..." button — browse server filesystem for an arbitrary CSV
const openFromPathBtn = document.getElementById('btn-open-from-path');
if (openFromPathBtn) {
  openFromPathBtn.addEventListener('click', async () => {
    let serverRoot;
    try {
      serverRoot = await getServerRoot();
    } catch (err) {
      setStatus(`fs error: ${err.message}`);
      return;
    }
    openFsPickerModal(serverRoot, async (absPath) => {
      try {
        const csvText = await fetchCsvByPath(absPath);
        const label = absPath.split('/').pop();
        csvData = parseCSV(csvText);
        timeline.load(csvData.frames.length);
        currentClipName = null;
        for (const el of motionListEl.querySelectorAll('.motion-item')) {
          el.classList.remove('active');
        }
        setStatus(`${label} — ${csvData.frames.length} frames`);
      } catch (err) {
        setStatus(`open failed: ${err.message}`);
      }
    });
  });
}

// "Upload CSV..." — client-side file upload with choice of destination folder.
const uploadCsvBtn = document.getElementById('btn-upload-csv');
if (uploadCsvBtn) {
  uploadCsvBtn.addEventListener('click', async () => {
    let serverRoot;
    try {
      serverRoot = await getServerRoot();
    } catch (err) {
      setStatus(`fs error: ${err.message}`);
      return;
    }
    openUploadCsvModal(serverRoot);
  });
}

function openUploadCsvModal(serverRoot) {
  const NAME_RE = /^[A-Za-z0-9_]+$/;
  // /api/fs/default already returns motions_dir
  const defaultDir = serverRoot.replace(/\/+$/, '');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.maxWidth = '520px';
  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('div');
  title.className = 'modal-title';
  title.textContent = 'Upload CSV from computer';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close';
  closeX.textContent = 'x';
  header.append(title, closeX);

  const body = document.createElement('div');
  body.className = 'modal-body';

  // File input
  const fileRow = document.createElement('div');
  fileRow.className = 'entry-row';
  const fileLbl = document.createElement('label');
  fileLbl.className = 'entry-label';
  fileLbl.textContent = 'File';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.className = 'upload-file-input';
  fileRow.append(fileLbl, fileInput);
  body.appendChild(fileRow);

  // Destination folder
  const dirRow = document.createElement('div');
  dirRow.className = 'entry-row';
  const dirLbl = document.createElement('label');
  dirLbl.className = 'entry-label';
  dirLbl.textContent = 'Folder';
  const dirInput = document.createElement('input');
  dirInput.type = 'text';
  dirInput.className = 'entry-input';
  dirInput.value = defaultDir;
  const dirBrowse = document.createElement('button');
  dirBrowse.textContent = 'Browse...';
  dirBrowse.type = 'button';
  dirBrowse.addEventListener('click', () => {
    openDirPickerModal(dirInput.value || defaultDir, (picked) => {
      dirInput.value = picked;
    });
  });
  dirRow.append(dirLbl, dirInput, dirBrowse);
  body.appendChild(dirRow);

  // Destination name
  const nameRow = document.createElement('div');
  nameRow.className = 'entry-row';
  const nameLbl = document.createElement('label');
  nameLbl.className = 'entry-label';
  nameLbl.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'entry-input';
  nameInput.placeholder = 'clip_name';
  nameRow.append(nameLbl, nameInput);
  body.appendChild(nameRow);

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f && !nameInput.value.trim()) {
      const base = f.name.replace(/\.csv$/i, '').replace(/[^A-Za-z0-9_]+/g, '_');
      nameInput.value = base;
    }
  });

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Writes <folder>/<name>.csv. Max 50 MB. After upload the clip is loaded in preview.';
  body.appendChild(hint);

  const errBanner = document.createElement('div');
  errBanner.className = 'error';
  errBanner.style.display = 'none';
  body.appendChild(errBanner);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload & open';
  uploadBtn.className = 'primary-btn';
  footer.append(cancelBtn, uploadBtn);

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  closeX.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  uploadBtn.addEventListener('click', async () => {
    errBanner.style.display = 'none';
    const file = fileInput.files && fileInput.files[0];
    const destName = nameInput.value.trim();
    const destDir = dirInput.value.trim();
    if (!file) {
      errBanner.textContent = 'Pick a CSV file.';
      errBanner.style.display = '';
      return;
    }
    if (!NAME_RE.test(destName)) {
      errBanner.textContent = 'Name must match ^[A-Za-z0-9_]+$';
      errBanner.style.display = '';
      return;
    }
    if (!destDir) {
      errBanner.textContent = 'Pick a destination folder.';
      errBanner.style.display = '';
      return;
    }
    uploadBtn.disabled = true;
    cancelBtn.disabled = true;
    setStatus(`uploading ${file.name}...`);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dest_name', destName);
      fd.append('dest_dir', destDir);
      const res = await fetch('/api/import/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? res.statusText);
      close();
      await refreshMotionList();
      const absPath = data.path || `${destDir.replace(/\/+$/, '')}/${destName}.csv`;
      try {
        const csvText = await fetchCsvByPath(absPath);
        csvData = parseCSV(csvText);
        timeline.load(csvData.frames.length);
        currentClipName = null;
        setStatus(`${destName}.csv — ${csvData.frames.length} frames`);
      } catch (err) {
        setStatus(`uploaded, but open failed: ${err.message}`);
      }
    } catch (err) {
      errBanner.textContent = `Upload failed: ${err.message}`;
      errBanner.style.display = '';
      setStatus('idle');
      uploadBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}

async function refreshMotionList(selectName = null) {
  let motions;
  try {
    motions = await fetchMotions();
  } catch (err) {
    motionListEl.innerHTML = '<div class="loading-msg">Failed to load motions.</div>';
    return;
  }

  if (motions.length === 0) {
    motionListEl.innerHTML = '<div class="loading-msg">No clips.</div>';
    return;
  }

  motionListEl.innerHTML = '';

  const groups = {};
  for (const m of motions) {
    if (!groups[m.source]) groups[m.source] = [];
    groups[m.source].push(m);
  }

  for (const [source, items] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'motion-group-label';
    label.textContent = `[${source}]`;
    motionListEl.appendChild(label);

    for (const m of items) {
      const el = document.createElement('div');
      el.className = 'motion-item';
      el.textContent = m.name;
      el.title = `${m.name} (${(m.size / 1024).toFixed(0)} KB)`;
      el.dataset.name = m.name;
      if (m.name === (selectName ?? currentClipName)) {
        el.classList.add('active');
      }
      el.addEventListener('click', () => loadClip(m.name));
      motionListEl.appendChild(el);
    }
  }
}

// ── Load a clip ────────────────────────────────────────────────────────────────
async function loadClip(name) {
  setStatus(`loading ${name}...`);

  // Update active state in list
  for (const el of motionListEl.querySelectorAll('.motion-item')) {
    el.classList.toggle('active', el.dataset.name === name);
  }

  currentClipName = name;
  editPanel.setClip(name);

  try {
    const text = await fetchMotionCSV(name);
    csvData = parseCSV(text);
    timeline.load(csvData.frames.length);
    setStatus(`${name} — ${csvData.frames.length} frames`);
  } catch (err) {
    setStatus(`error: ${err.message}`);
    console.error('loadClip error:', err);
  }
}

/**
 * Load CSV text directly into the Preview renderer (bypasses server fetch).
 * Used for live-preview of adjustments while the Edit modal is open.
 * Does NOT change currentClipName (so restoration is trivial).
 */
function loadPreviewCSV(csvText, displayLabel = 'preview') {
  try {
    csvData = parseCSV(csvText);
    timeline.load(csvData.frames.length);
    setStatus(`${displayLabel} — ${csvData.frames.length} frames`);
  } catch (err) {
    setStatus(`preview error: ${err.message}`);
    console.error('loadPreviewCSV error:', err);
  }
}

/** Restore the last-loaded clip (e.g. after closing the Edit modal). */
async function restoreCurrentClip() {
  if (currentClipName) {
    await loadClip(currentClipName);
  }
}

// Expose a small surface for cross-module coordination (library.js uses this
// to drive the Preview renderer from the Edit modal).
window.viewerAPI = {
  loadPreviewCSV,
  restoreCurrentClip,
  getCurrentClipName: () => currentClipName,
};

// ── Edit panel ─────────────────────────────────────────────────────────────────
const editPanel = initEditPanel({
  getClipName: () => currentClipName,
  getInFrame: () => timeline.inFrame,
  getOutFrame: () => timeline.outFrame,
  getTotalFrames: () => timeline.totalFrames,
  fps: 120,
  async onSuccess(outputName) {
    await refreshMotionList(outputName);
    await loadClip(outputName);
  },
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([
    initURDF(),
    refreshMotionList(),
  ]);
})();

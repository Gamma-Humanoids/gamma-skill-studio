/**
 * Edit panel — stages Trim / Cut / Resample ops against the currently loaded
 * clip. Nothing is written to disk until the user clicks "Save as new CSV".
 *
 * UX:
 *   - Each button click appends an op to the pending list; server applies the
 *     chain and returns the transformed CSV which is loaded into the preview.
 *   - IN/OUT coordinates for each op are captured in the frame of reference of
 *     the CSV shown at click time (i.e. the already-staged preview).
 *   - "Reset edits" clears the list and restores the original clip.
 *   - "Save as new CSV" runs the chain on the server with save=true and writes
 *     to motions/<output filename>.
 */

import { editChain } from './api.js';

export function initEditPanel({
  getClipName,
  getInFrame,
  getOutFrame,
  getTotalFrames,
  fps,
  onSuccess,
}) {
  const hint = document.getElementById('edit-hint');
  const outputInput = document.getElementById('output-name-input');
  const speedInput = document.getElementById('speed-factor-input');
  const btnTrim = document.getElementById('btn-trim');
  const btnCut = document.getElementById('btn-cut');
  const btnSpeed = document.getElementById('btn-speed');
  const btnReset = document.getElementById('btn-reset-edits');
  const btnSave = document.getElementById('btn-save-edits');
  const opsList = document.getElementById('edit-ops-list');

  // Source clip name (never changes during a staging session) + pending ops.
  let currentName = null;
  let pendingOps = [];

  function defaultOutputName(srcName) {
    const stem = srcName.replace(/\.csv$/i, '');
    return `${stem}_edit.csv`;
  }

  function describeOp(op) {
    if (op.op === 'trim') {
      return `Trim — keep frames, drop ${op.params.start.toFixed(2)}s from start / ${op.params.end.toFixed(2)}s from end`;
    }
    if (op.op === 'cut') {
      return `Cut — remove ${op.params.from_.toFixed(2)}s…${op.params.to.toFixed(2)}s`;
    }
    if (op.op === 'speed') {
      return `Resample ×${op.params.factor}`;
    }
    return JSON.stringify(op);
  }

  function renderOpsList() {
    opsList.innerHTML = '';
    if (pendingOps.length === 0) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.style.listStyle = 'none';
      li.style.marginLeft = '-18px';
      li.textContent = '(none — click Trim, Cut or Apply resample to stage)';
      opsList.appendChild(li);
      return;
    }
    for (const op of pendingOps) {
      const li = document.createElement('li');
      li.textContent = describeOp(op);
      opsList.appendChild(li);
    }
  }

  function setClip(name) {
    // Switching clips resets staged ops.
    if (name !== currentName) {
      pendingOps = [];
    }
    currentName = name;
    if (name) {
      hint.textContent = `Editing: ${name}`;
      if (!outputInput.value || outputInput.dataset.auto === '1') {
        outputInput.value = defaultOutputName(name);
        outputInput.dataset.auto = '1';
      }
    } else {
      hint.textContent = 'Load a clip from the list above.';
    }
    renderOpsList();
    refresh();
  }

  outputInput.addEventListener('input', () => {
    outputInput.dataset.auto = '0';
  });

  function refresh() {
    const hasClip = !!currentName;
    const inF = getInFrame();
    const outF = getOutFrame();
    const total = getTotalFrames();
    const validRange = hasClip && inF != null && outF != null && outF > inF && total > 0;
    const fullRange = validRange && inF === 0 && outF === total - 1;
    btnTrim.disabled = !validRange || fullRange;
    btnCut.disabled = !validRange || fullRange;
    btnSpeed.disabled = !hasClip;
    btnReset.disabled = pendingOps.length === 0;
    btnSave.disabled = pendingOps.length === 0 || !hasClip;
  }

  async function restagePreview() {
    if (!currentName) return;
    try {
      hint.textContent = pendingOps.length
        ? `Previewing ${pendingOps.length} staged edit(s)…`
        : `Editing: ${currentName}`;
      const csvText = await editChain(currentName, pendingOps, { save: false });
      const api = window.viewerAPI;
      if (api && api.loadPreviewCSV) {
        api.loadPreviewCSV(csvText, currentName);
      }
      hint.textContent = pendingOps.length
        ? `${pendingOps.length} staged edit(s) — preview updated`
        : `Editing: ${currentName}`;
    } catch (err) {
      hint.textContent = `Preview error: ${err.message}`;
      // Roll back the op that failed so the list stays consistent with the
      // preview the user is actually seeing.
      pendingOps.pop();
      renderOpsList();
      refresh();
    }
  }

  function stageOp(op) {
    if (!currentName) return;
    pendingOps.push(op);
    renderOpsList();
    refresh();
    restagePreview();
  }

  btnTrim.addEventListener('click', () => {
    const total = getTotalFrames();
    const startSec = getInFrame() / fps;
    const endSec = (total - 1 - getOutFrame()) / fps;
    stageOp({ op: 'trim', params: { start: startSec, end: endSec } });
  });

  btnCut.addEventListener('click', () => {
    const fromSec = getInFrame() / fps;
    const toSec = getOutFrame() / fps;
    stageOp({ op: 'cut', params: { from_: fromSec, to: toSec } });
  });

  btnSpeed.addEventListener('click', () => {
    const factor = parseFloat(speedInput.value);
    if (!Number.isFinite(factor) || factor <= 0) {
      hint.textContent = 'error: invalid speed factor';
      return;
    }
    stageOp({ op: 'speed', params: { factor } });
  });

  btnReset.addEventListener('click', () => {
    if (pendingOps.length === 0) return;
    pendingOps = [];
    renderOpsList();
    refresh();
    restagePreview();
  });

  function outputCsvName() {
    let name = (outputInput.value || '').trim();
    if (!name) throw new Error('output filename is empty');
    if (!/\.csv$/i.test(name)) name += '.csv';
    return name;
  }

  btnSave.addEventListener('click', async () => {
    if (!currentName || pendingOps.length === 0) return;
    try {
      const destName = outputCsvName();
      const destPath = `motions/${destName}`;
      hint.textContent = `Writing ${destName}…`;
      btnSave.disabled = true;
      await editChain(currentName, pendingOps, {
        save: true,
        destPath,
        overwrite: false,
      });
      hint.textContent = `Wrote ${destName}`;
      outputInput.dataset.auto = '1';
      // Clear the pending stack — the new CSV is now a first-class clip.
      pendingOps = [];
      renderOpsList();
      refresh();
      if (onSuccess) await onSuccess(destName);
    } catch (err) {
      hint.textContent = `Save error: ${err.message}`;
      console.error('save error:', err);
      refresh();
    }
  });

  renderOpsList();
  return { setClip, refresh };
}

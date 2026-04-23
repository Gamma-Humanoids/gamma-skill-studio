/** Standalone fs-picker modal for picking an arbitrary .csv path. */

async function fsList(path) {
  const q = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`/api/fs/list${q}`);
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

function parentDir(p) {
  if (!p || p === '/') return '/';
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  if (idx <= 0) return '/';
  return trimmed.slice(0, idx);
}

/**
 * Opens a centered modal with an fs picker. Calls onPick(absPath) when user
 * selects a .csv file. The modal closes itself on pick or cancel.
 */
export function openFsPickerModal(startPath, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.maxWidth = '560px';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Pick CSV';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close';
  closeX.textContent = 'x';
  header.append(titleEl, closeX);

  const body = document.createElement('div');
  body.className = 'modal-body';

  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'fs-breadcrumb';
  const err = document.createElement('div');
  err.className = 'error';
  err.style.display = 'none';
  const list = document.createElement('div');
  list.className = 'fs-list';
  body.append(breadcrumb, err, list);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  footer.appendChild(cancelBtn);

  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }
  closeX.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

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
        else { close(); onPick(e.path); }
      });
      list.appendChild(row);
    }
  }
  render(startPath);
}

/**
 * Directory picker. onPick(absPath) fires when user clicks "Use this folder".
 */
export function openDirPickerModal(startPath, onPick) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.style.maxWidth = '560px';
  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'Pick folder';
  const closeX = document.createElement('button');
  closeX.className = 'modal-close';
  closeX.textContent = 'x';
  header.append(titleEl, closeX);
  const body = document.createElement('div');
  body.className = 'modal-body';
  const breadcrumb = document.createElement('div');
  breadcrumb.className = 'fs-breadcrumb';
  const err = document.createElement('div');
  err.className = 'error';
  err.style.display = 'none';
  const list = document.createElement('div');
  list.className = 'fs-list';
  body.append(breadcrumb, err, list);
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  const useBtn = document.createElement('button');
  useBtn.textContent = 'Use this folder';
  useBtn.className = 'primary-btn';
  footer.append(cancelBtn, useBtn);
  dialog.append(header, body, footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let currentPath = startPath;
  function close() { overlay.remove(); }
  closeX.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  useBtn.addEventListener('click', () => { close(); onPick(currentPath); });

  async function render(path) {
    currentPath = path;
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
    list.innerHTML = '';
    const upRow = document.createElement('div');
    upRow.className = 'fs-item fs-item-dir';
    upRow.textContent = '.. (up)';
    upRow.addEventListener('click', () => render(parentDir(path)));
    list.appendChild(upRow);
    for (const e of entries) {
      if (!e.is_dir) continue;
      const row = document.createElement('div');
      row.className = 'fs-item fs-item-dir';
      row.textContent = '[DIR] ' + e.name;
      row.addEventListener('click', () => render(e.path));
      list.appendChild(row);
    }
  }
  render(startPath);
}

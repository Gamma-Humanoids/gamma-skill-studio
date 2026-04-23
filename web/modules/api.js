/** Fetch wrappers for the G1 Motion Viewer backend API. */

const BASE = '';

let _serverRootPromise = null;

/**
 * Returns the server-side REPO_ROOT path (absolute, no trailing slash).
 * Cached: fetched once per page load.
 */
export function getServerRoot() {
  if (!_serverRootPromise) {
    _serverRootPromise = fetch(`${BASE}/api/fs/default`)
      .then((res) => {
        if (!res.ok) throw new Error(`getServerRoot: ${res.status}`);
        return res.json();
      })
      .then((j) => j.path)
      .catch((err) => {
        _serverRootPromise = null; // allow retry
        throw err;
      });
  }
  return _serverRootPromise;
}

/** Fetch arbitrary CSV by absolute or repo-relative path. */
export async function fetchCsvByPath(path) {
  const res = await fetch(`${BASE}/api/csv?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.text();
}

export async function fetchMotions() {
  const res = await fetch(`${BASE}/api/motions`);
  if (!res.ok) throw new Error(`fetchMotions: ${res.status}`);
  return res.json();
}

export async function fetchMotionCSV(name) {
  const res = await fetch(`${BASE}/api/motions/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`fetchMotionCSV(${name}): ${res.status}`);
  return res.text();
}

export async function fetchMotionInfo(name) {
  const res = await fetch(`${BASE}/api/motions/${encodeURIComponent(name)}/info`);
  if (!res.ok) throw new Error(`fetchMotionInfo(${name}): ${res.status}`);
  return res.json();
}

export async function fetchURDF() {
  const res = await fetch(`${BASE}/api/urdf`);
  if (!res.ok) throw new Error(`fetchURDF: ${res.status}`);
  return res.text();
}

/**
 * POST /api/motions/{name}/edit
 * @param {string} name  - source clip name
 * @param {string} op    - 'trim' | 'cut' | 'speed'
 * @param {object} params
 * @param {string} outputName
 * @returns {Promise<{output_name, source, frames, duration_s}>}
 */
/**
 * POST /api/motions/preview
 * Returns transformed CSV text after applying adjustments.
 *
 * @param {string} csv           - repo-relative CSV path (e.g. "motions/x.csv")
 * @param {object} adjustments   - adjustments dict (may be empty)
 * @param {AbortSignal} [signal] - optional abort signal
 * @returns {Promise<string>}    - CSV text
 */
export async function previewMotion(csv, adjustments, signal) {
  const res = await fetch(`${BASE}/api/motions/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv, adjustments: adjustments ?? {} }),
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail ?? detail;
    } catch (_) {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.text();
}

export async function getCatalog() {
  const res = await fetch(`${BASE}/api/catalog`);
  if (!res.ok) throw new Error(`getCatalog: ${res.status}`);
  return res.json();
}

export async function putBuildSettings(settings) {
  const res = await fetch(`${BASE}/api/catalog/build`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

export async function startBuild() {
  const res = await fetch(`${BASE}/api/build`, { method: 'POST' });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

export async function getBuildStatus() {
  const res = await fetch(`${BASE}/api/build/status`);
  if (!res.ok) throw new Error(`getBuildStatus: ${res.status}`);
  return res.json();
}

export async function getPresets() {
  const res = await fetch(`${BASE}/api/presets`);
  if (!res.ok) throw new Error(`getPresets: ${res.status}`);
  return res.json();
}

export async function savePreset(name, adjustments) {
  const res = await fetch(`${BASE}/api/presets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adjustments: adjustments ?? {} }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

export async function deletePreset(name) {
  const res = await fetch(`${BASE}/api/presets/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 204) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
}

/**
 * POST /api/motions/{name}/edit-chain
 * Apply a sequence of edits to `name`. If save=false returns transformed CSV
 * text. If save=true writes to dest_path and returns metadata.
 */
export async function editChain(name, ops, { save = false, destPath = null, overwrite = false, signal } = {}) {
  const body = { ops, save, dest_path: destPath, overwrite };
  const res = await fetch(`${BASE}/api/motions/${encodeURIComponent(name)}/edit-chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail ?? detail; } catch (_) {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return save ? res.json() : res.text();
}

export async function editMotion(name, op, params, destPath, overwrite = false) {
  const res = await fetch(`${BASE}/api/motions/${encodeURIComponent(name)}/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, params, dest_path: destPath, overwrite }),
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

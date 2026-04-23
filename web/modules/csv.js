/**
 * Parse G1 CSV motion data.
 *
 * CSV format (120 FPS, 36 columns):
 *   Frame, root_translateX, root_translateY, root_translateZ,
 *   root_rotateX, root_rotateY, root_rotateZ, <29 *_joint_dof>
 *
 * Units: translate in cm, rotate in degrees, joint dof in degrees.
 *
 * @param {string} text
 * @returns {{ columns: string[], frames: Float32Array[], jointNames: string[] }}
 */
export function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) throw new Error('CSV too short');

  const header = lines[0].trim().split(',');
  // columns[0] = 'Frame', skip it; data cols are index 1..N
  const columns = header.slice(1); // 35 columns: 6 root + 29 joints

  // Joint names: columns 6..34 (after 6 root cols), strip _dof suffix
  const jointNames = columns.slice(6).map((c) => c.replace(/_dof$/, ''));

  const frames = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    // parts[0] = Frame index, parts[1..] = data
    const arr = new Float32Array(columns.length);
    for (let j = 0; j < columns.length; j++) {
      arr[j] = parseFloat(parts[j + 1]) || 0;
    }
    frames.push(arr);
  }

  return { columns, frames, jointNames };
}

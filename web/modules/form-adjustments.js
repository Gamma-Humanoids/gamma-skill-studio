/**
 * Reusable adjustments form component.
 *
 * Renders form fields for every adjustment supported by
 * viewer/server/adjustments.py and emits change events. Serialization matches
 * the YAML schema used by apply_motion_adjustments.py.
 *
 * Usage:
 *   const ctrl = AdjustmentsForm.mount(container, initial, onChange);
 *   ctrl.getAdjustments();            // returns current dict
 *   ctrl.setAdjustments({...});       // populate from dict
 *   ctrl.destroy();                   // cleanup (empties container)
 *
 * Manual verification steps:
 *  1. Mount into a <div> with no initial.
 *     - Expect: trim mode "none", cut blank, speed blank, align_yaw unchecked,
 *       no joint offset rows. getAdjustments() returns {}.
 *  2. Check "align_yaw" -> getAdjustments() -> {align_yaw: true}.
 *  3. Switch trim mode to "seconds", set trim_start=1.5, trim_end=0
 *     -> {trim_start: 1.5} (trim_end omitted because 0).
 *  4. Switch trim mode to "frames", set trim_end_frames=30
 *     -> {trim_end_frames: 30}.
 *  5. Switch trim mode to "keep_seconds", set keep_seconds=3
 *     -> {keep_seconds: 3}.
 *  6. Set cut_from=2, cut_to=5 -> {cut_from: 2, cut_to: 5}.
 *     Set cut_to=1 -> invalid flag on inputs; still returns both values.
 *  7. Set speed=0.8 -> {speed: 0.8}.
 *  8. Add joint offset (waist_pitch_joint_dof = -10) -> merged flat into dict.
 *     Add another row; dropdown excludes already-used DOFs.
 *  9. setAdjustments({trim_start: 1.0, align_yaw: true, waist_pitch_joint_dof: -10})
 *     -> trim mode becomes "seconds", align_yaw checked, one offset row.
 */

const DOF_NAMES = [
  'left_hip_pitch_joint_dof', 'left_hip_roll_joint_dof', 'left_hip_yaw_joint_dof',
  'left_knee_joint_dof', 'left_ankle_pitch_joint_dof', 'left_ankle_roll_joint_dof',
  'right_hip_pitch_joint_dof', 'right_hip_roll_joint_dof', 'right_hip_yaw_joint_dof',
  'right_knee_joint_dof', 'right_ankle_pitch_joint_dof', 'right_ankle_roll_joint_dof',
  'waist_yaw_joint_dof', 'waist_roll_joint_dof', 'waist_pitch_joint_dof',
  'left_shoulder_pitch_joint_dof', 'left_shoulder_roll_joint_dof', 'left_shoulder_yaw_joint_dof',
  'left_elbow_joint_dof', 'left_wrist_roll_joint_dof', 'left_wrist_pitch_joint_dof', 'left_wrist_yaw_joint_dof',
  'right_shoulder_pitch_joint_dof', 'right_shoulder_roll_joint_dof', 'right_shoulder_yaw_joint_dof',
  'right_elbow_joint_dof', 'right_wrist_roll_joint_dof', 'right_wrist_pitch_joint_dof', 'right_wrist_yaw_joint_dof',
];

const TRIM_MODES = ['none', 'seconds', 'frames', 'keep_frames', 'keep_seconds'];

function parseNum(input) {
  const v = input.value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeLabeledNumber(labelText, { step = 'any', min = null, integer = false } = {}) {
  const wrap = document.createElement('label');
  wrap.className = 'adj-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = integer ? '1' : step;
  if (min !== null) input.min = String(min);
  input.className = 'adj-input';
  wrap.append(span, input);
  return { wrap, input };
}

export const AdjustmentsForm = {
  mount(container, initial = {}, onChange = () => {}, options = {}) {
    const { hideTrim = false, hideCut = false } = options;
    const root = document.createElement('div');
    root.className = 'adj-form';

    // --- Trim group ---
    const trimSection = document.createElement('div');
    trimSection.className = 'adj-section';
    const trimTitle = document.createElement('div');
    trimTitle.className = 'adj-section-title';
    trimTitle.textContent = 'Trim';
    trimSection.appendChild(trimTitle);

    const trimModeRow = document.createElement('div');
    trimModeRow.className = 'adj-radio-row';
    const trimRadios = {};
    for (const mode of TRIM_MODES) {
      const lbl = document.createElement('label');
      lbl.className = 'adj-radio';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = 'adj-trim-mode';
      r.value = mode;
      trimRadios[mode] = r;
      lbl.append(r, document.createTextNode(' ' + mode));
      trimModeRow.appendChild(lbl);
    }
    trimRadios.none.checked = true;
    trimSection.appendChild(trimModeRow);

    const trimFields = document.createElement('div');
    trimFields.className = 'adj-trim-fields';
    const fTrimStart = makeLabeledNumber('trim_start (s)', { step: '0.1', min: 0 });
    const fTrimEnd = makeLabeledNumber('trim_end (s)', { step: '0.1', min: 0 });
    const fTrimStartFrames = makeLabeledNumber('trim_start_frames', { integer: true, min: 0 });
    const fTrimEndFrames = makeLabeledNumber('trim_end_frames', { integer: true, min: 0 });
    const fKeepFrames = makeLabeledNumber('keep_frames', { integer: true, min: 0 });
    const fKeepSeconds = makeLabeledNumber('keep_seconds', { step: '0.1', min: 0 });
    trimFields.append(
      fTrimStart.wrap, fTrimEnd.wrap,
      fTrimStartFrames.wrap, fTrimEndFrames.wrap,
      fKeepFrames.wrap, fKeepSeconds.wrap,
    );
    trimSection.appendChild(trimFields);
    if (!hideTrim) root.appendChild(trimSection);

    function applyTrimModeVisibility() {
      const mode = getTrimMode();
      fTrimStart.wrap.style.display = mode === 'seconds' ? '' : 'none';
      fTrimEnd.wrap.style.display = mode === 'seconds' ? '' : 'none';
      fTrimStartFrames.wrap.style.display = mode === 'frames' ? '' : 'none';
      fTrimEndFrames.wrap.style.display = mode === 'frames' ? '' : 'none';
      fKeepFrames.wrap.style.display = mode === 'keep_frames' ? '' : 'none';
      fKeepSeconds.wrap.style.display = mode === 'keep_seconds' ? '' : 'none';
    }

    function getTrimMode() {
      for (const m of TRIM_MODES) if (trimRadios[m].checked) return m;
      return 'none';
    }

    // --- Cut group ---
    const cutSection = document.createElement('div');
    cutSection.className = 'adj-section';
    const cutTitle = document.createElement('div');
    cutTitle.className = 'adj-section-title';
    cutTitle.textContent = 'Cut';
    cutSection.appendChild(cutTitle);
    const fCutFrom = makeLabeledNumber('cut_from (s)', { step: '0.1', min: 0 });
    const fCutTo = makeLabeledNumber('cut_to (s)', { step: '0.1', min: 0 });
    cutSection.append(fCutFrom.wrap, fCutTo.wrap);
    if (!hideCut) root.appendChild(cutSection);

    // --- Speed ---
    const speedSection = document.createElement('div');
    speedSection.className = 'adj-section';
    const speedTitle = document.createElement('div');
    speedTitle.className = 'adj-section-title';
    speedTitle.textContent = 'Speed';
    speedSection.appendChild(speedTitle);
    const fSpeed = makeLabeledNumber('speed factor', { step: '0.1', min: 0.1 });
    speedSection.appendChild(fSpeed.wrap);
    root.appendChild(speedSection);

    // --- Stabilize end ---
    const stabSection = document.createElement('div');
    stabSection.className = 'adj-section';
    const stabTitle = document.createElement('div');
    stabTitle.className = 'adj-section-title';
    stabTitle.textContent = 'Stabilize end (append hold frames)';
    stabSection.appendChild(stabTitle);
    const fStabFrames = makeLabeledNumber('stabilize_frames', { integer: true, min: 0 });
    const fStabEase = makeLabeledNumber('stabilize_ease_frames', { integer: true, min: 0 });
    stabSection.append(fStabFrames.wrap, fStabEase.wrap);
    root.appendChild(stabSection);

    // --- Align yaw ---
    const yawSection = document.createElement('div');
    yawSection.className = 'adj-section';
    const yawLabel = document.createElement('label');
    yawLabel.className = 'adj-checkbox';
    const yawCheckbox = document.createElement('input');
    yawCheckbox.type = 'checkbox';
    yawLabel.append(yawCheckbox, document.createTextNode(' align_yaw'));
    yawSection.appendChild(yawLabel);
    root.appendChild(yawSection);

    // --- Joint offsets ---
    const jointSection = document.createElement('div');
    jointSection.className = 'adj-section';
    const jointTitle = document.createElement('div');
    jointTitle.className = 'adj-section-title';
    jointTitle.textContent = 'Joint offsets (deg)';
    jointSection.appendChild(jointTitle);
    const jointList = document.createElement('div');
    jointList.className = 'adj-joint-list';
    jointSection.appendChild(jointList);
    const addOffsetBtn = document.createElement('button');
    addOffsetBtn.type = 'button';
    addOffsetBtn.className = 'adj-add-btn';
    addOffsetBtn.textContent = '+ Add offset';
    jointSection.appendChild(addOffsetBtn);
    root.appendChild(jointSection);

    function usedDofs(exceptRow = null) {
      const used = new Set();
      for (const row of jointList.querySelectorAll('.adj-joint-row')) {
        if (row === exceptRow) continue;
        const sel = row.querySelector('select');
        if (sel && sel.value) used.add(sel.value);
      }
      return used;
    }

    function refreshJointSelects() {
      for (const row of jointList.querySelectorAll('.adj-joint-row')) {
        const sel = row.querySelector('select');
        const current = sel.value;
        const used = usedDofs(row);
        sel.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- select DOF --';
        sel.appendChild(placeholder);
        for (const dof of DOF_NAMES) {
          if (used.has(dof) && dof !== current) continue;
          const opt = document.createElement('option');
          opt.value = dof;
          opt.textContent = dof;
          if (dof === current) opt.selected = true;
          sel.appendChild(opt);
        }
      }
    }

    function addJointRow(dof = '', value = 0) {
      const row = document.createElement('div');
      row.className = 'adj-joint-row';
      const sel = document.createElement('select');
      sel.className = 'adj-joint-select';
      row.appendChild(sel);
      const valInput = document.createElement('input');
      valInput.type = 'number';
      valInput.step = '0.5';
      valInput.className = 'adj-input adj-joint-value';
      valInput.value = String(value);
      row.appendChild(valInput);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'adj-remove-btn';
      rm.textContent = 'x';
      rm.addEventListener('click', () => {
        row.remove();
        refreshJointSelects();
        emitChange();
      });
      row.appendChild(rm);
      jointList.appendChild(row);

      refreshJointSelects();
      if (dof) sel.value = dof;

      sel.addEventListener('change', () => {
        refreshJointSelects();
        emitChange();
      });
      valInput.addEventListener('input', emitChange);
      return row;
    }

    addOffsetBtn.addEventListener('click', () => {
      addJointRow();
      emitChange();
    });

    // --- Validation helpers ---
    function validateCut() {
      const a = parseNum(fCutFrom.input);
      const b = parseNum(fCutTo.input);
      const bothSet = a !== null && b !== null;
      const invalid = bothSet && !(b > a);
      fCutFrom.input.classList.toggle('adj-invalid', invalid);
      fCutTo.input.classList.toggle('adj-invalid', invalid);
    }

    // --- Serialize ---
    function getAdjustments() {
      const out = {};
      const mode = getTrimMode();
      if (mode === 'seconds') {
        const s = parseNum(fTrimStart.input);
        const e = parseNum(fTrimEnd.input);
        if (s !== null && s > 0) out.trim_start = s;
        if (e !== null && e > 0) out.trim_end = e;
      } else if (mode === 'frames') {
        const s = parseNum(fTrimStartFrames.input);
        const e = parseNum(fTrimEndFrames.input);
        if (s !== null && s > 0) out.trim_start_frames = s;
        if (e !== null && e > 0) out.trim_end_frames = e;
      } else if (mode === 'keep_frames') {
        const v = parseNum(fKeepFrames.input);
        if (v !== null) out.keep_frames = v;
      } else if (mode === 'keep_seconds') {
        const v = parseNum(fKeepSeconds.input);
        if (v !== null) out.keep_seconds = v;
      }

      const cf = parseNum(fCutFrom.input);
      const ct = parseNum(fCutTo.input);
      if (cf !== null && ct !== null) {
        out.cut_from = cf;
        out.cut_to = ct;
      } else if (cf !== null) {
        out.cut_from = cf;
      } else if (ct !== null) {
        out.cut_to = ct;
      }

      const sp = parseNum(fSpeed.input);
      if (sp !== null) out.speed = sp;

      const sf = parseNum(fStabFrames.input);
      if (sf !== null && sf > 0) out.stabilize_frames = sf;
      const se = parseNum(fStabEase.input);
      if (se !== null && se > 0) out.stabilize_ease_frames = se;

      if (yawCheckbox.checked) out.align_yaw = true;

      for (const row of jointList.querySelectorAll('.adj-joint-row')) {
        const sel = row.querySelector('select');
        const valInput = row.querySelector('.adj-joint-value');
        const dof = sel.value;
        if (!dof) continue;
        const v = parseNum(valInput);
        if (v === null || v === 0) continue;
        out[dof] = v;
      }

      return out;
    }

    // --- Populate ---
    function clearInputs() {
      for (const f of [fTrimStart, fTrimEnd, fTrimStartFrames, fTrimEndFrames,
                       fKeepFrames, fKeepSeconds, fCutFrom, fCutTo, fSpeed,
                       fStabFrames, fStabEase]) {
        f.input.value = '';
      }
      yawCheckbox.checked = false;
      jointList.innerHTML = '';
      trimRadios.none.checked = true;
    }

    function setAdjustments(obj) {
      clearInputs();
      const adj = obj || {};

      // Detect trim mode (priority order).
      let mode = 'none';
      if (adj.keep_seconds !== undefined) {
        mode = 'keep_seconds';
        fKeepSeconds.input.value = String(adj.keep_seconds);
      } else if (adj.keep_frames !== undefined) {
        mode = 'keep_frames';
        fKeepFrames.input.value = String(adj.keep_frames);
      } else if (adj.trim_start_frames !== undefined || adj.trim_end_frames !== undefined) {
        mode = 'frames';
        if (adj.trim_start_frames !== undefined) fTrimStartFrames.input.value = String(adj.trim_start_frames);
        if (adj.trim_end_frames !== undefined) fTrimEndFrames.input.value = String(adj.trim_end_frames);
      } else if (adj.trim_start !== undefined || adj.trim_end !== undefined) {
        mode = 'seconds';
        if (adj.trim_start !== undefined) fTrimStart.input.value = String(adj.trim_start);
        if (adj.trim_end !== undefined) fTrimEnd.input.value = String(adj.trim_end);
      }
      trimRadios[mode].checked = true;
      applyTrimModeVisibility();

      if (adj.cut_from !== undefined) fCutFrom.input.value = String(adj.cut_from);
      if (adj.cut_to !== undefined) fCutTo.input.value = String(adj.cut_to);
      if (adj.speed !== undefined) fSpeed.input.value = String(adj.speed);
      if (adj.stabilize_frames !== undefined) fStabFrames.input.value = String(adj.stabilize_frames);
      if (adj.stabilize_ease_frames !== undefined) fStabEase.input.value = String(adj.stabilize_ease_frames);
      if (adj.align_yaw === true) yawCheckbox.checked = true;

      for (const [k, v] of Object.entries(adj)) {
        if (k.endsWith('_joint_dof')) addJointRow(k, v);
      }
      validateCut();
    }

    // --- Change propagation ---
    function emitChange() {
      validateCut();
      try {
        onChange(getAdjustments());
      } catch (_) {}
    }

    // Wire events.
    for (const m of TRIM_MODES) {
      trimRadios[m].addEventListener('change', () => {
        applyTrimModeVisibility();
        emitChange();
      });
    }
    for (const f of [fTrimStart, fTrimEnd, fTrimStartFrames, fTrimEndFrames,
                     fKeepFrames, fKeepSeconds, fCutFrom, fCutTo, fSpeed,
                     fStabFrames, fStabEase]) {
      f.input.addEventListener('input', emitChange);
    }
    yawCheckbox.addEventListener('change', emitChange);

    container.innerHTML = '';
    container.appendChild(root);

    // Initial population.
    setAdjustments(initial);
    applyTrimModeVisibility();

    return {
      getAdjustments,
      setAdjustments,
      destroy() {
        container.innerHTML = '';
      },
    };
  },
};

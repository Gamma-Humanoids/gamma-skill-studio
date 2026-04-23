"""Pure motion adjustment transforms.

Ported from scripts/apply_motion_adjustments.py. No file I/O here — callers
pass parsed CSV rows (list of dicts) and receive transformed rows back.

Length-changing ops (trim/cut/speed) return a new list with renumbered Frame.
Length-preserving ops (align_yaw_rows/joint_offset) mutate rows in place.
"""
from __future__ import annotations

import math
from typing import Optional, TypeAlias

import numpy as np

ROOT_X = "root_translateX"
ROOT_Y = "root_translateY"
ROOT_YAW = "root_rotateZ"
FPS_DEFAULT = 120

Adjustments: TypeAlias = dict

SPECIAL_KEYS = {
    "align_yaw", "trim_start", "trim_end",
    "trim_start_frames", "trim_end_frames",
    "keep_frames", "keep_seconds",
    "cut_from", "cut_to", "speed",
    "stabilize_frames", "stabilize_ease_frames",
}


def _sec_to_frame(sec: float, fps: int) -> int:
    return int(round(sec * fps))


def _renumber(rows: list[dict]) -> None:
    for i, row in enumerate(rows):
        row["Frame"] = str(i)


def trim(rows: list[dict], *, start_frames: int = 0, end_frames: int = 0) -> list[dict]:
    n = len(rows)
    if start_frames + end_frames >= n:
        raise ValueError(
            f"trim would remove all {n} frames "
            f"(start={start_frames} + end={end_frames})"
        )
    end_idx = n - end_frames if end_frames > 0 else n
    out = [dict(r) for r in rows[start_frames:end_idx]]
    _renumber(out)
    return out


def cut(rows: list[dict], *, cut_from: float, cut_to: float,
        fps: int = FPS_DEFAULT) -> list[dict]:
    if cut_from >= cut_to:
        raise ValueError(f"cut_from ({cut_from}) must be < cut_to ({cut_to})")
    n = len(rows)
    frame_from = _sec_to_frame(cut_from, fps)
    frame_to = min(_sec_to_frame(cut_to, fps), n)
    out = [dict(r) for r in (rows[:frame_from] + rows[frame_to:])]
    if not out:
        raise ValueError("cut removes all frames")
    _renumber(out)
    return out


def speed(rows: list[dict], *, factor: float,
          fps: int = FPS_DEFAULT) -> list[dict]:
    if factor <= 0:
        raise ValueError(f"speed factor must be > 0 (got {factor})")
    n_orig = len(rows)
    n_new = int(round(n_orig / factor))
    if n_new < 2:
        raise ValueError("speed factor too high, result would have < 2 frames")

    numeric_cols = [c for c in rows[0].keys() if c != "Frame"]
    data = np.array([[float(r[c]) for c in numeric_cols] for r in rows])

    orig_times = np.linspace(0, 1, n_orig)
    new_times = np.linspace(0, 1, n_new)
    new_data = np.empty((n_new, len(numeric_cols)))
    for j in range(len(numeric_cols)):
        new_data[:, j] = np.interp(new_times, orig_times, data[:, j])

    out: list[dict] = []
    for i in range(n_new):
        row = {"Frame": str(i)}
        for j, col in enumerate(numeric_cols):
            row[col] = f"{new_data[i, j]:.7f}"
        out.append(row)
    return out


def align_yaw_rows(rows: list[dict], *, target_yaw: float) -> None:
    yaw0 = float(rows[0][ROOT_YAW])
    delta_deg = yaw0 - target_yaw
    if abs(delta_deg) < 0.01:
        return

    delta_rad = math.radians(delta_deg)
    cos_a = math.cos(-delta_rad)
    sin_a = math.sin(-delta_rad)
    x0 = float(rows[0][ROOT_X])
    y0 = float(rows[0][ROOT_Y])

    for row in rows:
        row[ROOT_YAW] = f"{float(row[ROOT_YAW]) - delta_deg:.7f}"
        dx = float(row[ROOT_X]) - x0
        dy = float(row[ROOT_Y]) - y0
        row[ROOT_X] = f"{x0 + dx * cos_a - dy * sin_a:.7f}"
        row[ROOT_Y] = f"{y0 + dx * sin_a + dy * cos_a:.7f}"


def joint_offset(rows: list[dict], offsets: dict) -> None:
    if not rows:
        return
    keys = set(rows[0].keys())
    for col in offsets:
        if col not in keys:
            raise ValueError(f"column '{col}' not in rows")
    for row in rows:
        for col, offset in offsets.items():
            row[col] = f"{float(row[col]) + float(offset):.7f}"


def stabilize(rows: list[dict], *, hold_frames: int = 0,
              ease_frames: int = 0) -> list[dict]:
    """Append frozen-pose frames at the end.

    Drives reference velocity to zero at the clip boundary so motion_lib's
    frame-freeze at overrun matches robot state, killing post-clip jitter.

    Args:
        hold_frames: total frames to append (ease + pure hold).
        ease_frames: first N appended frames ease from the clip's final
            velocity to zero via a cosine ramp. Must be <= hold_frames.
    """
    if hold_frames < 0:
        raise ValueError(f"hold_frames must be >= 0 (got {hold_frames})")
    if ease_frames < 0:
        raise ValueError(f"ease_frames must be >= 0 (got {ease_frames})")
    if ease_frames > hold_frames:
        raise ValueError(
            f"ease_frames ({ease_frames}) must be <= hold_frames ({hold_frames})"
        )
    if hold_frames == 0 or not rows:
        out = [dict(r) for r in rows]
        _renumber(out)
        return out

    last = rows[-1]
    prev = rows[-2] if len(rows) >= 2 else last
    numeric_cols = [c for c in last.keys() if c != "Frame"]

    out = [dict(r) for r in rows]

    # Ease region: starting from last frame, decay per-frame delta (last-prev)
    # with a cosine taper so velocity reaches zero at ease_frames.
    import math as _math
    for i in range(ease_frames):
        # alpha: 1.0 at i=0, 0.0 at i=ease_frames-1
        if ease_frames == 1:
            alpha = 0.0
        else:
            alpha = 0.5 * (1.0 + _math.cos(_math.pi * i / (ease_frames - 1)))
        row = {"Frame": ""}
        for col in numeric_cols:
            delta = float(last[col]) - float(prev[col])
            val = float(last[col]) + alpha * delta
            row[col] = f"{val:.7f}"
        out.append(row)

    # Pure hold: copy of last frame
    hold_only = hold_frames - ease_frames
    for _ in range(hold_only):
        row = {"Frame": ""}
        for col in numeric_cols:
            row[col] = last[col]
        out.append(row)

    _renumber(out)
    return out


def apply_adjustments(
    rows: list[dict],
    fieldnames: list[str],
    adj: Adjustments,
    *,
    fps: int = FPS_DEFAULT,
    target_yaw: Optional[float] = None,
) -> list[dict]:
    adj = dict(adj)  # don't mutate caller's dict

    do_yaw = adj.pop("align_yaw", False)
    trim_start = adj.pop("trim_start", 0)
    trim_end = adj.pop("trim_end", 0)
    trim_start_frames = adj.pop("trim_start_frames", 0)
    trim_end_frames = adj.pop("trim_end_frames", 0)
    keep_frames = adj.pop("keep_frames", None)
    keep_seconds = adj.pop("keep_seconds", None)
    cut_from = adj.pop("cut_from", None)
    cut_to = adj.pop("cut_to", None)
    speed_factor = adj.pop("speed", None)
    stabilize_frames = adj.pop("stabilize_frames", 0)
    stabilize_ease_frames = adj.pop("stabilize_ease_frames", 0)

    # 0. keep_frames / keep_seconds → trim_end_frames
    if keep_frames is not None:
        trim_end_frames = max(0, len(rows) - keep_frames)
    elif keep_seconds is not None:
        trim_end_frames = max(0, len(rows) - _sec_to_frame(keep_seconds, fps))

    # Convert seconds → frames
    start_f = trim_start_frames or (_sec_to_frame(trim_start, fps) if trim_start else 0)
    end_f = trim_end_frames or (_sec_to_frame(trim_end, fps) if trim_end else 0)

    # 1. Trim
    if start_f or end_f:
        rows = trim(rows, start_frames=start_f, end_frames=end_f)

    # 2. Cut
    if cut_from is not None and cut_to is not None:
        rows = cut(rows, cut_from=cut_from, cut_to=cut_to, fps=fps)

    # 3. Speed
    if speed_factor is not None and speed_factor != 1.0:
        rows = speed(rows, factor=speed_factor, fps=fps)

    # 3.5 Stabilize end (append hold frames with zero velocity)
    if stabilize_frames and stabilize_frames > 0:
        rows = stabilize(
            rows,
            hold_frames=int(stabilize_frames),
            ease_frames=int(stabilize_ease_frames or 0),
        )

    # 4. Yaw alignment
    if do_yaw and target_yaw is not None:
        align_yaw_rows(rows, target_yaw=target_yaw)

    # 5. Joint offsets (remaining keys)
    if adj:
        joint_offset(rows, adj)

    return rows

"""Single-operation clip editor: trim / cut / speed.

Reads a CSV, applies one transform from :mod:`viewer.server.adjustments`, and
writes a new CSV. Used by the ``/api/motions/{name}/edit`` endpoint for quick
ad-hoc edits. Chain edits go through ``apply_adjustments`` directly.
"""
from __future__ import annotations

import csv
from pathlib import Path

from viewer.server.adjustments import apply_adjustments

_VALID_OPS = {"trim", "cut", "speed"}

FPS = 120


class EditError(Exception):
    pass


def _build_adjustments(op: str, params: dict) -> dict:
    if op == "trim":
        start = params.get("start", 0.0)
        end = params.get("end", 0.0)
        try:
            start = float(start)
            end = float(end)
        except (TypeError, ValueError):
            raise EditError("trim params must be numeric")
        if start < 0 or end < 0:
            raise EditError("trim start and end must be >= 0")
        if start > 60.0 or end > 60.0:
            raise EditError("trim start and end must be <= 60.0")
        if start == 0 and end == 0:
            raise EditError("trim: at least one of start/end must be > 0")
        adj: dict = {}
        if start > 0:
            adj["trim_start"] = start
        if end > 0:
            adj["trim_end"] = end
        return adj

    if op == "cut":
        try:
            from_sec = float(params["from_"])
            to_sec = float(params["to"])
        except (KeyError, TypeError, ValueError):
            raise EditError("cut params must include 'from_' and 'to' as numbers")
        if from_sec < 0:
            raise EditError("cut from_ must be >= 0")
        if to_sec <= from_sec:
            raise EditError("cut to must be > from_")
        if to_sec > 3600:
            raise EditError("cut to must be <= 3600")
        return {"cut_from": from_sec, "cut_to": to_sec}

    if op == "speed":
        try:
            factor = float(params["factor"])
        except (KeyError, TypeError, ValueError):
            raise EditError("speed params must include 'factor' as a number")
        if factor < 0.1 or factor > 10:
            raise EditError("speed factor must be between 0.1 and 10")
        if abs(factor - 1.0) < 1e-9:
            raise EditError("speed factor must not be 1.0")
        return {"speed": factor}

    raise EditError(f"Invalid op: {op!r}. Must be one of {sorted(_VALID_OPS)}")


def run_edit(source_csv: Path, op: str, params: dict, dest_path: Path) -> Path:
    """Run a clip edit operation and write result to ``dest_path``.

    Args:
        source_csv: absolute path to the source CSV.
        op: one of {"trim", "cut", "speed"}.
        params: op-specific parameters.
        dest_path: target path for the output CSV. Parent dir must exist.

    Returns:
        ``dest_path`` on success.
    """
    if op not in _VALID_OPS:
        raise EditError(f"Invalid op: {op!r}. Must be one of {sorted(_VALID_OPS)}")

    if not source_csv.exists():
        raise EditError(f"Source not found: {source_csv}")

    adjustments = _build_adjustments(op, params)

    try:
        with source_csv.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)
    except OSError as exc:
        raise EditError(f"failed to read {source_csv}: {exc}")

    try:
        out_rows = apply_adjustments(rows, fieldnames, adjustments, fps=FPS)
    except ValueError as exc:
        raise EditError(f"{op} failed: {exc}")

    try:
        with dest_path.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(out_rows)
    except OSError as exc:
        raise EditError(f"failed to write {dest_path}: {exc}")

    return dest_path

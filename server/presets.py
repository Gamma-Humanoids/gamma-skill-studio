"""YAML-backed adjustment presets: named dicts of adjustment values."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


def load_presets(path: str | Path) -> dict[str, dict[str, Any]]:
    """Return {preset_name: adjustments_dict}. Empty dict if file missing or empty."""
    p = Path(path)
    if not p.exists():
        return {}
    raw = yaml.safe_load(p.read_text()) or {}
    presets = raw.get("presets") or {}
    if not isinstance(presets, dict):
        raise ValueError(f"presets root must be a mapping, got {type(presets).__name__}")
    out: dict[str, dict[str, Any]] = {}
    for name, adj in presets.items():
        if not isinstance(adj, dict):
            raise ValueError(f"preset {name!r} must map to a dict, got {type(adj).__name__}")
        out[name] = dict(adj)
    return out


def save_preset(path: str | Path, name: str, adjustments: dict) -> None:
    """Upsert preset by name. Validate name matches ^[A-Za-z0-9_]+$ — raise ValueError otherwise."""
    if not _NAME_RE.match(name):
        raise ValueError(
            f"preset name must be alphanumeric + underscores, got {name!r}"
        )
    p = Path(path)
    presets = load_presets(p) if p.exists() else {}
    presets[name] = dict(adjustments)
    _write(p, presets)


def delete_preset(path: str | Path, name: str) -> bool:
    """Return True if deleted, False if not found."""
    p = Path(path)
    if not p.exists():
        return False
    presets = load_presets(p)
    if name not in presets:
        return False
    del presets[name]
    _write(p, presets)
    return True


def _write(path: Path, presets: dict[str, dict[str, Any]]) -> None:
    data = {"presets": presets}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True))

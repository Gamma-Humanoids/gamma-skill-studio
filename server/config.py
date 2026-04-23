"""Central configuration for gamma-skill-studio.

Reads `<REPO_ROOT>/config.yaml` once and returns resolved paths. All paths in
the yaml are resolved relative to the repo root. The repo root is either:

1. ``$GAMMA_STUDIO_ROOT`` if set, or
2. the directory two levels up from this module (``server/config.py``).

Env var ``$GAMMA_STUDIO_CONFIG`` can override the yaml path.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import yaml


def _repo_root() -> Path:
    env = os.environ.get("GAMMA_STUDIO_ROOT")
    if env:
        return Path(env).resolve()
    return Path(__file__).resolve().parents[1]


def _config_path(repo_root: Path) -> Path:
    env = os.environ.get("GAMMA_STUDIO_CONFIG")
    if env:
        return Path(env).resolve()
    return repo_root / "config.yaml"


_DEFAULTS: dict[str, Any] = {
    "motions_dir": "motions",
    "urdf_path": "assets/simple_2dof/simple_2dof.urdf",
    "meshes_dir": "assets/simple_2dof",
    "catalog_path": "config/skill_catalog.yaml",
    "presets_path": "config/adjustment_presets.yaml",
    "input_fps": 120,
    "build": {
        "protomotions_dir": None,
        "output_dir": "build_out",
        "compiled_name": "motion_library.pt",
    },
}


@dataclass(frozen=True)
class ForgeConfig:
    repo_root: Path
    motions_dir: Path
    urdf_path: Path
    meshes_dir: Path
    catalog_path: Path
    presets_path: Path
    input_fps: int
    # Build plugin (optional)
    protomotions_dir: Optional[Path]
    build_output_dir: Path
    build_compiled_name: str


def _resolve(repo_root: Path, p: str) -> Path:
    path = Path(p)
    if not path.is_absolute():
        path = repo_root / path
    return path


def _load_raw(repo_root: Path) -> dict[str, Any]:
    cfg_path = _config_path(repo_root)
    if not cfg_path.exists():
        return {}
    raw = yaml.safe_load(cfg_path.read_text()) or {}
    if not isinstance(raw, dict):
        return {}
    return raw


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def _build(repo_root: Path, raw: dict[str, Any]) -> ForgeConfig:
    merged = _merge(_DEFAULTS, raw)
    build = merged.get("build") or {}

    proto_dir_raw = build.get("protomotions_dir")
    proto_dir = _resolve(repo_root, proto_dir_raw) if proto_dir_raw else None

    return ForgeConfig(
        repo_root=repo_root,
        motions_dir=_resolve(repo_root, merged["motions_dir"]),
        urdf_path=_resolve(repo_root, merged["urdf_path"]),
        meshes_dir=_resolve(repo_root, merged["meshes_dir"]),
        catalog_path=_resolve(repo_root, merged["catalog_path"]),
        presets_path=_resolve(repo_root, merged["presets_path"]),
        input_fps=int(merged.get("input_fps", 120)),
        protomotions_dir=proto_dir,
        build_output_dir=_resolve(repo_root, build.get("output_dir", "build_out")),
        build_compiled_name=str(build.get("compiled_name", "motion_library.pt")),
    )


@lru_cache(maxsize=1)
def get_config() -> ForgeConfig:
    root = _repo_root()
    return _build(root, _load_raw(root))


def reset_config_cache() -> None:
    """Test-only: clear the lru_cache so a new config is loaded."""
    get_config.cache_clear()

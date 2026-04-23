"""Test fixtures.

A session-scoped ``forge_repo`` fixture creates a self-contained tmp repo
with ``motions/``, ``config/``, and ``assets/simple_2dof/`` populated with
synthetic test data. ``GAMMA_STUDIO_ROOT`` points at it so
``viewer.server.config.get_config()`` resolves all paths inside the tmpdir.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_CLIP = "sample_clip.csv"

# 30-DOF column set (root trans XYZ + root rot XYZ + 24 joint DOFs = 30, plus Frame)
_DOF_COLS = [
    "root_translateX", "root_translateY", "root_translateZ",
    "root_rotateX", "root_rotateY", "root_rotateZ",
] + [f"joint_{i:02d}_dof" for i in range(24)]

_FIELDS = ["Frame"] + _DOF_COLS


def _make_sample_csv(path: Path, n_frames: int = 240) -> None:
    lines = [",".join(_FIELDS)]
    for i in range(n_frames):
        vals = ["0.0000000"] * len(_DOF_COLS)
        # vary root x so "motion" exists; last field nonzero
        vals[0] = f"{i * 0.001:.7f}"
        lines.append(",".join([str(i)] + vals))
    path.write_text("\n".join(lines) + "\n")


_MINIMAL_URDF = """<?xml version="1.0"?>
<robot name="simple_2dof">
  <link name="base_link">
    <visual>
      <geometry>
        <mesh filename="meshes/base.STL"/>
      </geometry>
    </visual>
  </link>
</robot>
"""


def _make_fake_stl(path: Path) -> None:
    # 80-byte header + 4-byte count + one 50-byte triangle record = valid
    # binary STL. Padded out to make the smoke test's >100 byte assertion
    # pass without depending on any shipped asset.
    header = b"gamma-skill-studio-test-stl".ljust(80, b"\x00")
    triangle = b"\x00" * 50
    path.write_bytes(header + (1).to_bytes(4, "little") + triangle)


def _build_repo(root: Path) -> None:
    motions_dir = root / "motions"
    motions_dir.mkdir(parents=True, exist_ok=True)
    _make_sample_csv(motions_dir / TEST_CLIP)

    config_dir = root / "config"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "skill_catalog.yaml").write_text(
        "build:\n"
        "  input_fps: 120\n"
        "  output_fps: 30\n"
        "  yaw_reference: null\n"
        "entries:\n"
        "  - {name: breathing, motion: sample_clip, csv: motions/sample_clip.csv,"
        " kind: gesture, duration: 2.0, idle: true}\n"
    )
    (config_dir / "adjustment_presets.yaml").write_text("presets: {}\n")

    assets_dir = root / "assets" / "simple_2dof"
    assets_dir.mkdir(parents=True, exist_ok=True)
    (assets_dir / "simple_2dof.urdf").write_text(_MINIMAL_URDF)
    _make_fake_stl(assets_dir / "base.STL")


@pytest.fixture(scope="session")
def forge_repo(tmp_path_factory):
    root = tmp_path_factory.mktemp("forge_repo")
    _build_repo(root)

    # Set env BEFORE importing the app so get_config picks it up. We
    # also reset the lru_cache in case another test already imported.
    os.environ["GAMMA_STUDIO_ROOT"] = str(root)

    from viewer.server.config import reset_config_cache
    reset_config_cache()

    yield root

    # Leave env alone — tmp_path_factory cleans up the dir.


@pytest.fixture()
def config(forge_repo):
    from viewer.server.config import get_config, reset_config_cache
    reset_config_cache()
    return get_config()


@pytest.fixture(scope="session")
def client(forge_repo) -> TestClient:
    # Import app after env is set.
    from viewer.server.app import app
    return TestClient(app, follow_redirects=False)


@pytest.fixture()
def sample_csv(forge_repo) -> Path:
    return forge_repo / "motions" / TEST_CLIP

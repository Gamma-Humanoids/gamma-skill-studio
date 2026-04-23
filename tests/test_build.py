"""Tests for the ProtoMotions build plugin.

These tests exercise the pure-Python parts (config writer, job queue, run
orchestration with subprocess stubbed) — they do not require ProtoMotions to
be installed. The plugin module is imported directly.
"""
from pathlib import Path
import time

import pytest
import yaml

from viewer.server.plugins.protomotions_build import (
    BuildJob,
    BuildManager,
    _apply_one,
    run_build,
    write_motion_config,
)
from viewer.server.catalog import BuildSettings, Catalog, Entry


def make_cat(**overrides):
    entries = overrides.pop("entries", [
        Entry(name="a", motion="a_m", csv="motions/a.csv", kind="gesture", duration=5.0),
        Entry(name="b", motion="b_m", csv="motions/b.csv", kind="skill", duration=5.0, include=False),
        Entry(name="c", motion="c_m", csv="motions/c.csv", kind="locomotion", duration=5.0),
    ])
    return Catalog(build=BuildSettings(**overrides), entries=entries)


@pytest.fixture
def configured_build(forge_repo, monkeypatch, tmp_path):
    """Configure the plugin so paths resolve inside tmp_path."""
    proto_root = tmp_path / "proto_root"
    proto_root.mkdir()
    out_dir = tmp_path / "build_out"

    from viewer.server.config import ForgeConfig, get_config
    from viewer.server.plugins import protomotions_build as b

    base = get_config()
    overridden = ForgeConfig(
        repo_root=base.repo_root,
        motions_dir=base.motions_dir,
        urdf_path=base.urdf_path,
        meshes_dir=base.meshes_dir,
        catalog_path=base.catalog_path,
        presets_path=base.presets_path,
        input_fps=base.input_fps,
        protomotions_dir=proto_root,
        build_output_dir=out_dir,
        build_compiled_name="motion_library.pt",
    )
    monkeypatch.setattr(b, "get_config", lambda: overridden)
    return overridden


def test_write_motion_config_excludes_non_included(tmp_path):
    cat = make_cat()
    out = tmp_path / "motion_config.yaml"
    write_motion_config(cat, out)
    data = yaml.safe_load(out.read_text())
    motions = [m["file"] for m in data["motions"]]
    assert motions == ["proto/a_m.motion", "proto/c_m.motion"]
    assert all(m["weight"] == 1.0 for m in data["motions"])


def test_buildjob_log_queue():
    j = BuildJob()
    j.log("hello")
    assert j.log_queue.get_nowait() == "hello"


def test_buildmanager_rejects_parallel(monkeypatch, configured_build):
    m = BuildManager()

    import viewer.server.plugins.protomotions_build as b

    def fake_run(cat, job, env=None):
        job.status = "running"
        time.sleep(0.2)
        job.status = "success"
    monkeypatch.setattr(b, "run_build", fake_run)

    cat = make_cat()
    j1 = m.start(cat)
    time.sleep(0.02)
    assert j1.status == "running"
    with pytest.raises(RuntimeError, match="in progress"):
        m.start(cat)
    while j1.status == "running":
        time.sleep(0.01)
    j2 = m.start(cat)
    assert j2.id != j1.id


def test_apply_one_writes_transformed_csv(tmp_path, monkeypatch):
    src_dir = tmp_path / "motions"
    src_dir.mkdir()
    csv = src_dir / "tiny.csv"
    csv.write_text(
        "Frame,root_translateX,root_translateY,root_rotateZ,joint_00_dof\n"
        "0,0,0,0,0\n1,0,0,0,0\n2,0,0,0,0\n3,0,0,0,0\n"
    )
    entry = Entry(
        name="t", motion="tiny", csv=f"{csv.relative_to(tmp_path)}",
        kind="gesture", duration=5.0, adjustments={"trim_start_frames": 1},
    )

    # Make _paths() return tmp_path as repo_root.
    from viewer.server.config import ForgeConfig
    import viewer.server.plugins.protomotions_build as b
    fake = ForgeConfig(
        repo_root=tmp_path,
        motions_dir=src_dir, urdf_path=tmp_path/"u.urdf", meshes_dir=tmp_path,
        catalog_path=tmp_path/"cat.yaml", presets_path=tmp_path/"p.yaml",
        input_fps=120, protomotions_dir=tmp_path,
        build_output_dir=tmp_path/"out", build_compiled_name="x.pt",
    )
    monkeypatch.setattr(b, "get_config", lambda: fake)

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    _apply_one(entry, 120, None, out_dir)
    out_csv = out_dir / "tiny.csv"
    assert out_csv.exists()
    assert out_csv.read_text().count("\n") == 4  # header + 3 data rows


def test_run_build_success_path(monkeypatch, configured_build):
    import viewer.server.plugins.protomotions_build as b

    calls = []
    def fake_sp(cmd, *, cwd, env, job):
        calls.append(cmd[0])
        job.log(f"stub running {cmd[0]}")
    monkeypatch.setattr(b, "_run_subprocess", fake_sp)
    monkeypatch.setattr(b, "_apply_one", lambda entry, fps, yaw, out_dir: None)
    monkeypatch.setattr(b, "_read_target_yaw", lambda cat: None)

    cat = make_cat()
    job = BuildJob()
    b.run_build(cat, job)
    assert job.status == "success", job.error
    assert calls == ["python3", "python3"]
    assert configured_build.build_output_dir.joinpath("motion_config.yaml").exists()


def test_run_build_error_path(monkeypatch, configured_build):
    import viewer.server.plugins.protomotions_build as b

    def failing_sp(cmd, *, cwd, env, job):
        raise RuntimeError("boom")
    monkeypatch.setattr(b, "_run_subprocess", failing_sp)
    monkeypatch.setattr(b, "_apply_one", lambda *a, **k: None)
    monkeypatch.setattr(b, "_read_target_yaw", lambda cat: None)

    cat = make_cat()
    job = BuildJob()
    b.run_build(cat, job)
    assert job.status == "error"
    assert "boom" in (job.error or "")


def test_plugin_unavailable_without_config(forge_repo, monkeypatch):
    """When protomotions_dir is None, get_build_manager returns None."""
    from viewer.server.config import ForgeConfig, get_config
    from viewer.server import plugins

    base = get_config()
    disabled = ForgeConfig(
        repo_root=base.repo_root,
        motions_dir=base.motions_dir,
        urdf_path=base.urdf_path,
        meshes_dir=base.meshes_dir,
        catalog_path=base.catalog_path,
        presets_path=base.presets_path,
        input_fps=base.input_fps,
        protomotions_dir=None,
        build_output_dir=base.build_output_dir,
        build_compiled_name=base.build_compiled_name,
    )
    monkeypatch.setattr(plugins, "get_config", lambda: disabled)
    assert plugins.get_build_manager() is None

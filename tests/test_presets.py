from pathlib import Path

import pytest

from viewer.server.presets import delete_preset, load_presets, save_preset


def test_load_missing_file_returns_empty(tmp_path: Path):
    assert load_presets(tmp_path / "nope.yaml") == {}


def test_load_empty_file_returns_empty(tmp_path: Path):
    path = tmp_path / "p.yaml"
    path.write_text("")
    assert load_presets(path) == {}


def test_load_empty_presets_root(tmp_path: Path):
    path = tmp_path / "p.yaml"
    path.write_text("presets: {}\n")
    assert load_presets(path) == {}


def test_save_and_reload_roundtrip(tmp_path: Path):
    path = tmp_path / "p.yaml"
    save_preset(path, "align_and_trim", {"align_yaw": True, "trim_start": 0.5})
    save_preset(path, "waist_fix", {"waist_pitch_joint_dof": -10.0})
    loaded = load_presets(path)
    assert loaded == {
        "align_and_trim": {"align_yaw": True, "trim_start": 0.5},
        "waist_fix": {"waist_pitch_joint_dof": -10.0},
    }


def test_save_upserts_existing(tmp_path: Path):
    path = tmp_path / "p.yaml"
    save_preset(path, "foo", {"align_yaw": True})
    save_preset(path, "foo", {"trim_start": 1.0})
    assert load_presets(path) == {"foo": {"trim_start": 1.0}}


def test_delete_existing_returns_true(tmp_path: Path):
    path = tmp_path / "p.yaml"
    save_preset(path, "foo", {"align_yaw": True})
    save_preset(path, "bar", {"trim_start": 1.0})
    assert delete_preset(path, "foo") is True
    assert load_presets(path) == {"bar": {"trim_start": 1.0}}


def test_delete_missing_returns_false(tmp_path: Path):
    path = tmp_path / "p.yaml"
    save_preset(path, "foo", {"align_yaw": True})
    assert delete_preset(path, "nope") is False


def test_delete_on_missing_file_returns_false(tmp_path: Path):
    assert delete_preset(tmp_path / "nope.yaml", "foo") is False


def test_save_rejects_invalid_name(tmp_path: Path):
    path = tmp_path / "p.yaml"
    with pytest.raises(ValueError):
        save_preset(path, "bad name!", {})
    with pytest.raises(ValueError):
        save_preset(path, "bad-name", {})
    with pytest.raises(ValueError):
        save_preset(path, "", {})


def test_save_accepts_valid_names(tmp_path: Path):
    path = tmp_path / "p.yaml"
    save_preset(path, "good_name_123", {"align_yaw": True})
    assert "good_name_123" in load_presets(path)

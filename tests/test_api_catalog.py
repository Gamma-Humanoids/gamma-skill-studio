import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from viewer.server import app as app_module
from viewer.server.config import get_config


@pytest.fixture
def catalog_client(forge_repo, tmp_path, monkeypatch):
    """Client with catalog redirected to a tmp file, seeded from the real one."""
    cfg = get_config()
    tmp_cat = tmp_path / "skill_catalog.yaml"
    shutil.copy2(cfg.catalog_path, tmp_cat)

    # Override get_config in the app module so catalog endpoints use tmp file.
    orig_get_config = app_module.get_config

    class _Cfg:
        def __init__(self, base, cat_path):
            self._base = base
            self.catalog_path = cat_path
        def __getattr__(self, name):
            return getattr(self._base, name)

    override = _Cfg(cfg, tmp_cat)
    monkeypatch.setattr(app_module, "get_config", lambda: override)
    return TestClient(app_module.app)


def test_get_catalog(catalog_client):
    r = catalog_client.get("/api/catalog")
    assert r.status_code == 200
    data = r.json()
    assert "entries" in data and "build" in data
    assert any(e["name"] == "breathing" for e in data["entries"])


def test_put_and_delete_entry(catalog_client):
    new_entry = {
        "name": "test_wave",
        "motion": "test_wave_motion",
        "csv": "motions/test_wave_motion.csv",
        "kind": "gesture",
        "duration": 5.0,
        "adjustments": {"joint_00_dof": -5.0},
    }
    r = catalog_client.put("/api/catalog/entries/test_wave", json=new_entry)
    assert r.status_code == 200
    data = catalog_client.get("/api/catalog").json()
    assert any(e["name"] == "test_wave" for e in data["entries"])

    r = catalog_client.delete("/api/catalog/entries/test_wave")
    assert r.status_code == 204
    data = catalog_client.get("/api/catalog").json()
    assert not any(e["name"] == "test_wave" for e in data["entries"])


def test_put_entry_name_mismatch_rejected(catalog_client):
    r = catalog_client.put("/api/catalog/entries/xyz", json={
        "name": "zzz", "motion": "m", "csv": "s/a.csv", "kind": "gesture",
    })
    assert r.status_code == 400


def test_delete_nonexistent_entry_404(catalog_client):
    r = catalog_client.delete("/api/catalog/entries/does_not_exist")
    assert r.status_code == 404


def test_put_build_settings(catalog_client):
    r = catalog_client.put("/api/catalog/build", json={
        "input_fps": 60, "output_fps": 30, "yaw_reference": "foo",
    })
    assert r.status_code == 200
    data = catalog_client.get("/api/catalog").json()
    assert data["build"]["input_fps"] == 60


def test_fs_list_ok(catalog_client, tmp_path):
    (tmp_path / "a.csv").write_text("x")
    (tmp_path / "sub").mkdir()
    r = catalog_client.get("/api/fs/list", params={"path": str(tmp_path)})
    assert r.status_code == 200
    names = [e["name"] for e in r.json()]
    assert "a.csv" in names and "sub" in names


def test_fs_list_missing_path_404(catalog_client):
    r = catalog_client.get("/api/fs/list", params={"path": "/path/that/does/not/exist"})
    assert r.status_code == 404


def test_import_csv(forge_repo, tmp_path):
    # Use the real client (no catalog override) so paths resolve inside the
    # forge_repo tmpdir.
    from viewer.server.app import app
    client = TestClient(app)

    src = tmp_path / "clip.csv"
    src.write_text("Frame,x\n0,0\n")
    r = client.post("/api/import", json={"src_path": str(src), "dest_name": "imported"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["csv"] == "motions/imported.csv"
    assert (forge_repo / "motions" / "imported.csv").exists()


def test_import_rejects_non_csv(catalog_client, tmp_path):
    src = tmp_path / "nope.txt"
    src.write_text("x")
    r = catalog_client.post("/api/import", json={"src_path": str(src), "dest_name": "x"})
    assert r.status_code == 400


def test_preview_applies_adjustments(catalog_client):
    r = catalog_client.post("/api/motions/preview", json={
        "csv": "motions/sample_clip.csv",
        "adjustments": {"trim_start_frames": 100},
    })
    assert r.status_code == 200
    lines = r.text.strip().splitlines()
    assert len(lines) > 2


def test_fs_default_returns_motions_dir(catalog_client, forge_repo):
    r = catalog_client.get("/api/fs/default")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("path"), str)
    assert data["path"] == str(forge_repo / "motions")


def test_fs_list_without_path_uses_default(catalog_client):
    r = catalog_client.get("/api/fs/list")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_csv_endpoint_ok(catalog_client, forge_repo):
    csvs = list((forge_repo / "motions").glob("*.csv"))
    assert csvs, "need at least one .csv"
    rel = f"motions/{csvs[0].name}"
    r = catalog_client.get("/api/csv", params={"path": rel})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")


def test_csv_endpoint_missing_404(catalog_client):
    r = catalog_client.get("/api/csv", params={"path": "motions/__nope__.csv"})
    assert r.status_code == 404


def test_csv_endpoint_wrong_ext_400(catalog_client, tmp_path):
    f = tmp_path / "foo.txt"
    f.write_text("x")
    r = catalog_client.get("/api/csv", params={"path": str(f)})
    assert r.status_code == 400


def test_build_status_idle(catalog_client):
    r = catalog_client.get("/api/build/status")
    assert r.status_code == 200
    assert "status" in r.json()

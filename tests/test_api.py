from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import TEST_CLIP


@pytest.fixture()
def tmp_dest_factory(tmp_path):
    created: list[Path] = []

    def _make(name: str) -> Path:
        p = tmp_path / name
        created.append(p)
        return p

    yield _make
    for p in created:
        if p.exists():
            p.unlink()


def test_root_redirect(client: TestClient) -> None:
    r = client.get("/")
    assert r.status_code == 307
    assert r.headers["location"].startswith("/ui/")


def test_list_motions(client: TestClient) -> None:
    r = client.get("/api/motions")
    assert r.status_code == 200
    data = r.json()
    assert any(e["source"] == "motion" for e in data)
    assert all(e["source"] == "motion" for e in data)


def test_get_motion_csv(client: TestClient) -> None:
    r = client.get(f"/api/motions/{TEST_CLIP}")
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert r.text.splitlines()[0].startswith("Frame,")


def test_get_motion_info(client: TestClient) -> None:
    r = client.get(f"/api/motions/{TEST_CLIP}/info")
    assert r.status_code == 200
    data = r.json()
    assert data["fps"] == 120
    assert data["frames"] == 240


def test_get_motion_rejects_traversal(client: TestClient) -> None:
    r = client.get("/api/motions/..%2Fpasswd")
    assert r.status_code in (400, 404)


def test_get_urdf_rewrites_meshes(client: TestClient) -> None:
    r = client.get("/api/urdf")
    assert r.status_code == 200
    body = r.text
    assert "/api/meshes/" in body
    assert 'filename="meshes/' not in body


def test_get_mesh(client: TestClient) -> None:
    r = client.get("/api/meshes/base.STL")
    assert r.status_code == 200
    assert len(r.content) > 0
    assert r.headers["content-type"] == "application/octet-stream"


def test_get_mesh_rejects_non_stl(client: TestClient) -> None:
    r = client.get("/api/meshes/foo.txt")
    assert r.status_code == 400


def test_get_missing_motion_404(client: TestClient) -> None:
    r = client.get("/api/motions/nonexistent_clip_xyz.csv")
    assert r.status_code == 404


def test_edit_api_trim(client: TestClient, tmp_dest_factory) -> None:
    dest = tmp_dest_factory("api_trim_test.csv")
    r = client.post(
        f"/api/motions/{TEST_CLIP}/edit",
        json={
            "op": "trim",
            "params": {"start": 0.5, "end": 0.0},
            "dest_path": str(dest),
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["dest_path"] == str(dest)
    assert data["frames"] > 0
    assert dest.exists()


def test_edit_api_bad_op_returns_400(client: TestClient, tmp_dest_factory) -> None:
    dest = tmp_dest_factory("bad_op_out.csv")
    r = client.post(
        f"/api/motions/{TEST_CLIP}/edit",
        json={"op": "plot", "params": {}, "dest_path": str(dest)},
    )
    assert r.status_code == 400


def test_edit_api_source_404(client: TestClient, tmp_dest_factory) -> None:
    dest = tmp_dest_factory("nope_out.csv")
    r = client.post(
        "/api/motions/nonexistent_clip_xyz.csv/edit",
        json={
            "op": "trim",
            "params": {"start": 0.5, "end": 0.0},
            "dest_path": str(dest),
        },
    )
    assert r.status_code == 404


def test_edit_api_conflict_without_overwrite(client: TestClient, tmp_dest_factory) -> None:
    dest = tmp_dest_factory("conflict_out.csv")
    dest.write_text("existing")
    r = client.post(
        f"/api/motions/{TEST_CLIP}/edit",
        json={
            "op": "trim",
            "params": {"start": 0.5, "end": 0.0},
            "dest_path": str(dest),
        },
    )
    assert r.status_code == 409


def test_edit_api_overwrite(client: TestClient, tmp_dest_factory) -> None:
    dest = tmp_dest_factory("overwrite_out.csv")
    dest.write_text("existing")
    r = client.post(
        f"/api/motions/{TEST_CLIP}/edit",
        json={
            "op": "trim",
            "params": {"start": 0.5, "end": 0.0},
            "dest_path": str(dest),
            "overwrite": True,
        },
    )
    assert r.status_code == 200


def test_edit_api_missing_parent_dir_404(client: TestClient) -> None:
    r = client.post(
        f"/api/motions/{TEST_CLIP}/edit",
        json={
            "op": "trim",
            "params": {"start": 0.5, "end": 0.0},
            "dest_path": "/tmp/nonexistent_dir_xyz/out.csv",
        },
    )
    assert r.status_code == 404

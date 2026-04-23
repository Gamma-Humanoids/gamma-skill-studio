from __future__ import annotations

import re

from fastapi.testclient import TestClient


def test_smoke_end_to_end(client: TestClient) -> None:
    """Smoke test: verify core endpoints and data flow."""

    # 1. Root redirects to UI
    r = client.get("/")
    assert r.status_code == 307, f"Expected 307, got {r.status_code}"
    assert r.headers["location"].startswith("/ui/")

    # 2. List motions returns 200 with non-empty list
    r = client.get("/api/motions")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    motions = r.json()
    assert isinstance(motions, list)
    assert len(motions) > 0, "Motion list is empty"
    assert any(e["source"] == "motion" for e in motions), "No motions found"

    # 3. Pick first motion, get info
    first = next((e["name"] for e in motions if e["source"] == "motion"), None)
    assert first is not None, "No motion found"

    r = client.get(f"/api/motions/{first}/info")
    assert r.status_code == 200, f"Expected 200 for motion info, got {r.status_code}"
    info = r.json()
    assert info["frames"] > 0, f"Motion has {info['frames']} frames"
    assert info["fps"] == 120, f"Expected 120 FPS, got {info['fps']}"

    # 4. Get URDF
    r = client.get("/api/urdf")
    assert r.status_code == 200, f"Expected 200 for URDF, got {r.status_code}"
    urdf_body = r.text
    assert "<robot" in urdf_body, "URDF missing <robot> tag"
    assert "/api/meshes/" in urdf_body, "URDF paths not rewritten to /api/meshes/"

    # 5. Extract and fetch a mesh reference from URDF
    mesh_refs = re.findall(r'/api/meshes/([A-Za-z_]+\.STL)', urdf_body)
    assert len(mesh_refs) > 0, "No mesh references found in URDF"

    mesh_name = mesh_refs[0]
    r = client.get(f"/api/meshes/{mesh_name}")
    assert r.status_code == 200, f"Expected 200 for mesh, got {r.status_code}"
    assert len(r.content) > 100, f"Mesh too small: {len(r.content)} bytes"

    # 6. Get UI index.html
    r = client.get("/ui/index.html")
    assert r.status_code == 200, f"Expected 200 for index.html, got {r.status_code}"
    html_body = r.text
    assert "<!DOCTYPE html>" in html_body, "Missing DOCTYPE"
    assert "main.js" in html_body, "index.html doesn't reference main.js"

    # 7. Get main.js
    r = client.get("/ui/main.js")
    assert r.status_code == 200, f"Expected 200 for main.js, got {r.status_code}"
    js_body = r.text
    assert "import" in js_body, "main.js doesn't contain import statements"

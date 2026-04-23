from __future__ import annotations

from viewer.server.urdf_rewrite import rewrite_mesh_paths


def test_rewrite_basic() -> None:
    urdf = '<mesh filename="meshes/pelvis.STL"/>'
    result = rewrite_mesh_paths(urdf, "/api/meshes")
    assert 'filename="/api/meshes/pelvis.STL"' in result


def test_rewrite_single_quotes() -> None:
    urdf = "<mesh filename='meshes/pelvis.STL'/>"
    result = rewrite_mesh_paths(urdf, "/api/meshes")
    assert "filename='/api/meshes/pelvis.STL'" in result

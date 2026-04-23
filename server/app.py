from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from viewer.server.catalog import BuildSettings, Catalog, Entry, load_catalog, save_catalog
from viewer.server.config import get_config
from viewer.server.csv_io import parse_info
from viewer.server.editor import EditError, run_edit
from viewer.server.fs import list_dir
from viewer.server.presets import delete_preset, load_presets, save_preset
from viewer.server.urdf_rewrite import rewrite_mesh_paths

logger = logging.getLogger(__name__)

WEB_DIR = Path(__file__).resolve().parents[1] / "web"

app = FastAPI(title="Gamma Skill Studio")

app.mount("/ui", StaticFiles(directory=str(WEB_DIR), html=True), name="ui")


def _validate_name(name: str, suffix: str | tuple[str, ...]) -> None:
    """Raise 400 if name contains path traversal chars or wrong extension."""
    bad = {"/", "\\", "..", "\x00"}
    if any(c in name for c in bad):
        raise HTTPException(status_code=400, detail="Invalid name")
    if name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid name")
    if isinstance(suffix, str):
        suffix = (suffix,)
    if not any(name.lower().endswith(s.lower()) for s in suffix):
        raise HTTPException(status_code=400, detail=f"Name must end with {suffix}")


def _safe_resolve(base: Path, name: str) -> Path:
    """Resolve base/name and assert it stays inside base."""
    resolved = (base / name).resolve()
    if not resolved.is_relative_to(base.resolve()):
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return resolved


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/ui/index.html", status_code=307)


@app.get("/api/motions")
def list_motions() -> list[dict]:
    cfg = get_config()
    entries: list[dict] = []
    if cfg.motions_dir.exists():
        for p in cfg.motions_dir.glob("*.csv"):
            entries.append({"name": p.name, "source": "motion", "size": p.stat().st_size})
    entries.sort(key=lambda e: e["name"])
    return entries


@app.get("/api/motions/{name}/info")
def motion_info(name: str) -> dict:
    _validate_name(name, ".csv")
    cfg = get_config()
    path = _safe_resolve(cfg.motions_dir, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Motion not found")
    info = parse_info(path)
    return {"name": name, **info}


@app.get("/api/motions/{name}")
def get_motion(name: str) -> Response:
    _validate_name(name, ".csv")
    cfg = get_config()
    path = _safe_resolve(cfg.motions_dir, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Motion not found")
    return FileResponse(str(path), media_type="text/csv")


class EditRequest(BaseModel):
    op: str
    params: dict[str, Any]
    dest_path: str = Field(..., min_length=1)
    overwrite: bool = False


def _resolve_dest_path(dest_path: str) -> Path:
    """Resolve dest_path: absolute used as-is; relative is under repo_root.

    The parent directory must already exist — we do not create arbitrary dirs.
    """
    p = Path(dest_path)
    resolved = p if p.is_absolute() else (get_config().repo_root / p).resolve()
    return resolved


@app.post("/api/motions/{name}/edit")
def edit_motion(name: str, body: EditRequest) -> dict:
    _validate_name(name, ".csv")

    cfg = get_config()
    source_csv = _safe_resolve(cfg.motions_dir, name)
    if not source_csv.exists():
        raise HTTPException(status_code=404, detail="Motion not found")

    dest = _resolve_dest_path(body.dest_path)
    if not dest.name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="dest_path must end with .csv")
    if not dest.parent.exists():
        raise HTTPException(status_code=404, detail=f"dest_path parent dir not found: {dest.parent}")
    if dest.exists() and not body.overwrite:
        raise HTTPException(status_code=409, detail=f"dest_path exists: {dest}")

    try:
        out_path = run_edit(source_csv, body.op, body.params, dest)
    except EditError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    info = parse_info(out_path)
    return {
        "dest_path": str(out_path),
        "frames": info["frames"],
        "duration_s": info["duration_s"],
    }


class EditChainReq(BaseModel):
    """Staged-edit request. Ops are applied sequentially. If save=false the
    transformed CSV is returned as text (no disk write). If save=true the
    final CSV is written to dest_path.
    """
    ops: list[dict[str, Any]] = Field(default_factory=list)
    save: bool = False
    dest_path: str | None = None
    overwrite: bool = False


@app.post("/api/motions/{name}/edit-chain")
def edit_chain(name: str, body: EditChainReq) -> Response:
    _validate_name(name, ".csv")
    cfg = get_config()
    source_csv = _safe_resolve(cfg.motions_dir, name)
    if not source_csv.exists():
        raise HTTPException(status_code=404, detail="Motion not found")
    if not body.ops:
        if body.save:
            raise HTTPException(400, "cannot save with no ops")
        return FileResponse(str(source_csv), media_type="text/csv")

    import tempfile
    with tempfile.TemporaryDirectory() as tmpd:
        current = source_csv
        for i, step in enumerate(body.ops):
            op = step.get("op")
            params = step.get("params", {}) or {}
            nxt = Path(tmpd) / f"step_{i}.csv"
            try:
                run_edit(current, op, params, nxt)
            except EditError as exc:
                raise HTTPException(400, f"step {i} ({op}): {exc}")
            current = nxt

        if body.save:
            if not body.dest_path:
                raise HTTPException(400, "dest_path required when save=true")
            dest = _resolve_dest_path(body.dest_path)
            if not dest.name.lower().endswith(".csv"):
                raise HTTPException(400, "dest_path must end with .csv")
            if not dest.parent.exists():
                raise HTTPException(404, f"dest_path parent dir not found: {dest.parent}")
            if dest.exists() and not body.overwrite:
                raise HTTPException(409, f"dest_path exists: {dest}")
            shutil.copy2(current, dest)
            info = parse_info(dest)
            import json as _json
            return Response(
                content=_json.dumps({
                    "dest_path": str(dest),
                    "frames": info["frames"],
                    "duration_s": info["duration_s"],
                }),
                media_type="application/json",
            )
        return Response(content=current.read_text(), media_type="text/csv")


@app.get("/api/urdf")
def get_urdf() -> Response:
    cfg = get_config()
    urdf_text = cfg.urdf_path.read_text(encoding="utf-8")
    rewritten = rewrite_mesh_paths(urdf_text, "/api/meshes")
    return Response(content=rewritten, media_type="application/xml")


@app.get("/api/meshes/{name}")
def get_mesh(name: str) -> FileResponse:
    _validate_name(name, (".STL", ".stl"))
    cfg = get_config()
    path = _safe_resolve(cfg.meshes_dir, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Mesh not found")
    return FileResponse(str(path), media_type="application/octet-stream")


# ---- Catalog / build / presets ----


def _get_catalog() -> Catalog:
    return load_catalog(get_config().catalog_path)


@app.get("/api/catalog")
def api_get_catalog() -> dict:
    return _get_catalog().model_dump()


@app.put("/api/catalog/entries/{name}")
def api_put_entry(name: str, body: dict) -> dict:
    if body.get("name") != name:
        raise HTTPException(400, "name in path must match name in body")
    try:
        entry = Entry.model_validate(body)
    except Exception as e:
        raise HTTPException(400, f"invalid entry: {e}")
    cat = _get_catalog()
    cat.entries = [e for e in cat.entries if e.name != name] + [entry]
    try:
        cat.validate_unique_names()
    except ValueError as e:
        raise HTTPException(409, str(e))
    save_catalog(cat, get_config().catalog_path)
    return entry.model_dump()


@app.delete("/api/catalog/entries/{name}", status_code=204)
def api_delete_entry(name: str) -> Response:
    cat = _get_catalog()
    before = len(cat.entries)
    cat.entries = [e for e in cat.entries if e.name != name]
    if len(cat.entries) == before:
        raise HTTPException(404, f"entry not found: {name}")
    save_catalog(cat, get_config().catalog_path)
    return Response(status_code=204)


@app.put("/api/catalog/build")
def api_put_build_settings(body: dict) -> dict:
    try:
        build = BuildSettings.model_validate(body)
    except Exception as e:
        raise HTTPException(400, f"invalid build settings: {e}")
    cat = _get_catalog()
    cat.build = build
    save_catalog(cat, get_config().catalog_path)
    return cat.build.model_dump()


@app.get("/api/fs/default")
def api_fs_default() -> dict:
    return {"path": str(get_config().motions_dir)}


@app.get("/api/fs/list")
def api_fs_list(path: str | None = None) -> list[dict]:
    cfg = get_config()
    target = Path(path) if path else cfg.repo_root
    try:
        return list_dir(target)
    except FileNotFoundError:
        raise HTTPException(404, f"path not found: {target}")
    except NotADirectoryError:
        raise HTTPException(400, f"not a directory: {target}")


@app.get("/api/csv")
def api_get_csv(path: str) -> Response:
    cfg = get_config()
    p = Path(path)
    if not p.is_absolute():
        p = (cfg.repo_root / p).resolve()
    if not p.name.lower().endswith(".csv"):
        raise HTTPException(400, "path must end with .csv")
    if not p.exists() or not p.is_file():
        raise HTTPException(404, f"csv not found: {p}")
    return FileResponse(str(p), media_type="text/csv")


class ImportReq(BaseModel):
    src_path: str
    dest_name: str  # filename without extension; written into motions/


@app.post("/api/import")
def api_import(body: ImportReq) -> dict:
    cfg = get_config()
    src = Path(body.src_path)
    if not src.exists() or src.suffix.lower() != ".csv":
        raise HTTPException(400, "src_path must be an existing .csv file")
    if not body.dest_name or "/" in body.dest_name or "\\" in body.dest_name or body.dest_name.startswith("."):
        raise HTTPException(400, "invalid dest_name")
    dest = cfg.motions_dir / f"{body.dest_name}.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        same_file = dest.exists() and src.resolve() == dest.resolve()
    except OSError:
        same_file = False
    if dest.exists() and not same_file:
        raise HTTPException(409, f"destination already exists: {dest.name}")
    if not same_file:
        shutil.copy2(src, dest)
    rel = dest.resolve().relative_to(cfg.repo_root.resolve())
    return {"csv": str(rel), "motion": body.dest_name}


@app.post("/api/import/upload")
async def api_import_upload(
    file: UploadFile = File(...),
    dest_name: str = Form(...),
    dest_dir: str = Form("motions"),
    overwrite: bool = Form(False),
) -> dict:
    cfg = get_config()
    if not dest_name or "/" in dest_name or "\\" in dest_name or dest_name.startswith("."):
        raise HTTPException(400, "invalid dest_name")
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(400, "file must be a .csv")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(413, "file too large (>50 MB)")

    # Resolve dest_dir: accept absolute within repo or relative to repo root.
    raw = Path(dest_dir)
    candidate = raw if raw.is_absolute() else (cfg.repo_root / raw)
    try:
        dest_parent = candidate.resolve()
        dest_parent.relative_to(cfg.repo_root.resolve())
    except (OSError, ValueError):
        raise HTTPException(400, "dest_dir must be within the repo")
    if not dest_parent.exists() or not dest_parent.is_dir():
        raise HTTPException(404, f"dest_dir not found: {dest_parent}")

    dest = dest_parent / f"{dest_name}.csv"
    if dest.exists() and not overwrite:
        raise HTTPException(409, f"destination already exists: {dest.name}")
    dest.write_bytes(data)
    rel = dest.resolve().relative_to(cfg.repo_root.resolve())
    return {"csv": str(rel), "motion": dest_name, "path": str(dest)}


# ---- Build endpoints (plugin) ----


def _require_build_manager():
    from viewer.server.plugins import get_build_manager
    mgr = get_build_manager()
    if mgr is None:
        raise HTTPException(503, "build plugin not configured")
    return mgr


@app.post("/api/build")
def api_build_start() -> dict:
    mgr = _require_build_manager()
    cat = _get_catalog()
    try:
        job = mgr.start(cat)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"id": job.id, "status": job.status}


@app.get("/api/build/status")
def api_build_status() -> dict:
    from viewer.server.plugins import get_build_manager
    mgr = get_build_manager()
    if mgr is None:
        return {"status": "idle", "plugin": "unavailable"}
    j = mgr.current()
    if j is None:
        return {"status": "idle"}
    return {"id": j.id, "status": j.status, "error": j.error}


@app.get("/api/build/{job_id}/stream")
def api_build_stream(job_id: str) -> StreamingResponse:
    mgr = _require_build_manager()
    j = mgr.current()
    if j is None or j.id != job_id:
        raise HTTPException(404, "job not found")

    def gen():
        import queue as _q
        while True:
            try:
                line = j.log_queue.get(timeout=1.0)
                yield f"data: {line}\n\n"
            except _q.Empty:
                if j.status in ("success", "error"):
                    yield f"event: done\ndata: {j.status}\n\n"
                    return
    return StreamingResponse(gen(), media_type="text/event-stream")


class PreviewReq(BaseModel):
    csv: str  # repo-relative path, e.g. "motions/x.csv"
    adjustments: dict = {}


@app.get("/api/presets")
def api_get_presets() -> dict:
    return load_presets(get_config().presets_path)


class PresetReq(BaseModel):
    adjustments: dict[str, Any]


@app.put("/api/presets/{name}")
def api_put_preset(name: str, body: PresetReq) -> dict:
    try:
        save_preset(get_config().presets_path, name, body.adjustments)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"name": name, "adjustments": body.adjustments}


@app.delete("/api/presets/{name}", status_code=204)
def api_delete_preset(name: str) -> Response:
    if not delete_preset(get_config().presets_path, name):
        raise HTTPException(404, f"preset not found: {name}")
    return Response(status_code=204)


@app.post("/api/motions/preview")
def api_preview(body: PreviewReq) -> Response:
    import csv as _csv
    import io
    cfg = get_config()
    src = cfg.repo_root / body.csv
    if not src.exists():
        raise HTTPException(404, "csv not found")
    with open(src, newline="") as f:
        reader = _csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    if body.adjustments:
        from viewer.server.adjustments import apply_adjustments
        try:
            rows = apply_adjustments(rows, fieldnames, body.adjustments, fps=cfg.input_fps)
        except ValueError as e:
            raise HTTPException(400, str(e))
    buf = io.StringIO()
    w = _csv.DictWriter(buf, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)
    return Response(content=buf.getvalue(), media_type="text/csv")

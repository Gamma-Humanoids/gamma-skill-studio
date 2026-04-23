"""ProtoMotions build plugin: catalog -> adjusted CSVs -> .motion -> .pt library.

This plugin wraps the ProtoMotions ``convert_g1_csv_to_proto.py`` converter and
``protomotions.components.motion_lib`` compiler. It is enabled when
``config.yaml`` provides a valid ``build.protomotions_dir``.

BuildManager serializes runs via a mutex and streams logs through a queue
suitable for SSE consumption.
"""
from __future__ import annotations

import csv
import queue
import subprocess
import tempfile
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml

from viewer.server.adjustments import apply_adjustments
from viewer.server.catalog import Catalog, Entry
from viewer.server.config import get_config


def _paths():
    """Resolve plugin paths from the current config. Recomputed on each call
    so tests that override the config via env vars see the update.
    """
    cfg = get_config()
    proto_dir = cfg.protomotions_dir  # may be None
    out_dir = cfg.build_output_dir
    return {
        "repo_root": cfg.repo_root,
        "protomotions_dir": proto_dir,
        "output_dir": out_dir,
        "proto_dir": out_dir / "proto",
        "compiled_pt": out_dir / cfg.build_compiled_name,
        "motion_config": out_dir / "motion_config.yaml",
    }


def write_motion_config(cat: Catalog, out: Path) -> None:
    """Write motion_config.yaml with one entry per included catalog entry."""
    motions = [
        {"file": f"proto/{e.motion}.motion", "weight": 1.0}
        for e in cat.entries
        if e.include
    ]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(yaml.safe_dump({"motions": motions}, sort_keys=False))


def _read_target_yaw(cat: Catalog) -> Optional[float]:
    ref = cat.build.yaw_reference
    if not ref:
        return None
    repo_root = _paths()["repo_root"]
    for e in cat.entries:
        if e.motion == ref:
            csv_path = repo_root / e.csv
            if not csv_path.exists():
                return None
            with csv_path.open("r", encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    return float(row["root_rotateZ"])
            return None
    return None


def _apply_one(
    entry: Entry,
    fps: int,
    target_yaw: Optional[float],
    out_dir: Path,
) -> None:
    repo_root = _paths()["repo_root"]
    src = repo_root / entry.csv
    with src.open("r", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    rows = apply_adjustments(
        rows, list(fieldnames), entry.adjustments, fps=fps, target_yaw=target_yaw
    )

    dst = out_dir / Path(entry.csv).name
    with dst.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


@dataclass
class BuildJob:
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    log_queue: "queue.Queue[str]" = field(default_factory=queue.Queue)
    status: str = "pending"  # pending | running | success | error
    error: Optional[str] = None

    def log(self, line: str) -> None:
        self.log_queue.put(line)


def _run_subprocess(cmd, *, cwd, env, job: BuildJob) -> None:
    job.log(f"$ {' '.join(str(c) for c in cmd)}")
    p = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert p.stdout is not None
    for line in p.stdout:
        job.log(line.rstrip())
    rc = p.wait()
    if rc != 0:
        raise RuntimeError(f"{cmd[0]} exited with {rc}")


def run_build(cat: Catalog, job: BuildJob, *, env: Optional[dict] = None) -> None:
    job.status = "running"
    paths = _paths()
    protomotions_dir = paths["protomotions_dir"]
    proto_dir = paths["proto_dir"]
    compiled_pt = paths["compiled_pt"]
    motion_config = paths["motion_config"]
    try:
        if protomotions_dir is None:
            raise RuntimeError("protomotions_dir is not configured")

        job.log("resolving target yaw")
        target_yaw = _read_target_yaw(cat)
        job.log(f"target_yaw = {target_yaw}")

        with tempfile.TemporaryDirectory(prefix="motion_build_") as tmp:
            tmp_path = Path(tmp)
            job.log(f"applying adjustments to included entries into {tmp_path}")
            included = [e for e in cat.entries if e.include]
            for e in included:
                job.log(f"  adjust {e.name} ({e.csv})")
                _apply_one(e, cat.build.input_fps, target_yaw, tmp_path)

            proto_dir.mkdir(parents=True, exist_ok=True)
            convert_cmd = [
                "python3",
                "data/scripts/convert_g1_csv_to_proto.py",
                "--input-dir", str(tmp_path),
                "--output-dir", str(proto_dir),
                "--input-fps", str(cat.build.input_fps),
                "--output-fps", str(cat.build.output_fps),
                "--robot-type", "g1",
                "--force-remake",
            ]
            job.log("converting CSV -> .motion")
            _run_subprocess(convert_cmd, cwd=protomotions_dir, env=env, job=job)

        job.log(f"writing {motion_config}")
        write_motion_config(cat, motion_config)

        compiled_pt.parent.mkdir(parents=True, exist_ok=True)
        compile_cmd = [
            "python3", "-m", "protomotions.components.motion_lib",
            "--motion-path", str(motion_config),
            "--output-file", str(compiled_pt),
            "--device", "cpu",
        ]
        job.log("compiling motion library")
        _run_subprocess(compile_cmd, cwd=protomotions_dir, env=env, job=job)

        job.status = "success"
        job.log("build complete")
    except Exception as exc:
        job.status = "error"
        job.error = str(exc)
        job.log(f"ERROR: {exc}")


class BuildManager:
    def __init__(self) -> None:
        self._current: Optional[BuildJob] = None
        self._lock = threading.Lock()

    def start(self, cat: Catalog, env: Optional[dict] = None) -> BuildJob:
        with self._lock:
            if self._current and self._current.status == "running":
                raise RuntimeError("build already in progress")
            job = BuildJob()
            self._current = job
            threading.Thread(
                target=run_build, args=(cat, job), kwargs={"env": env}, daemon=True
            ).start()
            return job

    def current(self) -> Optional[BuildJob]:
        return self._current


BUILD_MANAGER = BuildManager()

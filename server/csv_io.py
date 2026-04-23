from __future__ import annotations

from pathlib import Path


def parse_info(path: Path) -> dict:
    """Return {"frames": int, "fps": 120, "duration_s": float, "columns": list[str]}.

    frames = number of data rows (excluding header).
    Streams line-by-line; does not load the full file into memory.
    """
    fps = 120
    columns: list[str] = []
    frames = 0

    with path.open("r", encoding="utf-8") as fh:
        header = fh.readline()
        columns = [c.strip() for c in header.split(",")]
        for _ in fh:
            frames += 1

    duration_s = frames / fps
    return {"frames": frames, "fps": fps, "duration_s": duration_s, "columns": columns}

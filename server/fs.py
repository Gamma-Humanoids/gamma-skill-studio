from pathlib import Path
from typing import TypedDict


class FsEntry(TypedDict):
    name: str
    path: str
    is_dir: bool
    size: int


def list_dir(path: Path) -> list[FsEntry]:
    if not path.exists():
        raise FileNotFoundError(str(path))
    if not path.is_dir():
        raise NotADirectoryError(str(path))
    out: list[FsEntry] = []
    for p in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        if p.name.startswith("."):
            continue
        try:
            stat = p.stat()
            out.append({
                "name": p.name,
                "path": str(p.resolve()),
                "is_dir": p.is_dir(),
                "size": stat.st_size if p.is_file() else 0,
            })
        except OSError:
            # broken symlink or permission issue — skip
            continue
    return out

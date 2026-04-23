"""Pydantic schema + YAML loader for config/skill_catalog.yaml."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Literal, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator


_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")

Kind = Literal["gesture", "skill", "locomotion"]


class BuildSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_fps: int = 120
    output_fps: int = 30
    yaw_reference: Optional[str] = None


class Entry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    motion: str
    csv: str
    kind: Kind
    duration: Optional[float] = Field(default=None, gt=0)
    idle: bool = False
    include: bool = True
    adjustments: dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        if not _NAME_RE.match(v):
            raise ValueError(
                f"Entry.name must be alphanumeric + underscores, got {v!r}"
            )
        return v


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    build: BuildSettings = Field(default_factory=BuildSettings)
    entries: list[Entry] = Field(default_factory=list)

    def by_name(self, name: str) -> Optional[Entry]:
        for e in self.entries:
            if e.name == name:
                return e
        return None

    def included_entries(self) -> list[Entry]:
        return [e for e in self.entries if e.include]

    def validate_unique_names(self) -> None:
        seen: set[str] = set()
        dupes: list[str] = []
        for e in self.entries:
            if e.name in seen:
                dupes.append(e.name)
            seen.add(e.name)
        if dupes:
            raise ValueError(f"duplicate entry names: {sorted(set(dupes))}")


def load_catalog(path: str | Path) -> Catalog:
    raw = yaml.safe_load(Path(path).read_text()) or {}
    return Catalog.model_validate(raw)


def _entry_to_clean_dict(entry: Entry) -> dict[str, Any]:
    d: dict[str, Any] = {
        "name": entry.name,
        "motion": entry.motion,
        "csv": entry.csv,
        "kind": entry.kind,
    }
    if entry.duration is not None:
        d["duration"] = entry.duration
    if entry.idle:  # default False -> omit
        d["idle"] = True
    if not entry.include:  # default True -> omit
        d["include"] = False
    if entry.adjustments:  # empty -> omit
        d["adjustments"] = dict(entry.adjustments)
    return d


def save_catalog(catalog: Catalog, path: str | Path) -> None:
    data: dict[str, Any] = {
        "build": catalog.build.model_dump(),
        "entries": [_entry_to_clean_dict(e) for e in catalog.entries],
    }
    Path(path).write_text(
        yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    )

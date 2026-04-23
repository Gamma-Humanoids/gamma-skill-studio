from __future__ import annotations

from pathlib import Path

import pytest

from viewer.server.editor import EditError, run_edit


def _frame_count(path: Path) -> int:
    count = 0
    with path.open() as fh:
        fh.readline()  # skip header
        for _ in fh:
            count += 1
    return count


@pytest.fixture()
def tmp_dest(tmp_path):
    created: list[Path] = []

    def _make(name: str) -> Path:
        p = tmp_path / name
        created.append(p)
        return p

    yield _make
    for p in created:
        if p.exists():
            p.unlink()


def test_trim_produces_shorter_clip(sample_csv, tmp_dest):
    n = _frame_count(sample_csv)
    dest = tmp_dest("trim_test.csv")
    out = run_edit(sample_csv, "trim", {"start": 0.5, "end": 0.0}, dest)
    assert out.exists()
    result_frames = _frame_count(out)
    assert abs(result_frames - (n - 60)) <= 1


def test_cut_produces_shorter_clip(sample_csv, tmp_dest):
    n = _frame_count(sample_csv)
    dest = tmp_dest("cut_test.csv")
    out = run_edit(sample_csv, "cut", {"from_": 0.5, "to": 1.0}, dest)
    assert out.exists()
    result_frames = _frame_count(out)
    assert abs(result_frames - (n - 60)) <= 1


def test_speed_half_doubles_frames(sample_csv, tmp_dest):
    n = _frame_count(sample_csv)
    dest = tmp_dest("speed_test.csv")
    out = run_edit(sample_csv, "speed", {"factor": 0.5}, dest)
    assert out.exists()
    result_frames = _frame_count(out)
    assert result_frames > 1.5 * n


def test_bad_op_raises(sample_csv, tmp_dest):
    with pytest.raises(EditError):
        run_edit(sample_csv, "plot", {}, tmp_dest("should_not_exist.csv"))


def test_missing_source_raises(tmp_path, tmp_dest):
    with pytest.raises(EditError):
        run_edit(tmp_path / "nonexistent.csv", "trim", {"start": 0.5, "end": 0.0}, tmp_dest("out.csv"))


def test_speed_factor_out_of_range(sample_csv, tmp_dest):
    with pytest.raises(EditError):
        run_edit(sample_csv, "speed", {"factor": 100}, tmp_dest("out_speed.csv"))

from __future__ import annotations

from viewer.server.csv_io import parse_info


def test_parse_info(sample_csv) -> None:
    info = parse_info(sample_csv)

    assert info["fps"] == 120
    assert info["frames"] == 240
    assert info["columns"][0] == "Frame"
    assert info["columns"][-1].endswith("_dof")
    assert info["duration_s"] == info["frames"] / 120

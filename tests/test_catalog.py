from pathlib import Path
import textwrap
import pytest
import yaml

from viewer.server.catalog import (
    Catalog,
    Entry,
    BuildSettings,
    load_catalog,
    save_catalog,
)


def test_catalog_roundtrip(tmp_path: Path):
    yaml_text = textwrap.dedent("""
        build:
          input_fps: 120
          output_fps: 30
          yaw_reference: ref_clip
        entries:
          - name: breathing
            motion: ref_clip
            csv: motions/ref_clip.csv
            kind: gesture
            duration: 5.0
            idle: true
            adjustments:
              waist_pitch_joint_dof: -10.0
          - name: talk
            motion: talk_clip
            csv: motions/talk_clip.csv
            kind: gesture
            duration: 5.0
            adjustments:
              trim_start_frames: 50
              align_yaw: true
    """).strip()
    path = tmp_path / "skill_catalog.yaml"
    path.write_text(yaml_text)

    cat = load_catalog(path)
    assert cat.build.input_fps == 120
    assert cat.build.output_fps == 30
    assert cat.build.yaw_reference == "ref_clip"
    assert len(cat.entries) == 2
    assert cat.entries[0].idle is True
    assert cat.entries[0].include is True  # default
    assert cat.entries[1].idle is False  # default
    assert cat.entries[1].adjustments["align_yaw"] is True

    out = tmp_path / "out.yaml"
    save_catalog(cat, out)
    assert load_catalog(out) == cat


def test_catalog_rejects_duplicate_names(tmp_path: Path):
    path = tmp_path / "cat.yaml"
    path.write_text(textwrap.dedent("""
        entries:
          - {name: a, motion: m1, csv: motions/a.csv, kind: gesture, duration: 5.0}
          - {name: a, motion: m2, csv: motions/a.csv, kind: skill, duration: 5.0}
    """))
    cat = load_catalog(path)
    with pytest.raises(ValueError, match="duplicate"):
        cat.validate_unique_names()


def test_catalog_rejects_bad_kind(tmp_path: Path):
    path = tmp_path / "cat.yaml"
    path.write_text("entries:\n  - {name: a, motion: m, csv: s/a.csv, kind: dance, duration: 5.0}\n")
    with pytest.raises(Exception):
        load_catalog(path)


def test_entry_rejects_bad_name():
    with pytest.raises(Exception):
        Entry(name="bad name!", motion="m", csv="s/a.csv", kind="gesture", duration=5.0)
    with pytest.raises(Exception):
        Entry(name="bad-name", motion="m", csv="s/a.csv", kind="gesture", duration=5.0)


def test_entry_accepts_valid_names():
    e = Entry(name="good_name_123", motion="m", csv="s/a.csv", kind="gesture", duration=5.0)
    assert e.name == "good_name_123"


def test_included_entries_filters_out_excluded(tmp_path: Path):
    path = tmp_path / "cat.yaml"
    path.write_text(textwrap.dedent("""
        entries:
          - {name: a, motion: m, csv: s/a.csv, kind: gesture, duration: 5.0}
          - {name: b, motion: m, csv: s/b.csv, kind: skill, duration: 5.0, include: false}
    """))
    cat = load_catalog(path)
    names = [e.name for e in cat.included_entries()]
    assert names == ["a"]


def test_by_name(tmp_path: Path):
    path = tmp_path / "cat.yaml"
    path.write_text(textwrap.dedent("""
        entries:
          - {name: a, motion: m, csv: s/a.csv, kind: gesture, duration: 5.0}
          - {name: b, motion: m, csv: s/b.csv, kind: skill, duration: 5.0}
    """))
    cat = load_catalog(path)
    assert cat.by_name("a").name == "a"
    assert cat.by_name("b").kind == "skill"
    assert cat.by_name("missing") is None


def test_save_omits_defaults(tmp_path: Path):
    cat = Catalog(
        entries=[
            Entry(name="a", motion="m", csv="s/a.csv", kind="gesture", duration=5.0),
            Entry(
                name="b",
                motion="m",
                csv="s/b.csv",
                kind="skill",
                duration=5.0,
                idle=True,
                include=False,
                adjustments={"trim_start_frames": 10},
            ),
        ]
    )
    out = tmp_path / "out.yaml"
    save_catalog(cat, out)
    data = yaml.safe_load(out.read_text())
    e0 = data["entries"][0]
    # defaults omitted
    assert "include" not in e0
    assert "idle" not in e0
    assert "adjustments" not in e0
    e1 = data["entries"][1]
    assert e1["idle"] is True
    assert e1["include"] is False
    assert e1["adjustments"] == {"trim_start_frames": 10}

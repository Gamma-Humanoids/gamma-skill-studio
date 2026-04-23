import pytest
from viewer.server.adjustments import (
    apply_adjustments, trim, cut, speed, align_yaw_rows, joint_offset,
    stabilize,
    ROOT_X, ROOT_Y, ROOT_YAW,
)

FIELDS = ["Frame", ROOT_X, ROOT_Y, ROOT_YAW, "waist_pitch_joint_dof"]


def make_rows(n, fields=FIELDS):
    return [{f: "0.0" if f != "Frame" else str(i) for f in fields} for i in range(n)]


def test_trim_start_frames():
    out = trim(make_rows(100), start_frames=10)
    assert len(out) == 90 and out[0]["Frame"] == "0"


def test_trim_end_frames():
    out = trim(make_rows(100), end_frames=5)
    assert len(out) == 95


def test_trim_raises_when_all_removed():
    with pytest.raises(ValueError):
        trim(make_rows(10), start_frames=5, end_frames=5)


def test_cut_segment():
    out = cut(make_rows(240), cut_from=0.5, cut_to=1.0, fps=120)
    assert len(out) == 180


def test_cut_raises_invalid_bounds():
    with pytest.raises(ValueError):
        cut(make_rows(240), cut_from=1.0, cut_to=0.5)


def test_speed_halves_frames():
    assert len(speed(make_rows(120), factor=2.0, fps=120)) == 60


def test_speed_doubles_frames():
    assert len(speed(make_rows(60), factor=0.5, fps=120)) == 120


def test_speed_raises_on_nonpositive():
    with pytest.raises(ValueError):
        speed(make_rows(10), factor=0.0)


def test_joint_offset_adds_degrees():
    rows = make_rows(3)
    for r in rows:
        r["waist_pitch_joint_dof"] = "5.0"
    joint_offset(rows, {"waist_pitch_joint_dof": -3.0})
    assert float(rows[0]["waist_pitch_joint_dof"]) == pytest.approx(2.0)


def test_joint_offset_unknown_column_raises():
    with pytest.raises(ValueError):
        joint_offset(make_rows(3), {"not_a_column": 1.0})


def test_align_yaw_target_zero():
    rows = make_rows(5)
    for i, r in enumerate(rows):
        r[ROOT_YAW] = "45.0"
        r[ROOT_X] = str(float(i))
        r[ROOT_Y] = "0.0"
    align_yaw_rows(rows, target_yaw=0.0)
    assert float(rows[0][ROOT_YAW]) == pytest.approx(0.0, abs=1e-3)
    assert float(rows[-1][ROOT_YAW]) == pytest.approx(0.0, abs=1e-3)


def test_apply_pipeline_keep_frames_then_trim_start():
    rows = make_rows(500)
    out = apply_adjustments(rows, FIELDS, {"trim_start_frames": 10, "keep_frames": 100}, fps=120)
    assert len(out) == 90


def test_apply_pipeline_order():
    rows = make_rows(240)
    adj = {"trim_start_frames": 10, "cut_from": 0.5, "cut_to": 1.0, "speed": 1.0}
    out = apply_adjustments(rows, FIELDS, adj, fps=120)
    assert len(out) == 170


def test_apply_pipeline_applies_joint_offset_after_resample():
    rows = make_rows(120)
    for r in rows:
        r["waist_pitch_joint_dof"] = "0.0"
    out = apply_adjustments(
        rows, FIELDS,
        {"speed": 2.0, "waist_pitch_joint_dof": -10.0},
        fps=120,
    )
    assert len(out) == 60
    assert float(out[0]["waist_pitch_joint_dof"]) == pytest.approx(-10.0, abs=1e-3)


def test_align_yaw_skipped_without_target():
    rows = make_rows(3)
    for r in rows:
        r[ROOT_YAW] = "45.0"
    apply_adjustments(rows, FIELDS, {"align_yaw": True}, fps=120, target_yaw=None)
    assert float(rows[0][ROOT_YAW]) == pytest.approx(45.0)


def test_stabilize_appends_hold_frames():
    rows = make_rows(10)
    rows[-1]["waist_pitch_joint_dof"] = "5.0"
    out = stabilize(rows, hold_frames=30)
    assert len(out) == 40
    # Frame numbers renumbered 0..N-1
    assert [r["Frame"] for r in out[-3:]] == ["37", "38", "39"]
    # Appended frames copy the original last frame
    last_orig = rows[-1]
    for r in out[10:]:
        for k in last_orig:
            if k == "Frame":
                continue
            assert r[k] == last_orig[k]


def test_stabilize_zero_hold_is_noop():
    rows = make_rows(10)
    out = stabilize(rows, hold_frames=0)
    assert len(out) == 10
    assert out[-1]["Frame"] == "9"


def test_stabilize_ease_decelerates_smoothly():
    rows = make_rows(5)
    # Last frame differs from second-to-last so there's a "velocity" to kill
    rows[-1]["waist_pitch_joint_dof"] = "10.0"
    rows[-2]["waist_pitch_joint_dof"] = "8.0"
    out = stabilize(rows, hold_frames=10, ease_frames=4)
    # Ease frames monotonically approach last value
    vals = [float(r["waist_pitch_joint_dof"]) for r in out[5:9]]
    assert all(abs(v - 10.0) <= abs(vals[i-1] - 10.0) + 1e-9 for i, v in enumerate(vals) if i > 0)
    # Hold region equals last value exactly
    for r in out[9:]:
        assert float(r["waist_pitch_joint_dof"]) == pytest.approx(10.0)


def test_stabilize_negative_raises():
    with pytest.raises(ValueError):
        stabilize(make_rows(5), hold_frames=-1)


def test_apply_adjustments_stabilize_frames():
    rows = make_rows(20)
    out = apply_adjustments(rows, FIELDS, {"stabilize_frames": 30}, fps=120)
    assert len(out) == 50


def test_apply_adjustments_stabilize_after_trim():
    rows = make_rows(100)
    out = apply_adjustments(
        rows, FIELDS,
        {"trim_end_frames": 10, "stabilize_frames": 20},
        fps=120,
    )
    # 100 - 10 + 20 = 110
    assert len(out) == 110

#!/usr/bin/env python3
"""Regenerate motions/sample_wave.csv — a synthetic 2-DOF sine-wave clip.

Zero external dependencies. Matches the joint names in
assets/simple_2dof/simple_2dof.urdf (shoulder, elbow).
"""
from __future__ import annotations

import math
from pathlib import Path

FPS = 120
DURATION_S = 2.0
N_FRAMES = int(FPS * DURATION_S)

FIELDS = [
    "Frame",
    "root_translateX", "root_translateY", "root_translateZ",
    "root_rotateX", "root_rotateY", "root_rotateZ",
    "shoulder", "elbow",
]


def main() -> None:
    out = Path(__file__).resolve().parent.parent / "motions" / "sample_wave.csv"
    out.parent.mkdir(parents=True, exist_ok=True)

    lines = [",".join(FIELDS)]
    for i in range(N_FRAMES):
        t = i / FPS
        shoulder = 30.0 * math.sin(2 * math.pi * t)
        elbow = 45.0 * math.sin(4 * math.pi * t + math.pi / 4)
        row = [
            str(i),
            "0", "0", "0",
            "0", "0", "0",
            f"{shoulder:.6f}",
            f"{elbow:.6f}",
        ]
        lines.append(",".join(row))

    out.write_text("\n".join(lines) + "\n")
    print(f"wrote {out} ({N_FRAMES} frames @ {FPS} FPS)")


if __name__ == "__main__":
    main()

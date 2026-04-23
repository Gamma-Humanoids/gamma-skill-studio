# Changelog

All notable changes to this project will be documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-23

Initial public release by Gamma Lab.

### Added
- URDF-agnostic FK preview in the browser (Three.js + urdf-loaders).
- In-browser motion clip editor: trim, cut, speed, align-yaw, per-joint offsets.
- Pydantic-validated skill catalog with CRUD API and YAML persistence.
- Adjustment presets with save / delete endpoints.
- Async build pipeline with SSE live-log streaming.
- Optional ProtoMotions compile plugin (`server/plugins/protomotions_build.py`).
- Self-contained sample: synthetic 2-DOF URDF + sine-wave motion CSV.
- Config-driven paths via `config.yaml` and `GAMMA_STUDIO_ROOT` env var.
- `scripts/fetch_g1_urdf.sh` to pull the reference Unitree G1 URDF.
- Test suite with 87+ pytest cases.
- Apache-2.0 License.

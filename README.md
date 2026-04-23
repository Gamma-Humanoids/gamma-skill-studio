<h1 align="center">Gamma Skill Studio</h1>

<p align="center">
  Preview any URDF. Edit motion clips in the browser. Manage a skill catalog.<br>
  Compile reproducible motion libraries &mdash; all in one place.
</p>

<p align="center">
  <a href="https://github.com/Gamma-Humanoids/gamma-skill-studio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Gamma-Humanoids/gamma-skill-studio/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <img alt="Python" src="https://img.shields.io/badge/python-3.10%2B-blue">
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-orange">
</p>

<p align="center">
  <em>The open-source authoring studio behind the <strong>Gamma Skill Studio</strong> platform &mdash;<br>
  an embodiment-agnostic, no-code behavior OS for humanoid fleets, delivered as RaaS.</em>
</p>

<p align="center">
  <em>Built by <a href="https://gammalab.ae/Home">Gamma Lab</a> &mdash; humanoid-motion R&amp;D, based in the UAE.</em>
</p>

---

## The bigger picture &mdash; Gamma Skill Studio platform

This repository is the **open-source authoring studio**: the slice of the
stack where humans design, preview, and compile reusable motion skills. It is
the front door to the broader **Gamma Skill Studio** platform &mdash; an
embodiment-agnostic, no-code behavior OS for humanoid fleets, delivered as
**Robotics-as-a-Service (RaaS)**.

We replace weeks of integrator work with a curated, customizable library of
domain-certified skills across **hospitality, retail, and light manufacturing**.
Non-technical product managers activate, edit, and compose their own skills via
chat and drag-and-drop. Every skill ships pre-validated to **HSE, GxP, HACCP,
and RTA** standards, runs cross-embodiment on **Unitree, LIMX** and more, under
a **fixed-SLA uptime contract**.

### How the platform works

- **Authoring.** Operator intent is parsed by
  [NVIDIA NeMo Agent Toolkit](https://developer.nvidia.com/nemo-agent-toolkit)
  and compiled into a behavior-tree DSL. Determinism is enforced at compile time
  &mdash; **no LLM at runtime**. Grounded by Cosmos Reason2 (2B / 8B).
- **Simulation.** [Isaac Sim](https://developer.nvidia.com/isaac/sim) digital
  twins built from BIM / LiDAR; training trajectories generated with
  Cosmos Predict 2.5.
- **Safety.** Validation in
  [Isaac Lab &mdash; Arena](https://developer.nvidia.com/isaac/lab) (Libero,
  RoboCasa, domain suites), mapped to **ISO 10218, ISO/TS 15066, ANSI R15.08**.
  A hard-coded envelope (speed, force, keep-out zones) wraps every policy at
  runtime.
- **Post-training.** [GR00T N1.7](https://developer.nvidia.com/isaac/gr00t)
  post-trained on 20&ndash;40 demos plus synthetic data, then stress-tested
  against Cosmos Predict 2.5 world-model twins before release gating.
- **Deployment.** ONNX / TensorRT; **Jetson AGX Thor / T4000** at **FP4**,
  **sub-100 ms** policy step. OSMO for OTA, canary, and rollback.

The full platform adds the agent toolkit, cross-embodiment runtime, safety
envelope, fleet deployment, and SLA guarantees. Reach out via
[gammalab.ae](https://gammalab.ae/Home) if you are interested in the managed
service.

## Highlights

- 🦾 **URDF-agnostic FK preview** &mdash; drop in any URDF, visualize any humanoid
  (or simpler robot) in the browser via [Three.js](https://threejs.org/) and
  [urdf-loaders](https://github.com/gkjohnson/urdf-loaders).
- ✂️ **In-browser clip editor** &mdash; trim, cut, re-speed, realign yaw,
  per-joint offsets. Pure-Python backend, 87+ pytest cases covering the
  transforms.
- 📚 **Skill catalog with presets** &mdash; Pydantic-validated YAML, live CRUD in
  the UI, reusable adjustment presets across clips.
- 🏗️ **Reproducible builds** &mdash; async pipeline with live log streaming over
  Server-Sent Events. Optional [NVIDIA ProtoMotions](https://github.com/NVlabs/ProtoMotions)
  plugin turns CSVs into a compiled `.pt` motion library.
- 🔌 **Plugin-based compile step** &mdash; bring your own backend if you don't use
  ProtoMotions; the rest of the studio stays backend-agnostic.
- 🧪 **Tested by design** &mdash; transforms are pure functions, state is explicit,
  zero hidden globals.

## Quickstart (60 seconds, zero external data)

```bash
git clone git@github.com:Gamma-Humanoids/gamma-skill-studio.git
cd gamma-skill-studio
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./run.sh
```

Open <http://127.0.0.1:8766/>.

Gamma Skill Studio ships a synthetic 2-DOF robot and a sample sine-wave clip, so the
app runs out of the box without downloading anything. Once it is up, head to
the **Library** tab to see the catalog, or **Preview** to scrub the sample
motion.

## Use your own robot

1. Point `urdf_path` and `meshes_dir` in `config.yaml` at your robot's URDF
   and mesh directory. Any URDF that `urdf-loaders` can parse will work.
2. Drop your motion CSVs into `motions/` (see [CSV format](#csv-format) below).
3. Register them as entries in `config/skill_catalog.yaml` &mdash; or edit the
   catalog from the **Library** tab UI.
4. Reload the page.

### Fetch the reference Unitree G1 URDF (optional)

```bash
scripts/fetch_g1_urdf.sh
```

Clones the public Unitree G1 URDF + meshes from
[`unitreerobotics/unitree_rl_gym`](https://github.com/unitreerobotics/unitree_rl_gym)
(BSD-3) into `assets/g1/`. Then point `config.yaml` at the fetched URDF.

## CSV format

Motion clips are plain CSVs with one row per frame:

| column | type | notes |
|---|---|---|
| `Frame` | int | monotonically increasing, 0-based |
| `root_translateX`, `root_translateY`, `root_translateZ` | float | root position |
| `root_rotateX`, `root_rotateY`, `root_rotateZ` | float | root orientation, degrees (Euler XYZ) |
| `<joint_name>` | float | one column per joint DOF, degrees |

Default sampling rate is **120 FPS**, configurable in `config.yaml` via
`input_fps`. Joint column names must match joint names in your URDF.

## Architecture

```
┌────────────────────────────────────────────┐     ┌────────────────────────┐
│  Browser                                   │     │  FastAPI (server/)     │
│  ─ Three.js + urdf-loaders (FK preview)    │◄───►│  ─ catalog CRUD        │
│  ─ Timeline, edit panel, library manager   │ HTTP│  ─ CSV transforms      │
│  ─ SSE build log stream                    │  SSE│  ─ filesystem picker   │
└────────────────────────────────────────────┘     │  ─ build orchestrator  │
                                                   └───────────┬────────────┘
                                                               │
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │ Optional build plugin  │
                                                   │ server/plugins/        │
                                                   │  protomotions_build.py │
                                                   └────────────────────────┘
```

Key modules:

- [`server/app.py`](server/app.py) &mdash; FastAPI routes
- [`server/adjustments.py`](server/adjustments.py) &mdash; pure motion transforms (trim / cut / speed / align_yaw / per-joint offsets)
- [`server/catalog.py`](server/catalog.py) &mdash; Pydantic schema + YAML I/O for the skill catalog
- [`server/config.py`](server/config.py) &mdash; config.yaml loader
- [`server/plugins/protomotions_build.py`](server/plugins/protomotions_build.py) &mdash; optional ProtoMotions compile plugin

## Optional: ProtoMotions build plugin

If you want to compile your catalog into the
[ProtoMotions](https://github.com/NVlabs/ProtoMotions) motion-library format
(a common input for mimic / tracking policies), clone the ProtoMotions repo and
point `config.yaml` at it:

```yaml
build:
  protomotions_dir: /path/to/ProtoMotions
```

With the plugin enabled, the **Library → Rebuild** button in the UI runs:

1. Apply catalog adjustments to each CSV.
2. Convert `.csv → .motion` via ProtoMotions' retargeting scripts.
3. Compile `.motion` files into a single `.pt` motion library.

Logs stream live to the UI over SSE.

Without the plugin, Gamma Skill Studio still works as a full-featured viewer,
editor, and catalog manager &mdash; the build tab just stays greyed out.

## Roadmap

- [ ] Motion blending / transitions between catalog entries
- [ ] DOF statistics and range-of-motion analytics
- [ ] Tag-based catalog search and filtering
- [ ] Public plugin API for non-ProtoMotions compile backends
- [ ] Collaborative preset sync across team members

Community PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## About Gamma Lab

[Gamma Lab](https://gammalab.ae/Home) is a humanoid-motion research lab based
in the UAE, focused on motion intelligence, teleoperation, and sim-to-real
transfer for whole-body control. We open-source the tooling behind our
internal pipelines when it is useful to the wider robotics community.

## License

Apache License 2.0 &mdash; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

## Acknowledgements

- NVIDIA Research's [ProtoMotions](https://github.com/NVlabs/ProtoMotions) team
  for the motion-library format and retargeting scripts.
- [@gkjohnson](https://github.com/gkjohnson) for the excellent
  [urdf-loaders](https://github.com/gkjohnson/urdf-loaders) library.
- [Unitree Robotics](https://github.com/unitreerobotics) for publishing the
  G1 URDF and meshes under permissive terms.

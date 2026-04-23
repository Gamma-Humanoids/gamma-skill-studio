#!/usr/bin/env bash
# Fetch the reference Unitree G1 URDF + meshes from the public unitree_rl_gym
# repo into assets/g1/. After running, point config.yaml at:
#
#   urdf_path: assets/g1/urdf/g1_29dof_rev_1_0.urdf
#   meshes_dir: assets/g1/meshes
#
# Source: https://github.com/unitreerobotics/unitree_rl_gym  (BSD-3-Clause)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$REPO_ROOT/assets/g1"

if [[ -e "$TARGET" ]]; then
    echo "error: $TARGET already exists. Remove it and re-run." >&2
    exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Cloning unitreerobotics/unitree_rl_gym (sparse) into $TMP ..."
git clone --depth 1 --filter=blob:none --sparse \
    https://github.com/unitreerobotics/unitree_rl_gym.git "$TMP/repo"

(
    cd "$TMP/repo"
    git sparse-checkout set resources/robots/g1_description
)

SRC="$TMP/repo/resources/robots/g1_description"
if [[ ! -d "$SRC" ]]; then
    echo "error: expected G1 assets not found at $SRC" >&2
    exit 1
fi

mkdir -p "$TARGET"
cp -R "$SRC/." "$TARGET/"

echo
echo "Done. Fetched G1 assets to: $TARGET"
echo
echo "Next step: edit config.yaml to point at the new URDF, e.g.:"
echo "  urdf_path: assets/g1/<pick-a-urdf>.urdf"
echo "  meshes_dir: assets/g1/meshes"
echo
echo "License: BSD-3-Clause (Unitree Robotics). See LICENSE files under $TARGET."

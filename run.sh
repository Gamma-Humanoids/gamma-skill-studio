#!/usr/bin/env bash
# Gamma Skill Studio — launch the FastAPI viewer with auto-reload.
# Licensed under the Apache License 2.0.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
export PYTHONPATH="${HERE}${PYTHONPATH:+:${PYTHONPATH}}"
# Register 'viewer' namespace alias (historical package name) via -c preamble.
python3 -c "
import sys, types
from pathlib import Path
root = '${HERE}'
sys.path.insert(0, root)
viewer = types.ModuleType('viewer'); viewer.__path__ = [root]
sys.modules['viewer'] = viewer
import uvicorn
uvicorn.run('viewer.server.app:app', host='127.0.0.1', port=8766, reload=True)
"

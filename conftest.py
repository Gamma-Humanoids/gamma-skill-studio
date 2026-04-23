"""Root conftest — set up the ``viewer`` namespace alias for the test suite.

The Python package is still imported as ``viewer.server.*`` (historical name)
even though the repository is called ``gamma-skill-studio``. We register a minimal
namespace module ``viewer`` whose ``__path__`` points at the repo root so
``viewer.server`` resolves to the real ``server/`` package on disk.
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

if "viewer" not in sys.modules:
    viewer = types.ModuleType("viewer")
    viewer.__path__ = [str(_ROOT)]
    sys.modules["viewer"] = viewer

"""Optional plugins for gamma-skill-studio.

Currently ships:
    * ``protomotions_build`` — compile a catalog into a ProtoMotions
      ``motion_library.pt``. Requires ProtoMotions checked out and the
      ``protomotions_dir`` key set in ``config.yaml``.

Plugins are discovered lazily so the core viewer works without any of them.
"""
from __future__ import annotations

from typing import Optional

from viewer.server.config import get_config


def get_build_manager():  # -> Optional[BuildManager]
    """Return a BuildManager instance if the ProtoMotions build plugin is
    available and configured, else ``None``.
    """
    cfg = get_config()
    if cfg.protomotions_dir is None or not cfg.protomotions_dir.exists():
        return None

    from viewer.server.plugins.protomotions_build import BUILD_MANAGER

    return BUILD_MANAGER

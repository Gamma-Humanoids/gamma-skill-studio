from __future__ import annotations

import re


def rewrite_mesh_paths(urdf_text: str, base_url: str) -> str:
    """Replace filename="meshes/XYZ.STL" with filename="{base_url}/XYZ.STL".

    Handles both single and double quotes. base_url must not end with /.
    """
    base_url = base_url.rstrip("/")

    def _replace(m: re.Match) -> str:
        quote = m.group(1)
        filename = m.group(2)
        return f'filename={quote}{base_url}/{filename}{quote}'

    return re.sub(
        r'filename=(["\'])meshes/([^"\']+)\1',
        _replace,
        urdf_text,
    )

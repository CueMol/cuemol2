"""Tests for headless qsc -> PNG rendering with the umbreon ray tracer.

These pin the observable contract of cuemol.umbreon_render, not image
quality: that a scene file renders to a PNG of the requested size without a
View or a GL context, that the projection comes from the scene's camera
rather than the exporter default, and that an unknown camera fails with a
clear error instead of a null-pointer throw from the C++ side.

Skipped when libcuemol2 was built with ENABLE_UMBREON=OFF (the default), in
which case StreamManager has no "umbreon" writer registered.
"""

import struct

import pytest

import cuemol
from cuemol import umbreon_render

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# A non-LFS scene file, so this runs on a plain clone without `git lfs pull`.
# It carries a "__current" camera saved with perspec=false, plus an atomintr
# renderer whose distance labels exercise the no-op drawString path.
_SCENE_FILE = "number_chain_atomintr1.qsc"


def _umbreon_available():
    return cuemol.strMgr().createHandler("umbreon", 2) is not None


umbreon_required = pytest.mark.skipif(
    not _umbreon_available(),
    reason="libcuemol2 was built without ENABLE_UMBREON",
)


def _png_size(path):
    """Return (width, height) read from a PNG's IHDR chunk."""
    with open(path, "rb") as f:
        head = f.read(24)
    assert head[:8] == _PNG_SIGNATURE, "not a PNG file"
    assert head[12:16] == b"IHDR", "first chunk is not IHDR"
    return struct.unpack(">II", head[16:24])


@pytest.fixture
def scene_path(test_data_path):
    return test_data_path / _SCENE_FILE


@umbreon_required
def test_render_file_writes_png_of_requested_size(scene_path, tmp_path):
    out = tmp_path / "out.png"

    umbreon_render.render_file(scene_path, out, width=120, height=80)

    assert out.is_file()
    assert _png_size(out) == (120, 80)


@umbreon_required
def test_projection_follows_scene_camera(scene_path, tmp_path):
    # The scene's camera is orthographic while UmbreonSceneExporter defaults
    # to perspective, so "follows the camera" is observable: the rendered
    # bytes must match an explicit orthographic render and differ from an
    # explicit perspective one. Both renders are deterministic because AO and
    # GI (the only stochastic parts) are off by default.
    auto = tmp_path / "auto.png"
    scene = umbreon_render.render_file(scene_path, auto, width=120, height=80)
    assert not scene.getCamera("__current").perspec, "scene camera must be ortho"

    def render_with(perspective, out):
        exporter = cuemol.strMgr().createHandler("umbreon", 2)
        exporter.width, exporter.height = 120, 80
        exporter.camera = "__current"
        exporter.perspective = perspective
        exporter.attach(scene)
        try:
            exporter.setPath(str(out))
            exporter.write()
        finally:
            exporter.detach()

    ortho = tmp_path / "ortho.png"
    persp = tmp_path / "persp.png"
    render_with(False, ortho)
    render_with(True, persp)

    assert auto.read_bytes() == ortho.read_bytes()
    assert auto.read_bytes() != persp.read_bytes()


@umbreon_required
def test_unknown_camera_raises_before_export(scene_path, tmp_path):
    out = tmp_path / "never.png"

    with pytest.raises(RuntimeError, match="no camera named"):
        umbreon_render.render_file(scene_path, out, width=120, height=80,
                                   camera="no_such_camera")

    assert not out.exists()

"""Tests for headless qsc -> PNG rendering with the umbreon ray tracer.

These pin the observable contract of cuemol.umbreon_render, not image
quality: that a scene file renders to a PNG of the requested size without a
View or a GL context, that the exporter is configured from the scene's
stored render settings (or the class defaults plus the camera's projection
when it has none), and that an unknown camera fails with a clear error
instead of a null-pointer throw from the C++ side.

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


def _load_scene(qsc_path):
    result = cuemol.svc("CmdMgr").runCmdArgs("load_scene", {"file_path": str(qsc_path)})
    return result["result_scene"]


@umbreon_required
def test_scene_without_settings_uses_class_defaults_and_camera_projection(scene_path):
    # The fixture stores no render settings, so the exporter starts from the
    # RenderSettings class defaults (the Rendering window's starting point)
    # and, as the window does for such a scene, takes the projection from the
    # scene's camera: it is orthographic while the class default is
    # perspective, so "follows the camera" is observable. Configuring only:
    # nothing is rendered, and the scene is not given a settings holder.
    scene = _load_scene(scene_path)
    assert scene.getAppData("render") is None
    assert not scene.getCamera("__current").perspec, "scene camera must be ortho"

    exporter = cuemol.strMgr().createHandler("umbreon", 2)
    assert umbreon_render.apply_scene_settings(scene, exporter) == "umbreon"

    assert not exporter.perspective
    assert exporter.useGI  # the umbreon block's default lighting
    assert (exporter.width, exporter.height) == (1200, 1200)
    assert scene.getAppData("render") is None


@umbreon_required
def test_stored_scene_settings_drive_the_render(scene_path, tmp_path):
    # Settings stored in the scene win over the camera and the defaults, and
    # an explicit size wins over the stored one.
    scene = _load_scene(scene_path)
    settings = scene.getCreateAppData("render", "RenderSettings")
    settings.width = 96
    settings.height = 64
    settings.projection = "perspective"
    settings.umbreon.useGI = False

    exporter = cuemol.strMgr().createHandler("umbreon", 2)
    umbreon_render.apply_scene_settings(scene, exporter)
    assert exporter.perspective
    assert not exporter.useGI

    out = tmp_path / "stored.png"
    umbreon_render.render(scene, out)
    assert _png_size(out) == (96, 64)

    wide = tmp_path / "wide.png"
    umbreon_render.render(scene, wide, width=50)
    assert _png_size(wide) == (50, 64)


@umbreon_required
def test_unknown_camera_raises_before_export(scene_path, tmp_path):
    out = tmp_path / "never.png"

    with pytest.raises(RuntimeError, match="no camera named"):
        umbreon_render.render_file(scene_path, out, width=120, height=80,
                                   camera="no_such_camera")

    assert not out.exists()

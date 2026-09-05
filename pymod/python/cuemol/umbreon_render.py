"""
Headless scene rendering with the umbreon (Embree) ray tracer.

Renders a CueMol scene straight to a PNG without an OpenGL context and
without a qsys View. UmbreonSceneExporter only needs the scene and a camera
(the scene walk goes through a file DisplayContext, not GL), so this works on
a headless machine. The GL-based PngSceneExporter cannot: it requires
View::createOffScreenView().

Requires libcuemol2 built with ENABLE_UMBREON=ON. Without it StreamManager
has no "umbreon" writer registered and createHandler() returns None.

The exporter is configured from the render settings the scene stores (Scene
app data "render": what the tritium Rendering window keeps per scene, with a
backend block for plain umbreon or umbreon NPR hatching), through the C++
UmbreonSceneExporter.applyRenderSettings that the GUI and cuetty use too, so
the image is what the GUI would render. A scene without settings of its own
renders with the RenderSettings class defaults (the window's starting point:
GI lighting, 1200x1200 px) and, as in the GUI, the projection of the camera
it was saved with. An explicit width / height overrides the stored size.

Text labels are not drawn: the file DisplayContext inherits the no-op
gfx::DisplayContext::drawString.
"""

from __future__ import annotations

import argparse
import sys

import cuemol as cm

__all__ = ["apply_scene_settings", "render", "render_file"]

# StreamManager category ID for scene exporters.
EXPORTER_CATEGORY = 2

# Camera the GUI saves the current view into when writing a .qsc file
# (see uxp qsc-io.js saveViewToCam), so a GUI-authored scene always has it.
DEFAULT_CAMERA = "__current"

# Scene app data holding the render settings (RenderSettings.qif).
RENDER_APP_DATA_ID = "render"
RENDER_APP_DATA_CLASS = "RenderSettings"


def apply_scene_settings(scene, exporter, camera=DEFAULT_CAMERA):
    """Configure an umbreon exporter from the scene's render settings.

    Applies the settings stored in the scene (Scene app data "render") or,
    when the scene holds none, the RenderSettings class defaults; in that
    case the projection then follows the named camera, as the Rendering
    window does for such a scene. The backend block is the scene's choice
    (umbreon NPR when it says so, plain umbreon otherwise, POV-Ray included).
    Neither the image size override nor the camera name is set here.

    Returns the backend block applied ("umbreon" or "umbreon_npr"). A render
    is not an edit: no settings holder is created in the scene.
    """
    sc = cm.scene(scene)
    if sc is None:
        raise RuntimeError("scene ({}) does not exist".format(scene))

    settings = sc.getAppData(RENDER_APP_DATA_ID)
    stored = settings is not None
    if not stored:
        settings = cm.createObj(RENDER_APP_DATA_CLASS)
    backend = exporter.applyRenderSettings(settings, "")

    if not stored:
        # View::setCameraAnim copies the whole Camera (including perspec)
        # into the view's current camera, so cam.perspec is what the GL view
        # showed; the class default (perspective) would render an
        # orthographic scene in perspective.
        exporter.perspective = sc.getCamera(camera).perspec
    return backend


def render(scene, out_png, width=None, height=None, camera=DEFAULT_CAMERA):
    """Render a scene into a PNG file with umbreon.

    scene may be a Scene wrapper or anything cuemol.scene() accepts. The
    image size comes from the scene's render settings unless width / height
    are given. The render is synchronous: write() blocks until the ray trace
    finishes.
    """
    sc = cm.scene(scene)
    if sc is None:
        raise RuntimeError("scene ({}) does not exist".format(scene))

    if not sc.hasCamera(camera):
        raise RuntimeError(
            "scene has no camera named '{}'; "
            "pass an existing camera name".format(camera)
        )

    exporter = cm.strMgr().createHandler("umbreon", EXPORTER_CATEGORY)
    if exporter is None:
        raise RuntimeError(
            "umbreon exporter is not available; "
            "libcuemol2 must be built with ENABLE_UMBREON=ON"
        )

    apply_scene_settings(sc, exporter, camera)

    if width is not None:
        exporter.width = width
    if height is not None:
        exporter.height = height
    exporter.camera = camera

    exporter.attach(sc)
    try:
        exporter.setPath(str(out_png))
        exporter.write()
    finally:
        exporter.detach()


def render_file(qsc_path, out_png, width=None, height=None,
                camera=DEFAULT_CAMERA):
    """Load a .qsc scene file and render it into a PNG file.

    Returns the loaded scene so the caller can render further images (e.g.
    other cameras) without reloading.
    """
    # Load through the load_scene command rather than a hand-picked reader:
    # leaving file_format empty makes LoadSceneCommand guess it from the file
    # name (the registered scene-reader nickname is "qsc_xml", not "qsc").
    result = cm.svc("CmdMgr").runCmdArgs("load_scene", {"file_path": str(qsc_path)})
    scene = result["result_scene"]
    if scene is None:
        raise RuntimeError("cannot load scene file: {}".format(qsc_path))

    render(scene, out_png, width, height, camera)
    return scene


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="python -m cuemol.umbreon_render",
        description="Render a CueMol scene file (.qsc) to a PNG image "
                    "with the umbreon ray tracer (headless).",
    )
    parser.add_argument("qsc", help="input scene file (.qsc)")
    parser.add_argument("png", help="output image file (.png)")
    parser.add_argument("-W", "--width", type=int, default=None,
                        help="image width in pixels "
                             "(default: the scene's render settings)")
    parser.add_argument("-H", "--height", type=int, default=None,
                        help="image height in pixels "
                             "(default: the scene's render settings)")
    parser.add_argument("-c", "--camera", default=DEFAULT_CAMERA,
                        help="camera name in the scene (default: %(default)s)")
    args = parser.parse_args(argv)

    if (args.width is not None and args.width <= 0) or \
            (args.height is not None and args.height <= 0):
        parser.error("width and height must be positive")

    render_file(args.qsc, args.png, args.width, args.height, args.camera)
    return 0


if __name__ == "__main__":
    sys.exit(main())

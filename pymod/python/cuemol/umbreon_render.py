"""
Headless scene rendering with the umbreon (Embree) ray tracer.

Renders a CueMol scene straight to a PNG without an OpenGL context and
without a qsys View. UmbreonSceneExporter only needs the scene and a camera
(the scene walk goes through a file DisplayContext, not GL), so this works on
a headless machine. The GL-based PngSceneExporter cannot: it requires
View::createOffScreenView().

Requires libcuemol2 built with ENABLE_UMBREON=ON. Without it StreamManager
has no "umbreon" writer registered and createHandler() returns None.

Everything except the image size, the camera and the projection is left at
the C++ ctor defaults of UmbreonSceneExporter (supersample 3, clip-Z and
edge lines on, AO / shadows / GI off). The projection is taken from the
camera the scene was saved with rather than the exporter default, so the
image matches the saved view.

Text labels are not drawn: the file DisplayContext inherits the no-op
gfx::DisplayContext::drawString.
"""

from __future__ import annotations

import argparse
import sys

import cuemol as cm

__all__ = ["render", "render_file"]

# StreamManager category ID for scene exporters.
EXPORTER_CATEGORY = 2

# Camera the GUI saves the current view into when writing a .qsc file
# (see uxp qsc-io.js saveViewToCam), so a GUI-authored scene always has it.
DEFAULT_CAMERA = "__current"

# Image size fallback, matching UmbreonSceneExporter::setupContext when no
# size and no view are available. Kept identical so an unspecified size means
# the same thing at every layer.
DEFAULT_WIDTH = 640
DEFAULT_HEIGHT = 480


def render(scene, out_png, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT,
           camera=DEFAULT_CAMERA):
    """Render a scene into a PNG file with umbreon.

    scene may be a Scene wrapper or anything cuemol.scene() accepts. The
    render is synchronous: write() blocks until the ray trace finishes.
    """
    sc = cm.scene(scene)
    if sc is None:
        raise RuntimeError("scene ({}) does not exist".format(scene))

    if not sc.hasCamera(camera):
        raise RuntimeError(
            "scene has no camera named '{}'; "
            "pass an existing camera name".format(camera)
        )
    cam = sc.getCamera(camera)

    exporter = cm.strMgr().createHandler("umbreon", EXPORTER_CATEGORY)
    if exporter is None:
        raise RuntimeError(
            "umbreon exporter is not available; "
            "libcuemol2 must be built with ENABLE_UMBREON=ON"
        )

    # Follow the projection the scene was saved with. View::setCameraAnim
    # copies the whole Camera (including perspec) into the view's current
    # camera, so cam.perspec is what the GL view showed. The exporter's own
    # perspective property defaults to true regardless, so without this the
    # render would differ from the saved view for orthographic scenes.
    exporter.perspective = cam.perspec

    exporter.width = width
    exporter.height = height
    exporter.camera = camera

    exporter.attach(sc)
    try:
        exporter.setPath(str(out_png))
        exporter.write()
    finally:
        exporter.detach()


def render_file(qsc_path, out_png, width=DEFAULT_WIDTH, height=DEFAULT_HEIGHT,
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
    parser.add_argument("-W", "--width", type=int, default=DEFAULT_WIDTH,
                        help="image width in pixels (default: %(default)s)")
    parser.add_argument("-H", "--height", type=int, default=DEFAULT_HEIGHT,
                        help="image height in pixels (default: %(default)s)")
    parser.add_argument("-c", "--camera", default=DEFAULT_CAMERA,
                        help="camera name in the scene (default: %(default)s)")
    args = parser.parse_args(argv)

    if args.width <= 0 or args.height <= 0:
        parser.error("width and height must be positive")

    render_file(args.qsc, args.png, args.width, args.height, args.camera)
    return 0


if __name__ == "__main__":
    sys.exit(main())

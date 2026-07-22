// -*-Mode: C++;-*-
//
//  Headless scene rendering (qsc -> PNG) with the umbreon ray tracer
//

#ifndef CUETTY_RENDER_SCENE_HPP_INCLUDED
#define CUETTY_RENDER_SCENE_HPP_INCLUDED

#include <string>

namespace cuetty {

/// Options for a headless scene render. Everything not listed here is left
/// at the UmbreonSceneExporter constructor defaults (supersample 3, clip-Z
/// and edge lines on, AO / shadows / GI off); the projection comes from the
/// scene's camera.
struct RenderOpts
{
    /// image width in pixels; matches the exporter's own fallback
    int width = 640;

    /// image height in pixels; matches the exporter's own fallback
    int height = 480;

    /// camera name to render from. The GUI saves the current view under this
    /// name when writing a .qsc, so a GUI-authored scene always has it.
    std::string camera = "__current";
};

/// Load a CueMol scene file and render it into a PNG image with umbreon.
///
/// Needs neither a qsys::View nor an OpenGL context: the exporter walks the
/// scene through a file DisplayContext. Text labels are not drawn (the file
/// DisplayContext inherits the no-op gfx::DisplayContext::drawString).
///
/// Returns 0 on success and 1 on failure, logging the reason.
int renderSceneToPng(const std::string &qscPath, const std::string &outPng,
                     const RenderOpts &opts);

}  // namespace cuetty

#endif

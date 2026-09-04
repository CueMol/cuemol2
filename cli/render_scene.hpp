// -*-Mode: C++;-*-
//
//  Headless scene rendering (qsc -> PNG) with the umbreon ray tracer
//

#ifndef CUETTY_RENDER_SCENE_HPP_INCLUDED
#define CUETTY_RENDER_SCENE_HPP_INCLUDED

#include <string>

namespace cuetty {

/// Options for a headless scene render. Everything not listed here comes from
/// the render settings stored in the scene file (Scene app data "render",
/// what the tritium Rendering window keeps per scene), or from the class
/// defaults of RenderSettings when the scene holds none; see
/// renderSceneToPng.
struct RenderOpts
{
    /// image width in pixels; 0 = the scene's render settings
    int width = 0;

    /// image height in pixels; 0 = the scene's render settings
    int height = 0;

    /// camera name to render from. The GUI saves the current view under this
    /// name when writing a .qsc, so a GUI-authored scene always has it.
    std::string camera = "__current";
};

/// Load a CueMol scene file and render it into a PNG image with umbreon.
///
/// The exporter is configured from the scene's render settings through
/// UmbreonSceneExporter::applyRenderSettings (the one mapping shared with the
/// GUI and the Python module): the stored settings when the scene has them,
/// else the RenderSettings class defaults, with the projection then taken
/// from the scene's camera as the GUI does for such a scene. The backend
/// block is the scene's choice (umbreon_npr renders with hatching; anything
/// else, including POV-Ray, renders with plain umbreon). `opts` overrides
/// the image size and names the camera.
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

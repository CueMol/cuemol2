// -*-Mode: C++;-*-
//
//  Umbreon ray-traced image scene exporter
//

#ifndef UMBREON_SCENE_EXPORTER_HPP_INCLUDED
#define UMBREON_SCENE_EXPORTER_HPP_INCLUDED

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class UmbreonSceneExporter_wrap;

namespace render {

  /// Scene exporter that renders the scene with umbreon (the Embree ray
  /// tracer) and writes the result as a PNG image. Parallel to
  /// PovSceneExporter, but produces pixels in-process instead of a POV-Ray
  /// scene description.
  class RENDER_API UmbreonSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::UmbreonSceneExporter_wrap;

  private:
    /// perspective (true) vs orthographic (false) projection
    bool m_bPerspective;

    /// clip geometry to the camera slab's near cutaway plane (z = slab/2),
    /// matching the GL view and the Lux exporter. Defaults to true so the image
    /// reproduces the live view; false renders the full unclipped scene (like
    /// the POV exporter's default).
    bool m_bUseClipZ;

    /// supersampling (antialiasing) factor; 1 = off
    int m_nSupersample;

    /// ambient-occlusion ray count per mesh hit; 0 = off
    int m_nAoSamples;

    /// cast shadows from the lights
    bool m_bShadows;

    /// draw silhouette/edge outline lines (CueMol toon edges)
    bool m_bEnableEdgeLines;

    /// crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;

    /// edge line rise from the surface
    double m_dEdgeRise;

    /// POV assumed_gamma applied to the final image (1.0 = no-op). Defaults to
    /// 2.2 to match the .pov + umbreon_cli reference workflow; set to 1.0 for a
    /// default CueMol .pov (which writes assumed_gamma 1.0).
    double m_dAssumedGamma;

    /// Raw linear output: force assumedGamma = 1.0 and map umbreon's linear HDR
    /// framebuffer straight to 8-bit (no sRGB OETF), writing an untagged PNG.
    /// Default false (the sRGB-encoded, sRGB-tagged path). For comparing the
    /// raw linear look against the default.
    bool m_bLinearOutput;

  public:
    UmbreonSceneExporter();
    virtual ~UmbreonSceneExporter();

    /// render the scene and write the image
    virtual void write();

    /////////////////////////////////

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;
  };

}

#endif

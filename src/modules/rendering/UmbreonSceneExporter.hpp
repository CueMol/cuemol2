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

    /// ambient-occlusion occluder search radius (world units)
    double m_dAoDistance;

    /// ambient-occlusion strength (0 = none, 1 = full)
    double m_dAoIntensity;

    /// cast shadows from the lights
    bool m_bShadows;

    /// shadow rays per light (>1 = soft area light)
    int m_nShadowSamples;

    /// light angular radius in degrees (>0 = soft shadows)
    double m_dLightRadius;

    /// draw silhouette/edge outline lines (CueMol toon edges)
    bool m_bEnableEdgeLines;

    /// crease detection angle limit (radian); negative = no crease limit
    double m_dCreaseLimit;

    /// edge line rise from the surface
    double m_dEdgeRise;

    /// Transparent background: emit an RGBA PNG with alpha = coverage (0 where
    /// no geometry is hit) so it can be composited over another image (POV
    /// "_transpbg"). Default false (opaque RGB over the scene background color).
    bool m_bTransparentBackground;

    /// diffuse global illumination (pt1 path-traced integrator); default off
    bool m_bGI;

    /// GI gather samples per pixel (higher = less noise)
    int m_nGiSamples;

    /// GI indirect intensity (indirect light gain)
    double m_dGiIntensity;

    /// GI environment (sky) intensity multiplier
    double m_dGiEnvIntensity;

    /// denoise the GI indirect irradiance with the Intel OIDN denoiser
    bool m_bGiDenoise;

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

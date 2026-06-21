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

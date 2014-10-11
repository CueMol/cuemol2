// -*-Mode: C++;-*-
//
// POV-Ray scene output class
//

#ifndef POVRAY_SCENE_EXPORTER_HPP_INCLUDED_
#define POVRAY_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class PovSceneExporter_wrap;

namespace render {

  class RENDER_API PovSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::PovSceneExporter_wrap;

  private:

    // bool m_bTexBlend;

    bool m_bUseClipZ;

    bool m_bPerspective;

    /// change the inc file path name to relative to pov file
    bool m_bMakeRelIncPath;

    LString m_strIncFileName;

    bool m_bPostBlend;

    LString m_strBlendTab;

    bool m_bEnableEdgeLines;

    /// Crease detection angle limit (in radian unit)
    double m_dCreaseLimit;

    /// Rise value from vertex position
    double m_dEdgeRise;

  public:
    PovSceneExporter();
    virtual ~PovSceneExporter();

    /// write to the stream
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


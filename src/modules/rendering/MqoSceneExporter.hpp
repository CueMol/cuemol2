// -*-Mode: C++;-*-
//
// Metaseq scene output class
//

#ifndef MQO_SCENE_EXPORTER_HPP_INCLUDED_
#define MQO_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class MqoSceneExporter_wrap;

namespace render {

  class RENDER_API MqoSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::MqoSceneExporter_wrap;

  private:

    bool m_bUseClipZ;

    bool m_bPerspective;

    /// change the inc file path name to relative to pov file
    bool m_bMakeRelIncPath;

    /// number of steps for gradient color rendering
    int m_nGradSteps;

    LString m_strIncFileName;

  public:
    MqoSceneExporter();
    virtual ~MqoSceneExporter();

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


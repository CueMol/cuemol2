// -*-Mode: C++;-*-
//
// STL (Stereolithography) scene output class
//

#ifndef STL_SCENE_EXPORTER_HPP_INCLUDED_
#define STL_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class StlSceneExporter_wrap;

namespace render {

  class RENDER_API StlSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::StlSceneExporter_wrap;

  private:

    /// scale (1 angstrom <--> 1 mm) ??
    double m_scale;

  public:
    StlSceneExporter();
    virtual ~StlSceneExporter();

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


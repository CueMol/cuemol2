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
    ~StlSceneExporter() override;

    /// write to the stream
    void write() override;

    /////////////////////////////////

    /// Get name of the writer
    const char *getName() const override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

  };

}

#endif


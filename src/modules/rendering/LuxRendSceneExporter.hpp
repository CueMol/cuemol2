// -*-Mode: C++;-*-
//
// LuxRender scene output class
//

#ifndef LUXREND_SCENE_EXPORTER_HPP_INCLUDED_
#define LUXREND_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class LuxRendSceneExporter_wrap;

namespace render {

  class RENDER_API LuxRendSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::LuxRendSceneExporter_wrap;

  private:

  public:
    LuxRendSceneExporter();
    virtual ~LuxRendSceneExporter();

    /// write to the stream
    virtual void write();

    /////////////////////////////////

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    /// Halt condition
    //double m_dHaltThr;
    int m_nHaltSPP;

    LString m_sFilmOpts;

    /// output base name
    LString m_sOutputBase;
  };

}

#endif


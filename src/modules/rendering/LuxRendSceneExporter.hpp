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
    ~LuxRendSceneExporter() override;

    /// write to the stream
    void write() override;

    /////////////////////////////////

    /// Get name of the writer
    const char *getName() const override;

    /// Get file-type description
    const char *getTypeDescr() const override;

    /// Get file extension
    const char *getFileExt() const override;

    /// Halt condition
    //double m_dHaltThr;
    int m_nHaltSPP;

    LString m_sFilmOpts;

    /// output base name
    LString m_sOutputBase;

    // bool m_bBgTransp;

    int m_nBgMode;
    static const int BG_TRANSP = 0;
    static const int BG_WALL = 1;
    static const int BG_BOX = 2;

  };

}

#endif


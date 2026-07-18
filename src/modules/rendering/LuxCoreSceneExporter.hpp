// -*-Mode: C++;-*-
//
// LuxCore scene output class
//

#ifndef LUXCORE_SCENE_EXPORTER_HPP_INCLUDED_
#define LUXCORE_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class LuxCoreSceneExporter_wrap;

namespace render {

  class RENDER_API LuxCoreSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::LuxCoreSceneExporter_wrap;

  private:

  public:
    LuxCoreSceneExporter();
    ~LuxCoreSceneExporter() override;

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
    LString m_sAbsOutBase;
    LString m_sRelOutBase;

    // bool m_bBgTransp;

    int m_nBgMode;
    static const int BG_TRANSP = 0;
    static const int BG_WALL = 1;
    static const int BG_BOX = 2;

  };

}

#endif


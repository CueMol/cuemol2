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
    virtual ~LuxCoreSceneExporter();

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


// -*-Mode: C++;-*-
//
// Warabi project scene exporter class
//

#ifndef WBP_SCENE_EXPORTER_HPP_INCLUDED_
#define WBP_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class WbpSceneExporter_wrap;

namespace render {

class MqoDisplayContext;

  class RENDER_API WbpSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::WbpSceneExporter_wrap;

  private:

    int m_nGradSteps;

    bool m_bUseClipZ;

    bool m_bPerspective;

    /// change the inc file path name to relative to pov file
    bool m_bMakeRelIncPath;

    //////////

    LString m_mqoRelPath;

    MqoDisplayContext *m_pdc;

    qlib::OutStream *m_pOut;

    std::list<LString> m_refBrushList;

    LString m_strMqoObjs;

  public:
    WbpSceneExporter();
    virtual ~WbpSceneExporter();

    /// write to the stream
    virtual void write();

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    /////////////////////////////////

    void writeWbp();

    void writeMqoImport();

    void writeDefaultRendOpts();

    void writeMqoObj(const LString &name);

    void writeBrush();

  };

}

#endif


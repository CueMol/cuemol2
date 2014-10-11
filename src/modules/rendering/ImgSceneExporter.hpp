// -*-Mode: C++;-*-
//
// Image scene output class
//

#ifndef IMG_SCENE_EXPORTER_HPP_INCLUDED_
#define IMG_SCENE_EXPORTER_HPP_INCLUDED_

#include "render.hpp"

#include <qsys/SceneExporter.hpp>
#include <qlib/mcutils.hpp>

class ImgSceneExporter_wrap;

namespace qlib {
  class FileOutStream;
}

namespace render {

  class RENDER_API ImgSceneExporter : public qsys::SceneExporter
  {
    MC_SCRIPTABLE;

    friend class ::ImgSceneExporter_wrap;
    typedef qsys::SceneExporter super_t;

  private:

    /// Image width
    int m_nWidth;

    /// Image height
    int m_nHeight;

    /// Resolution in DPI unit
    double m_dResDPI;

    /// Use RGBA pixel format
    bool m_bUseAlpha;

    /// Antialiasing option
    int m_nAAOpt;

    /// line counter
    int m_nIter;

    qlib::FileOutStream *m_pfos;

  public:
    ImgSceneExporter();
    virtual ~ImgSceneExporter();

    /// write to the stream
    virtual void write();

    /////////////////////////////////

    /// Get name of the writer
    virtual const char *getName() const;

    /// Get file-type description
    virtual const char *getTypeDescr() const;

    /// Get file extension
    virtual const char *getFileExt() const;

    ////////////////////////////////////////

    virtual int prepare(const char *filename);
    virtual bool request(int &posx, int &posy, int &width, int &height);
    virtual void writeData(const char *pbuf, int nsize);
    virtual void completed();

    ////////////////////////////////////////

    double getResDPI() const { return m_dResDPI; }
    void setResDPI(double val) { m_dResDPI = val; }

    bool getUseAlpha() const { return m_bUseAlpha; }
    void setUseAlpha(bool val) { m_bUseAlpha = val; }

    int getWidth() const { return m_nWidth; }
    int getHeight() const { return m_nHeight; }
    int getAAOpt() const { return m_nAAOpt; }

    void setWidth(int n) { m_nWidth = n; }
    void setHeight(int n) { m_nHeight = n; }
    void setAAOpt(int n) { m_nAAOpt = n; }

    qlib::OutStream *getOutStream() const;

  };

}

#endif


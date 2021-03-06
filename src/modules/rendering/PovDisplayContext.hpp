// -*-Mode: C++;-*-
//
//  Pov-Ray Display context implementation class
//

#ifndef POV_DISPLAY_CONTEXT_H__
#define POV_DISPLAY_CONTEXT_H__

#include "render.hpp"

#include "FileDisplayContext.hpp"
#include "RendIntData.hpp"
#include "GraphEdge.hpp"

#include <qlib/LString.hpp>

namespace qlib {
  class OutStream;
}

namespace render {

  class PovDisplayContext : public FileDisplayContext
  {
    typedef FileDisplayContext super_t;

  private:
    /// output pov file
    qlib::OutStream *m_pPovOut;

    /// output inc file
    qlib::OutStream *m_pIncOut;

    /// output inc filename
    LString m_incFileName;

    /// Generate files for post-blending mode
    bool m_bPostBlend;

    typedef std::map<LString, LString> BlendTab;

    /// Blend table (alpha value (in string) ==> secname list)
    BlendTab m_blendTab;

    /// Material's @COLOR@ replaced flag table
    std::set<LString> m_matColReplTab;
    
  public:
    PovDisplayContext();
    virtual ~PovDisplayContext();

    void startRender();
    void endRender();

    virtual void startSection(const LString &name);
    virtual void endSection();

    virtual bool isPostBlend() const;

  private:
    /// Main flag for edge line display
    bool m_bEnableEdgeLines;

    /// Crease detection angle limit (in radian unit)
    double m_dCreaseLimit;

    /// Rise value from vertex position
    double m_dEdgeRise;

    /// Edge corner type
    int m_nEdgeCornerType;

  public:
    /// Edge corner type defs
    enum {
      ECT_NONE = 0,
      ECT_JOINT = 1,
      ECT_ALL = 2
    };

  public:
    /// Crease detection angle limit (in radian unit)
    void setCreaseLimit(double d) { m_dCreaseLimit = d; }

    void setEdgeRise(double d) { m_dEdgeRise = d; }

    /// Main flag for edge line display
    void enableEdgeLines( bool b ) { m_bEnableEdgeLines = b; }


    ////////////////////////////////////////////////////////////
    // POV-Ray implementation

    void init(qlib::OutStream *pPovOut, qlib::OutStream *pIncOut);

    void setIncFileName(const LString &name) { m_incFileName = name; }

    void setPostBlend(bool b) { m_bPostBlend = b; }

    LString getPostBlendTableJSON() const;

  private:
    void writeHeader();
    void writeTailer();

    void writeObjects();
    void dumpClut(qlib::OutStream *fp);
    void writeColor(const RendIntData::ColIndex &ic);
    bool writeLines();
    bool writeCyls();
    bool writeSpheres();
    bool writeMeshes(bool bMask=false);

    void writeTextureList();
    void writeGradTexture();
    int convTexInd(MeshVert *p1);

    inline bool getMatColRepl(const LString &matname) const {
      std::set<LString>::const_iterator iter = m_matColReplTab.find(matname);
      if (iter==m_matColReplTab.end())
        return false; // not found
      return true;
    }

    //////////
    // edge extraction

    void writeSilEdges2();

    void writeEdgeLines(PrintStream &ips);
    void writeSilhLines(PrintStream &ips);

    void writeEdgeLine(PrintStream &ips,
                       const Vector4D &v1, const Vector4D &v2,
                       const Vector4D &n1, const Vector4D &n2,
                       int alpha1, int alpha2,
                       int flag=0);
    void writeEdgeLine2(PrintStream &ips, const SEEdge &elem);
    void writeEdgeLine3(PrintStream &ips, const SEEdge &elem, double fsec1, double fsec2);

    void writeCornerPoints2(PrintStream &ips);
    void writePoint(PrintStream &ips,
                    const Vector4D &v1, const Vector4D &n1, int alpha);

    virtual void writeEdgeLineImpl(PrintStream &ips, int xa1, int xa2,
                                   const Vector4D &x1, const Vector4D &n1,
                                   const Vector4D &x2, const Vector4D &b2);
    virtual void writePointImpl(PrintStream &ips,
                                const Vector4D &v1,
                                const Vector4D &n1,
				int alpha);


    //////////////////
    // images
  private:

    bool m_bWritePix;

    struct PixData {
      Vector4D m_pos;
      int m_nWidth;
      int m_nHeight;
      gfx::PixelBuffer *m_pData;
    };
    
    std::deque<PixData> m_pixList;

    void writePixData();

    std::list<LString> m_imgFileNames;
    
  public:
    virtual void drawPixels(const Vector4D &pos,
                            const gfx::PixelBuffer &data,
                            const gfx::ColorPtr &acol);

    void setWritePix(bool b) { m_bWritePix = b; }

    LString getImgFileNames() const
    {
      return LString::join(",", m_imgFileNames);
    }

    bool isRenderPixmap() const;

  };

}

#endif


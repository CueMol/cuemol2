// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef TUBE2_RENDERER_HPP_INCLUDED
#define TUBE2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"
#include "TubeSection.hpp"
#include "Spline2Renderer.hpp"

#ifdef WIN32
#define USE_TBO 1
#else
#endif

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
}

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  class Tube2Renderer;
  class Tube2Seg;

  ////////////////////////////////////////////////
  //
  /// Rendering object for the one drawing segment
  //
  class Tub2DrawSeg : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Tub2DrawSeg(int st, int en) : super_t(st, en), m_pVBO(NULL), m_pAttrAry(NULL)
    {
    }

    virtual ~Tub2DrawSeg();

    //////////
    // VBO implementation

    typedef gfx::DrawElemVNCI32 VertArray;

    /// cached vertex array/VBO
    VertArray *m_pVBO;

    //////////
    // GLSL implementation

    struct AttrElem {
      qfloat32 rhoi, rhoj;
    };

    typedef gfx::DrawAttrElems<quint32, AttrElem> AttrArray;

    /// VBO for glsl rendering
    AttrArray *m_pAttrAry;

  };


  ////////////////////////////////////////////////
  //
  /// Rendering object for the one spline segment
  //
  class Tube2Seg : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;
    
    typedef std::deque<Tub2DrawSeg> DrawSegList;

    DrawSegList m_draws;

    /// ctor
    Tube2Seg() : super_t()
    {
      m_pCoefTex = NULL;
      m_pBinormTex = NULL;
      m_pColorTex = NULL;
    }

    /// dtor
    virtual ~Tube2Seg();

    virtual void generateImpl(int nstart, int nend);

    /////////////////////
    // GLSL implementation

    /// float texture of the main axis coeff (common)
    gfx::Texture *m_pCoefTex;

    /// float texture of the binorm interp coeff
    gfx::Texture *m_pBinormTex;

    /// color texture
    gfx::Texture *m_pColorTex;
    std::vector<qbyte> m_colorTexData;

  };

  typedef std::deque<Tube2Seg> Tub2SegList;

  ////////////////////////////////////////////////////////
  //
  // Tube Renderer version 2 class
  //

  class Tube2Renderer : public MainChainRenderer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef MainChainRenderer super_t;

    //////////////
    // Properties

  private:
    /// Num of interporation point to the axial direction (axialdetail)
    int m_nAxialDetail;

  public:
    void setAxialDetail(int nlev) {
      m_nAxialDetail = nlev;
      // invalidateSplineCoeffs();
    }

    int getAxialDetail() const { return m_nAxialDetail; }

  private:
    /// width of line drawing (in pixel unit)
    double m_dLineWidth;

  public:
    void setLineWidth(double d) {
      super_t::invalidateDisplayCache();
      m_dLineWidth = d;
    }
    double getLineWidth() const {
      return m_dLineWidth;
    }

  private:
    /// Tube section data
    TubeSectionPtr m_pts;

  public:
    TubeSectionPtr getTubeSection() const {
      return m_pts;
    }


    /////////////////
    // ctor/dtor

  public:
    Tube2Renderer();
    
    virtual ~Tube2Renderer();

    /////////////////
    // Renderer interface
    
    virtual const char *getTypeName() const;

    virtual void display(DisplayContext *pdc);

    /////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    void invalidateDisplayCache();


    /////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


    /////////////////
    // work area

  private:

    /////////////////
    // Common implementation

    Tub2SegList m_seglist;

    void createSegList(DisplayContext *pdc);

    void setup(Tube2Seg *pSeg, DisplayContext *pdc);

    void startColorCalc();
    void endColorCalc();

    void updateStatic(Tube2Seg *pSeg);
    void updateDynamic(Tube2Seg *pSeg);


  private:
    /////////////////
    // VBO implementation


    void setupVBO(Tube2Seg *pSeg, DisplayContext *pdc);

    void updateColorVBO(Tube2Seg *pSeg, DisplayContext *pdc);

    void updateVBO(Tube2Seg *pSeg);

    void drawVBO(Tube2Seg *pSeg, DisplayContext *pdc);


  private:
    /////////////////
    // GLSL implementation

    /// Initialize shaders
    void initShader(DisplayContext *pdc);

    void setupGLSL(Tube2Seg *pSeg, DisplayContext *pdc);

    void updateColorGLSL(Tube2Seg *pSeg, DisplayContext *pdc);

    void updateGLSL(Tube2Seg *pSeg);

    void drawGLSL(Tube2Seg *pSeg, DisplayContext *pdc);

    bool m_bUseGLSL;

    /// shader check was performed
    bool m_bChkShaderDone;

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    // quint32 m_nColLoc;

    static const int COEF_TEX_UNIT = 0;
    static const int BINORM_TEX_UNIT = 1;
    static const int SECT_TEX_UNIT = 2;
    static const int COLOR_TEX_UNIT = 3;

    gfx::Texture *m_pSectTex;
    std::vector<float> m_secttab;

    void setupSectGLSL(DisplayContext *pdc);
    
    void updateSectGLSL();

  };

}

#endif


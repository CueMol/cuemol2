// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef SPLINE2_RENDERER_HPP_INCLUDED
#define SPLINE2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"
#include "SplineCoeffSet.hpp"

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

  class Spline2Renderer;
  class Spline2Seg;

  class Spl2DrawSeg
  {
  private:
    int m_nStart;
    int m_nEnd;

    /// tesselation level detail (copy of rend's prop)
    int m_nDetail;

    /// size of vertex/attribute array
    int m_nVA;

  public:
    Spl2DrawSeg(int st, int en) : m_nStart(st), m_nEnd(en), m_pVBO(NULL), m_pAttrAry(NULL)
    {
    }

    virtual ~Spl2DrawSeg();

    //////////
    // VBO implementation

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    void setupVBO(Spline2Renderer *pthis);

    void updateVBO(CubicSpline *pCoeff);

    void updateVBOColor(Spline2Renderer *pthis, Spline2Seg *pseg);

    void drawVBO(Spline2Renderer *pthis, DisplayContext *pdc);

    //////////
    // GLSL implementation

    struct AttrElem {
      qfloat32 rho;
      qbyte r, g, b, a;
    };

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for glsl rendering
    AttrArray *m_pAttrAry;

    /// Initialize shaders/texture
    void setupGLSL(Spline2Renderer *pthis);

    void updateGLSLColor(Spline2Renderer *pthis, Spline2Seg *pSeg);

    /// display() for GLSL version
    void drawGLSL(DisplayContext *pdc);

  };


  //
  /// Rendering object for the one spline segment
  //
  class Spline2Seg
  {
  private:

    typedef std::deque<Spl2DrawSeg> Spl2DrawList;
    Spl2DrawList m_draws;

    typedef std::vector<int> IDArray;
    
    /// Pivot atom AID array
    IDArray m_aids;

    /// Pivot atom crd array index (for dynamic update)
    IDArray m_inds;

    std::deque<int> m_aidtmp;

  public:
    Spline2Seg();
    ~Spline2Seg();

    void append(MolAtomPtr pAtom);

    void generate(Spline2Renderer *pthis, DisplayContext *pdc);

    quint32 getSize() const { return m_scoeff.getSize(); }

    MolAtomPtr getAtom(MolCoordPtr pMol, quint32 ind) const {
      quint32 aid = m_aids[ind];
      return pMol->getAtom(aid);
    }

    MolResiduePtr getResid(MolCoordPtr pMol, quint32 ind) const {
      MolAtomPtr pAtom = getAtom(pMol, ind);
      return pAtom->getParentResidue();
    }

    quint32 calcColor(Spline2Renderer *pthis, MolCoordPtr pMol, float par) const;

    //////////
    // drawing methods

    void updateDynamic(Spline2Renderer *pthis);
    
    void updateStatic(Spline2Renderer *pthis);
    
    void updateColor(Spline2Renderer *pthis);

    void draw(Spline2Renderer *pthis, DisplayContext *pdc);
    
  private:

    //////////
    // spline methods

    CubicSpline m_scoeff;

    // int m_nPoints;
    
    void updateScoeffDynamic(Spline2Renderer *pthis);
    void updateScoeffStatic(Spline2Renderer *pthis);

    //////////
    // VBO implementation

    void setupVBO(Spline2Renderer *pthis);

    void updateDynamicVBO(Spline2Renderer *pthis);

    void updateStaticVBO(Spline2Renderer *pthis);

    void updateVBOColor(Spline2Renderer *pthis);

    void drawVBO(Spline2Renderer *pthis, DisplayContext *pdc);

    void updateVBO();

  private:
    /////////////////////
    // GLSL implementation

    /// coeff float texture
    gfx::Texture *m_pCoefTex;

    std::vector<float> m_coefbuf;

    //
    // GLSL methods
    //

    /// Initialize shaders/texture
    void setupGLSL(Spline2Renderer *pthis, DisplayContext *pdc);

    /// update coord texture for GLSL rendering
    void updateDynamicGLSL(Spline2Renderer *pthis);

    void updateStaticGLSL(Spline2Renderer *pthis);

    void updateGLSLColor(Spline2Renderer *pthis);

    /// display() for GLSL version
    void drawGLSL(Spline2Renderer *pthis, DisplayContext *pdc);

    void updateCoefTex();

  };

  typedef std::deque<Spline2Seg> Spl2SegList;

  ////////////////////////////////////////////////////////
  //
  // Spline Renderer version 2 class
  //

  class Spline2Renderer : public MainChainRenderer
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

    /////////////////
    // ctor/dtor

  public:
    Spline2Renderer();
    
    virtual ~Spline2Renderer();

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

    Spl2SegList m_seglist;

    void createSegList(DisplayContext *pdc);

    void startColorCalc();
    void endColorCalc();


    /////////////////
    // GLSL implementation

  public:
    bool m_bUseGLSL;

    /// shader check was performed
    bool m_bChkShaderDone;

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    quint32 m_nColLoc;

  private:
    /// Initialize shaders
    void initShader(DisplayContext *pdc);

  };

}

#endif


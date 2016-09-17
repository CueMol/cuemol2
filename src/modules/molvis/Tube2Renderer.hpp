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

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture1D;
  class Texture2D;
  class Texture3D;
}

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  class Tube2Renderer;
  class Tube2Seg;

  class Tub2DrawSeg
  {
  private:
    int m_nStart;
    int m_nEnd;

    /// tesselation level detail (copy of rend's prop)
    int m_nDetail;

    /// Number of axial points in this DrawSeg
    int m_nAxPts;

    /// Number of section division
    int m_nSecDiv;

    /// size of vertex/attribute array
    int m_nVA;

  public:
    Tub2DrawSeg(int st, int en) : m_nStart(st), m_nEnd(en), m_pVBO(NULL), m_pAttrAry(NULL)
    {
    }

    virtual ~Tub2DrawSeg();

    //////////
    // VBO implementation

    /// cached vertex array/VBO
    gfx::DrawElemVNCI *m_pVBO;

    void setupVBO(Tube2Renderer *pthis);

    void updateVBO(Tube2Renderer *pthis, Tube2Seg *pseg);

    void updateVBOColor(Tube2Renderer *pthis, Tube2Seg *pseg);

    void drawVBO(Tube2Renderer *pthis, DisplayContext *pdc);

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
    void setupGLSL(Tube2Renderer *pthis);

    void updateGLSLColor(Tube2Renderer *pthis, Tube2Seg *pSeg);

    /// display() for GLSL version
    void drawGLSL(DisplayContext *pdc);

  };


  //
  /// Rendering object for the one spline segment
  //
  class Tube2Seg
  {
  private:

    typedef std::deque<Tub2DrawSeg> Tub2DrawList;
    Tub2DrawList m_draws;

    typedef std::vector<int> IDArray;
    
    /// Pivot atom AID array
    IDArray m_aids;

    /// Pivot atom crd array index (for dynamic update)
    IDArray m_inds;

    std::deque<int> m_aidtmp;

  public:
    Tube2Seg();
    ~Tube2Seg();

    inline void append(MolAtomPtr pAtom) {
      m_aidtmp.push_back(pAtom->getID());
    }


    void generate(Tube2Renderer *pthis, DisplayContext *pdc);

    quint32 getSize() const { return m_scoeff.getSize(); }

    MolAtomPtr getAtom(MolCoordPtr pMol, quint32 ind) const {
      quint32 aid = m_aids[ind];
      return pMol->getAtom(aid);
    }

    MolResiduePtr getResid(MolCoordPtr pMol, quint32 ind) const {
      MolAtomPtr pAtom = getAtom(pMol, ind);
      return pAtom->getParentResidue();
    }

    quint32 calcColor(Tube2Renderer *pthis, MolCoordPtr pMol, float par) const;

    Vector3F calcBinormVec(MolCoordPtr pMol, int nres);

    //////////
    // drawing methods

    void updateDynamic(Tube2Renderer *pthis);
    
    void updateStatic(Tube2Renderer *pthis);
    
    void updateColor(Tube2Renderer *pthis);

    void draw(Tube2Renderer *pthis, DisplayContext *pdc);
    
  private:

    //////////
    // spline methods

    /// Main axis interpolation coeff (common)
    CubicSpline m_scoeff;

    /// Binorm interpolation coeff
    CubicSpline m_bnormInt;

  public:
    CubicSpline *getAxisIntpol() { return &m_scoeff; }
    CubicSpline *getBinormIntpol() { return &m_bnormInt; }

    void updateScoeffDynamic(Tube2Renderer *pthis);
    void updateScoeffStatic(Tube2Renderer *pthis);

    //////////
    // VBO implementation

    void setupVBO(Tube2Renderer *pthis);

    void updateDynamicVBO(Tube2Renderer *pthis);

    void updateStaticVBO(Tube2Renderer *pthis);

    void updateVBOColor(Tube2Renderer *pthis);

    void drawVBO(Tube2Renderer *pthis, DisplayContext *pdc);

    void updateVBO(Tube2Renderer *pthis);

  private:
    /////////////////////
    // GLSL implementation

    /// float texture of the main axis coeff (common)
    gfx::Texture1D *m_pCoefTex;

    // /// float texture of the binorm interp coeff
    // gfx::Texture1D *m_pBnormCoefTex;

    //
    // GLSL methods
    //

    /// Initialize shaders/texture
    void setupGLSL(Tube2Renderer *pthis, DisplayContext *pdc);

    /// update coord texture for GLSL rendering
    void updateDynamicGLSL(Tube2Renderer *pthis);

    void updateStaticGLSL(Tube2Renderer *pthis);

    void updateGLSLColor(Tube2Renderer *pthis);

    /// display() for GLSL version
    void drawGLSL(Tube2Renderer *pthis, DisplayContext *pdc);

    void updateCoefTex();

  };

  typedef std::deque<Tube2Seg> Tub2SegList;

  ////////////////////////////////////////////////////////
  //
  // Spline Renderer version 2 class
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

    Tub2SegList m_seglist;

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


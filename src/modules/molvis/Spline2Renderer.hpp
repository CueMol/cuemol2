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

  namespace detail {

    class DrawSegment
    {
    public:
      /// start value of this drawing segment
      int m_nStart;
      
      /// end value of this drawing segment
      int m_nEnd;
      
      /// Number of axial points in this DrawSeg
      int m_nAxPts;
      
    public:
      DrawSegment(int st, int en)
           : m_nStart(st), m_nEnd(en), m_nAxPts(-1)
      {
      }
      
      virtual ~DrawSegment()
      {
      }
      
	};

    ///////////////

    class SplineSegment
    {
    public:

      typedef std::vector<int> IDArray;
      
      /// Pivot atom AID array
      IDArray m_aids;
      
      /// Pivot atom crd array index (for dynamic update)
      IDArray m_inds;

      /// temporary area for aid array construction
      std::deque<int> m_aidtmp;
      
      inline void append(MolAtomPtr pAtom) {
        m_aidtmp.push_back(pAtom->getID());
      }

      //////////////////

      /// ctor
      SplineSegment() : m_nCtlPts(-1) {
      }
      
      /// dtor
      virtual ~SplineSegment() {
      }
      
      MolAtomPtr getAtom(MolCoordPtr pMol, quint32 ind) const {
        quint32 aid = m_aids[ind];
        return pMol->getAtom(aid);
      }
      
      MolResiduePtr getResid(MolCoordPtr pMol, quint32 ind) const {
        MolAtomPtr pAtom = getAtom(pMol, ind);
        return pAtom->getParentResidue();
      }
      

      /// Main axis interpolation coeff (common, cubic spline)
      CubicSpline m_scoeff;
      
      /// Binorm interpolation coeff (linear)
      std::vector<Vector3F> m_linBnInt;
      
      /// Number of the Interpolation control points
      int m_nCtlPts;
      
      quint32 getSize() const { return m_nCtlPts; }

      CubicSpline *getAxisIntpol() { return &m_scoeff; }


      virtual void generateImpl(int nstart, int nend) =0;

      void generate(MainChainRenderer *pthis);

      quint32 calcColor(MainChainRenderer *pthis, MolCoordPtr pMol, float par) const;
      
      Vector3F calcBinormVec(MolCoordPtr pMol, int nres);

      bool checkBinormFlip(const Vector3F &dv, const Vector3F &binorm,
                           const Vector3F &prev_dv, const Vector3F &prev_bn);
      
      void updateBinormIntpol(MolCoordPtr pCMol);
      
      Vector3F intpolLinBn(float par);

      void updateStatic(MainChainRenderer *pthis);
      void updateDynamic(MainChainRenderer *pthis);

    };

  }

  using detail::SplineSegment;

  ///
  class SplineRendBase : public MainChainRenderer
  {
    // MC_SCRIPTABLE;
    // MC_CLONEABLE;
    
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

    /////////////////
    // ctor/dtor

  public:
    SplineRendBase();
    
    virtual ~SplineRendBase();

    /////////////////
    // Renderer interface
    virtual void display(DisplayContext *pdc);

    /////////////////
    // DispCacheRenderer interface

    virtual void invalidateDisplayCache();

    /////////////////
    // SplineRendBase interface
    virtual bool isCacheAvail() const;
    virtual void createCacheData(DisplayContext *pdc);

    virtual void render2(DisplayContext *pdc);

    /////////////////
    // Event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


    /////////////////
    // work area

  private:
    bool m_bUseGLSL;

  public:
    inline bool isUseGLSL() const { return m_bUseGLSL; }
    inline void setUseGLSL(bool b) { m_bUseGLSL = b; }

  private:
    /// shader check was performed
    bool m_bChkShaderDone;

  public:
    inline bool isShaderCheckDone() const { return m_bChkShaderDone; }
    inline void setShaderCheckDone(bool b) { m_bChkShaderDone = b; }

  private:

    /////////////////
    // Common implementation

    typedef std::deque<SplineSegment *> SegPtrList;

    SegPtrList m_seglist;

    void clearSegList() {
      std::for_each(m_seglist.begin(),
		    m_seglist.end(),
		    qlib::delete_ptr<SplineSegment*>());
      m_seglist.clear();
    }

  public:
    virtual SplineSegment *createSegment() =0;

    void createSegList(DisplayContext *pdc);

    void setup(SplineSegment *pSeg, DisplayContext *pdc);

    virtual void setupVBO(SplineSegment *pSeg, DisplayContext *pdc) =0;
    virtual void setupGLSL(SplineSegment *pSeg, DisplayContext *pdc) =0;

    void startColorCalc();
    void endColorCalc();

    // update coordinate data

    void updateCrdStatic(detail::SplineSegment *pSeg);
    void updateCrdDynamic();
    void updateCrdDynamic(detail::SplineSegment *pSeg);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg) =0;
    virtual void updateCrdGLSL(detail::SplineSegment *pSeg) =0;

    // update color data

    virtual void updateColorVBO(SplineSegment *pSeg, DisplayContext *pdc) =0;
    virtual void updateColorGLSL(SplineSegment *pSeg, DisplayContext *pdc) =0;

  public:
    /////////////////
    // VBO implementation


    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;


  private:
    /////////////////
    // GLSL implementation

    /// Initialize GLSL
    virtual bool initShader(DisplayContext *pdc) =0;




    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;

  };


  
  ///////////////////////////////

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

    /// Initialize shaders
    void initShader(DisplayContext *pdc);

  };

}

#endif


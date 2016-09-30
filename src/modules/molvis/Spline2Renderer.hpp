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
    /// Initialize GLSL
    virtual bool initShader(DisplayContext *pdc) =0;

    virtual SplineSegment *createSegment() =0;

    virtual void createSegList(DisplayContext *pdc);

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

    // draw

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;
    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;

  };


  
  ///////////////////////////////

  class Spline2Renderer;
  class Spline2Seg;

  class Spl2DrawSeg : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Spl2DrawSeg(int st, int en) : super_t(st,en), m_pVBO(NULL), m_pAttrAry(NULL)
    {
    }

    virtual ~Spl2DrawSeg();

    //////////
    // VBO implementation

    /// cached vertex array/VBO
    gfx::DrawElemVC *m_pVBO;

    //////////
    // GLSL implementation

    struct AttrElem {
      qfloat32 rho;
      qbyte r, g, b, a;
    };

    typedef gfx::DrawAttrArray<AttrElem> AttrArray;

    /// VBO for glsl rendering
    AttrArray *m_pAttrAry;

  };

  //
  /// Rendering object for the one spline segment
  //
  class Spline2Seg : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;

    typedef std::deque<Spl2DrawSeg> Spl2DrawList;
    Spl2DrawList m_draws;

    Spline2Seg() : super_t()
    {
      m_pCoefTex = NULL;
    }
    virtual ~Spline2Seg();

    virtual void generateImpl(int nstart, int nend);

    /////////////////////
    // GLSL implementation

    /// float texture of the main axis coeff (common)
    gfx::Texture *m_pCoefTex;
  };

  typedef std::deque<Spline2Seg> Spl2SegList;

  ////////////////////////////////////////////////////////
  //
  // Spline Renderer version 2 class
  //

  class Spline2Renderer : public SplineRendBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef SplineRendBase super_t;

    //////////////
    // Properties

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

    // virtual void display(DisplayContext *pdc);

    /////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    // void invalidateDisplayCache();


    /////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    // virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // Common implementation

    virtual void createSegList(DisplayContext *pdc);

    virtual SplineSegment *createSegment();

    /////////////////
    // VBO implementation

    virtual void setupVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg);

    virtual void updateColorVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    /////////////////
    // GLSL implementation

    /// Initialize shaders
    virtual bool initShader(DisplayContext *pdc);

    virtual void setupGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void updateCrdGLSL(detail::SplineSegment *pSeg);

    virtual void updateColorGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc);

  private:
    /////////////////
    // work area

    /// GLSL shader objects
    sysdep::OglProgramObject *m_pPO;

    quint32 m_nRhoLoc;

    quint32 m_nColLoc;

  };

}

#endif


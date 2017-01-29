// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef SPLINE_REND_BASE_HPP_INCLUDED
#define SPLINE_REND_BASE_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"

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
  class SplineRendBase;

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
      SplineSegment() : m_nCtlPts(-1)
      {
      }
      
      /// dtor
      virtual ~SplineSegment();
      
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


      void generate(SplineRendBase *pthis);

      ColorPtr calcColorPtr(SplineRendBase *pthis, MolCoordPtr pMol, float par) const;
      quint32 calcColor(SplineRendBase *pthis, MolCoordPtr pMol, float par) const;
      
      Vector3F calcBinormVec(MolCoordPtr pMol, int nres);

      bool checkBinormFlip(const Vector3F &dv, const Vector3F &binorm,
                           const Vector3F &prev_dv, const Vector3F &prev_bn);
      
      void updateBinormIntpol(MolCoordPtr pCMol);
      
      Vector3F intpolLinBn(float par);

      void updateStatic(SplineRendBase *pthis);
      void updateDynamic(SplineRendBase *pthis);

      void getBasisVecs(float par, Vector3F &pos, Vector3F &e0,
                        Vector3F &e1, Vector3F &e2);

      //////////

      typedef std::deque<DrawSegment *> DrawList;
      DrawList m_draws;

      virtual DrawSegment *createDrawSeg(int nstart, int nend) =0;

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


  private:
    /// Start cap type
    int m_nStCapType;

    /// End cap type
    int m_nEnCapType;

  public:
    /// cap type ID
    static const int CAP_SPHR = 0;
    static const int CAP_FLAT = 1;
    static const int CAP_NONE = 2;

    /// Start cap type
    int getStartCapType() const { return m_nStCapType; }
    void setStartCapType(int nType) {
      invalidateDisplayCache();
      m_nStCapType = nType;
    }

    /// End cap type
    int getEndCapType() const { return m_nEnCapType; }
    void setEndCapType(int nType) {
      invalidateDisplayCache();
      m_nEnCapType = nType;
    }

  private:
    
    /// Color interpolation flag
    bool m_bInterpColor;

  public:
    /// Set color interpolation flag
    void setSmoothColor(bool b)
    {
      invalidateDisplayCache();
      m_bInterpColor = b;
    }

    bool isSmoothColor() const { return m_bInterpColor; }


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
    virtual void createCacheData();

    /// Render to display
    virtual void render2(DisplayContext *pdc);

    /// Render to file (without using cache data)
    virtual void renderFile(DisplayContext *pdc);

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
    /// shader is available
    bool m_bShaderAvail;

  public:
    inline bool isShaderAvail() const { return m_bShaderAvail; }

  protected:

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
    /// Initialize shader (default: shader not supported)
    virtual bool initShader(DisplayContext *pdc);

    virtual SplineSegment *createSegment() =0;

    virtual void createSegList();

    void setup(SplineSegment *pSeg);

    virtual void setupVBO(SplineSegment *pSeg) =0;
    virtual void setupGLSL(SplineSegment *pSeg) {}

    void startColorCalc();
    void endColorCalc();

    // update coordinate data

    void updateCrdStatic();
    void updateCrdDynamic();

    virtual void updateCrdVBO(detail::SplineSegment *pSeg) =0;
    virtual void updateCrdGLSL(detail::SplineSegment *pSeg) {}

    // update color data

    virtual void updateColorVBO(SplineSegment *pSeg) =0;
    virtual void updateColorGLSL(SplineSegment *pSeg) {}

    // draw

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;
    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc) {}

  };
  
}

#endif

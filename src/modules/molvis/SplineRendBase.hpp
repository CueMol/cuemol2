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
      
      MolAtomPtr getAtom(const MolCoordPtr &pMol, quint32 ind) const
      {
        if (ind<0 || ind>=m_aids.size())
          return MolAtomPtr();
        quint32 aid = m_aids[ind];
        return pMol->getAtom(aid);
      }
      
      MolResiduePtr getResid(const MolCoordPtr &pMol, quint32 ind) const
      {
        MolAtomPtr pAtom = getAtom(pMol, ind);
        if (pAtom.isnull()) return MolResiduePtr();
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

      ColorPtr calcColorPtr(SplineRendBase *pthis, const MolCoordPtr &pMol, float par) const;
      quint32 calcColor(SplineRendBase *pthis, const MolCoordPtr &pMol, float par) const;
      
      Vector3F calcBinormVec(const MolCoordPtr &pMol, int nres);

      bool checkBinormFlip(const Vector3F &dv, const Vector3F &binorm,
                           const Vector3F &prev_dv, const Vector3F &prev_bn);
      
      void updateBinormIntpol(const MolCoordPtr &pCMol);
      
      Vector3F intpolLinBn(float par);

      void updateStatic(SplineRendBase *pthis);
      void updateDynamic(SplineRendBase *pthis);

      void getBasisVecs(float par, Vector3F &pos, Vector3F &e0,
                        Vector3F &e1, Vector3F &e2);

      //////////

      typedef std::deque<DrawSegment *> DrawList;
      DrawList m_draws;

      virtual DrawSegment *createDrawSeg(int nstart, int nend) =0;
      
      /// Returns true, if par is at the internal end of the segment
      ///  (returns false, if par is at the external end.)
      //bool isSegEnd(double par);
      
      /// Implementation of the segment end detection
      void getSegEndImpl(SplineRendBase *pthis,
                         int nprev1, int nnext1,
                         float &rho, bool &bRes1Tp, bool &bRes2Tp) const;

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

    static const int XCAP_MSFLAT = 3;

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

  private:
    /// Main-chain smoothness flag
    float m_fSmooth;

  public:
    void setSmooth(double f) {
      invalidateDisplayCache();
      m_fSmooth = float (f);
    }
    float getSmooth() const {
      return m_fSmooth;
    }

  private:
    /// Fade out flag of the end of the segment
    bool m_bSegEndFade;

  public:
    void setSegEndFade(bool b) {
      invalidateDisplayCache();
      m_bSegEndFade = b;
    }
    bool isSegEndFade() const { return m_bSegEndFade; }
    

    /////////////////
    // ctor/dtor

  public:
    SplineRendBase();
    
    virtual ~SplineRendBase();

    /////////////////
    // Renderer interface
    // virtual void display(DisplayContext *pdc);

    /// Use ver2 interface (returns true)
    virtual bool isUseVer2Iface() const;

    /////////////////
    // DispCacheRenderer interface

    virtual bool isCacheAvail() const;

    virtual void createDisplayCache();
    // virtual void createCacheData();

    virtual void createGLSL();
    virtual void createVBO();
    virtual void updateStaticVBO();
    virtual void updateStaticGLSL();
    virtual void updateDynamicVBO();
    virtual void updateDynamicGLSL();
    virtual void updateGLSLColor();
    virtual void updateVBOColor();

    virtual void invalidateDisplayCache();

    /// Render to display
    // virtual void render2(DisplayContext *pdc);
    virtual void renderGLSL(DisplayContext *pdc);
    virtual void renderVBO(DisplayContext *pdc);

    /// Render to file (without using cache data)
    // virtual void renderFile(DisplayContext *pdc);

    /////////////////
    // Event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    // virtual void objectChanged(qsys::ObjectEvent &ev);

    //

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

    bool m_bVBOCacheOK;
    bool m_bGLSLCacheOK;

    /////////////////
    // SplineRendBase interface

  public:
    virtual SplineSegment *createSegment() =0;

    virtual void createSegList();

    void setupSeg(SplineSegment *pSeg);

    virtual void setupVBO(SplineSegment *pSeg) =0;
    virtual void setupGLSL(SplineSegment *pSeg) {}


    // void updateCrdStatic();
    // void updateCrdDynamic();

    virtual void updateCrdVBO(detail::SplineSegment *pSeg) =0;
    virtual void updateCrdGLSL(detail::SplineSegment *pSeg) {}

    // update color data

    virtual void updateColorVBO(SplineSegment *pSeg) =0;
    virtual void updateColorGLSL(SplineSegment *pSeg) {}

    // draw

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc) =0;
    virtual void drawGLSL(detail::SplineSegment *pSeg, DisplayContext *pdc) {}

    //////////

    virtual int getCapTypeImpl(detail::SplineSegment *pSeg, detail::DrawSegment *pDS, bool bStart);
  };
  
}

#endif

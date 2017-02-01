// -*-Mode: C++;-*-
//
//  backbone spline-trace renderer class
//

#ifndef TUBE2_RENDERER_HPP_INCLUDED
#define TUBE2_RENDERER_HPP_INCLUDED

#include "molvis.hpp"

#include <qlib/Vector4D.hpp>
#include <qlib/Vector2D.hpp>
#include <qlib/Vector3F.hpp>
#include <gfx/DrawElem.hpp>
#include <gfx/DrawAttrArray.hpp>

#include <modules/molstr/MainChainRenderer.hpp>
#include "CubicSpline.hpp"
#include "TubeSection.hpp"
#include "Spline2Renderer.hpp"

#include "TubeTess.hpp"

namespace molvis {
  
  using qlib::Vector4D;
  using qlib::Vector3F;
  using qlib::Vector2D;
  using gfx::ColorPtr;
  using namespace molstr;

  class Tube2Renderer;
  class Tube2SS;

  ////////////////////////////////////////////////
  //
  /// Rendering object for the one drawing segment
  //
  class Tube2DS : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Tube2DS(int st, int en) : super_t(st, en), m_pVBO(NULL), m_ptess(NULL)
    {
    }

    virtual ~Tube2DS();

    //////////
    // VBO implementation

    typedef gfx::DrawElemVNCI32 VertArray;

    /// cached vertex array/VBO
    VertArray *m_pVBO;

    //////////////
    // Workarea
    
    void* m_ptess;

  };


  ////////////////////////////////////////////////
  //
  /// Rendering object for the one spline segment
  //
  class Tube2SS : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;
    
    /// ctor
    Tube2SS() : super_t()
    {
    }

    /// dtor
    virtual ~Tube2SS();

    // virtual void generateImpl(int nstart, int nend);
    virtual detail::DrawSegment *createDrawSeg(int nstart, int nend);

  };


  ////////////////////////////////////////////////////////
  //
  // Tube Renderer version 2 class
  //

  class Tube2Renderer : public SplineRendBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

  public:
    typedef SplineRendBase super_t;

    typedef Tube2SS SplSeg;
    typedef Tube2DS DrawSeg;

    //////////////
    // Properties

  private:
    /// Tube section data
    TubeSectionPtr m_pts;

  public:
    TubeSectionPtr getTubeSection() const {
      return m_pts;
    }

    ///////////////////////////////

  private:
    int m_nPuttyMode;

  public:
    static const int TBR_PUTTY_OFF = 0;
    static const int TBR_PUTTY_SCALE1 = 1;
    static const int TBR_PUTTY_LINEAR1 = 2;

    void setPuttyMode(int nmode) {
      m_nPuttyMode = nmode;
      invalidateDisplayCache();
    }
    int getPuttyMode() const { return m_nPuttyMode; }

    ///////////////////////////////

  private:
    int m_nPuttyTgt;

  public:
    static const int TBR_PUTTY_BFAC = 1;
    static const int TBR_PUTTY_OCC = 2;

    void setPuttyTgt(int ntgt) {
      m_nPuttyTgt = ntgt;
      invalidateDisplayCache();
    }
    int getPuttyTgt() const { return m_nPuttyTgt; }

    ///////////////////////////////

  public:
    float m_dPuttyScl;
    float m_dPuttyLoScl;

  public:
    void setPuttyHiScl(double d) {
      m_dPuttyScl = float(d);
      invalidateDisplayCache();
    }
    float getPuttyHiScl() const { return m_dPuttyScl; }

    void setPuttyLoScl(double d) {
      m_dPuttyLoScl = float(d);
      invalidateDisplayCache();
    }
    float getPuttyLoScl() const { return m_dPuttyLoScl; }
    

    // putty work area

    float m_dParHi;
    float m_dParLo;
    float m_dParAver;


    /////////////////
    // ctor/dtor

  public:
    Tube2Renderer();
    
    virtual ~Tube2Renderer();

    /////////////////
    // Renderer interface
    
    virtual const char *getTypeName() const;

    // virtual void display(DisplayContext *pdc);

    /////////////////
    // DispCacheRenderer interface

    virtual void preRender(DisplayContext *pdc);
    
    // virtual void invalidateDisplayCache();
    

    /////////////////
    // event handling

    virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // Common implementation

    virtual void createCacheData();

    virtual void createSegList();
    
    virtual SplineSegment *createSegment();

    /////////////////
    // VBO implementation

    virtual void setupVBO(detail::SplineSegment *pSeg);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg);

    virtual void updateColorVBO(detail::SplineSegment *pSeg);

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

    typedef TubeTess<Tube2Renderer> Tess;

    /////////////////
    // File rendering

    /// Render to file (without using cache data)
    virtual void renderFile(DisplayContext *pdc);
    

    /////////////////
    // Putty impl

    void initPuttyData();

    Vector2D getEScl(const MolCoordPtr &pMol, Tube2SS *pSeg, float par) const;

    //

    virtual int getCapTypeImpl(detail::SplineSegment *pSeg, detail::DrawSegment *pDS, bool bStart);
  };

}

#endif


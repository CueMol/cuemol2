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

#include "TubeTess.hpp"

namespace molvis {
  
  using qlib::Vector4D;
  using qlib::Vector3F;
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

    virtual void createSegList();
    
    virtual SplineSegment *createSegment();

    /////////////////
    // VBO implementation

    virtual void setupVBO(detail::SplineSegment *pSeg);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg);

    virtual void updateColorVBO(detail::SplineSegment *pSeg);

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

	typedef TubeTess<Tube2Renderer> Tess;
  };

}

#endif


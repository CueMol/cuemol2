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
#include "SplineRendBase.hpp"

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  class Spline2Renderer;
  class Spline2SS;

  class Spline2DS : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Spline2DS(int st, int en) : super_t(st,en), m_pVBO(NULL)
    {
    }

    virtual ~Spline2DS();

    //////////
    // VBO implementation

    typedef gfx::DrawElemVC VertArray;

    /// cached vertex array/VBO
    VertArray *m_pVBO;

  };

  //
  /// Rendering object for the one spline segment
  //
  class Spline2SS : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;


    Spline2SS() : super_t()
    {
    }

    virtual ~Spline2SS();

    virtual detail::DrawSegment *createDrawSeg(int nstart, int nend);

  };


  ////////////////////////////////////////////////////////
  //
  // Spline Renderer version 2 class (platform independent)
  //

  class Spline2Renderer : public SplineRendBase
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef SplineRendBase super_t;

    ////////////////////////////
    // Properties

  private:
    /// width of line drawing (in pixel unit)
    float m_dLineWidth;

  public:
    void setLineWidth(float d) {
      super_t::invalidateDisplayCache();
      m_dLineWidth = d;
    }
    float getLineWidth() const {
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

    // virtual void propChanged(qlib::LPropEvent &ev);

    // virtual void objectChanged(qsys::ObjectEvent &ev);


  public:
    /////////////////
    // Common implementation

    // virtual void createSegList(DisplayContext *pdc);

    virtual SplineSegment *createSegment();

    /////////////////
    // VBO implementation

    virtual void setupVBO(detail::SplineSegment *pSeg);

    virtual void updateCrdVBO(detail::SplineSegment *pSeg);

    virtual void updateColorVBO(detail::SplineSegment *pSeg);

    virtual void drawVBO(detail::SplineSegment *pSeg, DisplayContext *pdc);

  };

}

#endif


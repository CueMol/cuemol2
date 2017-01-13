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

/*
#ifdef WIN32
#define USE_TBO 1
#define USE_INSTANCED 1
#else
#endif

namespace sysdep {
  class OglProgramObject;
}

namespace gfx {
  class Texture;
}
*/

namespace molvis {

  using qlib::Vector4D;
  using qlib::Vector3F;
  using gfx::ColorPtr;
  using namespace molstr;

  class Spline2Renderer;
  class Spline2Seg;

  class Spl2DrawSeg : public detail::DrawSegment
  {
  public:

    typedef detail::DrawSegment super_t;

    Spl2DrawSeg(int st, int en) : super_t(st,en), m_pVBO(NULL)
    {
    }

    virtual ~Spl2DrawSeg();

    //////////
    // VBO implementation

    typedef gfx::DrawElemVC VertArray;

    /// cached vertex array/VBO
    VertArray *m_pVBO;

  };

  //
  /// Rendering object for the one spline segment
  //
  class Spline2Seg : public detail::SplineSegment
  {
  public:

    typedef detail::SplineSegment super_t;

    typedef std::deque<Spl2DrawSeg *> DrawList;
    DrawList m_draws;

    Spline2Seg() : super_t()
    {
    }

    virtual ~Spline2Seg();

    virtual void generateImpl(int nstart, int nend);

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

    // virtual void propChanged(qlib::LPropEvent &ev);

    virtual void objectChanged(qsys::ObjectEvent &ev);


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


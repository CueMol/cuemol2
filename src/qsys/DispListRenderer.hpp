// -*-Mode: C++;-*-
//
// Adoptor class for renderers with display list cache support
//
// $Id: DispListRenderer.hpp,v 1.7 2011/04/17 06:16:17 rishitani Exp $
//

#ifndef QSYS_DISPLIST_RENDERER_HPP_INCLUDE_
#define QSYS_DISPLIST_RENDERER_HPP_INCLUDE_

#include "qsys.hpp"

#include "DispCacheRenderer.hpp"

namespace gfx {
  class DisplayContext;
}

namespace qsys {

  using gfx::DisplayContext;

  ///
  ///  Adoptor class for renderers with display list cache support
  ///
  class QSYS_API DispListRenderer : public DispCacheRenderer
  {
    // MC_SCRIPTABLE;

  private:
    typedef DispCacheRenderer super_t;

    DispListCacheImpl m_dlcache;

  public:

    DispListRenderer();
    DispListRenderer(const DispListRenderer &r);
    virtual ~DispListRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void display(DisplayContext *pdc);

    virtual void invalidateDisplayCache();

    //
    // Hittest implementation
    //

    /// render Hittest object
    virtual void displayHit(DisplayContext *pdc);

    virtual void invalidateHittestCache();

  };
}

#if 0
#include "Renderer.hpp"

namespace gfx {
  class DisplayContext;
}

namespace qsys {

  using gfx::DisplayContext;

  /**
     Abstract class for renderers with display list cache support
  */
  class QSYS_API DispListRenderer : public Renderer
  {
    // MC_SCRIPTABLE;

  private:
    typedef Renderer super_t;

    DisplayContext *m_pdl;
    DisplayContext *m_phl;

  public:

    DispListRenderer();
    DispListRenderer(const DispListRenderer &r);
    virtual ~DispListRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void display(DisplayContext *pdc);

    virtual void invalidateDisplayCache();

    virtual void unloading();

    // virtual const char *getTypeName() const;
    // virtual LString toString() const;

    //
    // Hittest implementation
    //

    /** render Hittest object */
    virtual void displayHit(DisplayContext *pdc);

    virtual void invalidateHittestCache();

    ///////////////////////////////////////
    // DispListRenderer rendering interface

    virtual void preRender(DisplayContext *pdc);
    virtual void postRender(DisplayContext *pdc);
    virtual void render(DisplayContext *pdl) =0;

    virtual void renderHit(DisplayContext *phl);

    /// object changed event (--> call invalidate if required)
    virtual void objectChanged(ObjectEvent &ev);

    virtual void propChanged(qlib::LPropEvent &ev);

    /// Style event listener
    virtual void styleChanged(StyleEvent &);
    
    /// Scene event listener (for detecting color profile change)
    virtual void sceneChanged(SceneEvent &ev);
    
  private:
    bool m_bShaderAlpha;

  public:
    bool useShaderAlpha() const {
      return m_bShaderAlpha;
    }
  };
}

#endif

#endif


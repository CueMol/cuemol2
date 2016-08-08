// -*-Mode: C++;-*-
//
// Adaptor class for renderers with display cache support
//

#ifndef QSYS_DISPCACHE_RENDERER_HPP_INCLUDE_
#define QSYS_DISPCACHE_RENDERER_HPP_INCLUDE_

#include "qsys.hpp"
#include "Renderer.hpp"

namespace gfx {
  class DisplayContext;
}

namespace qsys {

  using gfx::DisplayContext;

  ///
  ///  Adaptor class for renderers with display cache support
  ///
  class QSYS_API DispCacheRenderer : public Renderer
  {
    // MC_SCRIPTABLE;

  private:
    typedef Renderer super_t;

  public:

    DispCacheRenderer();
    DispCacheRenderer(const DispCacheRenderer &r);
    virtual ~DispCacheRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void unloading();

    ///////////////////////////////////////
    // DispCacheRenderer rendering interface

    /// Render the display cache
    virtual void render(DisplayContext *pdl) =0;

    /// Callback method before the cache creation
    virtual void preRender(DisplayContext *pdc);

    /// Callback method after the cache creation
    virtual void postRender(DisplayContext *pdc);

    /// Invalidate the display cache
    virtual void invalidateDisplayCache();

    /// Render the hittest display cache
    virtual void renderHit(DisplayContext *phl);

    /// Invalidate the hittest display cache
    virtual void invalidateHittestCache();

    ///////////////////////////////////////
    // Event handling

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

  //
  //  Implementation of cache using display list
  //

  class QSYS_API DispListCacheImpl
  {
  private:

    /// Display list for drawing
    DisplayContext *m_pdl;

    /// Display list for hittest
    DisplayContext *m_phl;

  public:

    DispListCacheImpl();
    virtual ~DispListCacheImpl();

    /// 
    void display(DisplayContext *pdc, DispCacheRenderer *pOuter);

    /// Invalidate both display list and hittest display list
    void invalidate();

    void displayHit(DisplayContext *pdc, DispCacheRenderer *pOuter);

    /// Invalidate only the hittest display list
    void invalidateHit();

  };

  
}

#endif


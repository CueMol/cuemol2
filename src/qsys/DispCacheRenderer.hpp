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

  class DispCacheRenderer;

  class QSYS_API AbstDispCacheImpl
  {
  public:
    virtual ~AbstDispCacheImpl() {}

    virtual void display(DisplayContext *pdc, DispCacheRenderer *pOuter) =0;
    virtual void invalidate() =0;

    virtual void displayHit(DisplayContext *pdc, DispCacheRenderer *pOuter) =0;

    /// Invalidate only the hittest display list
    virtual void invalidateHit() =0;
  };

  ///
  ///  Adaptor class for renderers with display cache support
  ///
  class QSYS_API DispCacheRenderer : public Renderer
  {
    // MC_SCRIPTABLE;

  private:
    typedef Renderer super_t;

    AbstDispCacheImpl *m_pCacheImpl;

  public:
    AbstDispCacheImpl *getDispCacheImpl() const { return m_pCacheImpl; }
    // void setDispCacheImpl(AbstDispCacheImpl *pImpl) { m_pCacheImpl = pImpl; }

  public:

    DispCacheRenderer(AbstDispCacheImpl *pImpl);
    DispCacheRenderer(const DispCacheRenderer &r, AbstDispCacheImpl *pImpl);
    virtual ~DispCacheRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    virtual void unloading();

    virtual void display(DisplayContext *pdc);

    virtual void displayHit(DisplayContext *pdc);

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
    // ver2 interface

    /// Use ver2 interface (default: false)
    virtual bool isUseVer2Iface() const;

    /// Initialize & setup capabilities (default: do nothing)
    virtual bool init(DisplayContext *pdc);
    
    /// Render to display (version 2)
    virtual void display2(DisplayContext *pdc);

    virtual void createDisplayCache();

    virtual bool isCacheAvail() const;

    /// Render to display
    virtual void render2(DisplayContext *pdc);

    virtual void renderVBO(DisplayContext *pdc);
    virtual void renderGLSL(DisplayContext *pdc);

    /// Render to file
    virtual void renderFile(DisplayContext *pdc);

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

}

#endif


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

  //
  //  Implementation of cache using display list
  //
  class QSYS_API DispListCacheImpl : public AbstDispCacheImpl
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

  
  ///
  ///  Adoptor class for renderers with display list cache support
  ///
  class QSYS_API DispListRenderer : public DispCacheRenderer
  {
    // MC_SCRIPTABLE;

  private:
    typedef DispCacheRenderer super_t;

    // DispListCacheImpl m_dlcache;

  public:

    DispListRenderer();
    DispListRenderer(const DispListRenderer &r);
    virtual ~DispListRenderer();

    //////////////////////////////////////////////////////
    // Renderer implementation

    // virtual void display(DisplayContext *pdc);

    // virtual void invalidateDisplayCache();

    //
    // Hittest implementation
    //

    /// render Hittest object
    // virtual void displayHit(DisplayContext *pdc);

    // virtual void invalidateHittestCache();

  };
}

#endif


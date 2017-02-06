// -*-Mode: C++;-*-
//
//  Adoptor class for renderers with display cache support
//

#include <common.h>

#include "DispCacheRenderer.hpp"
#include "Scene.hpp"
#include <gfx/DisplayContext.hpp>

using namespace qsys;
using gfx::DisplayContext;

DispCacheRenderer::DispCacheRenderer(AbstDispCacheImpl *pImpl)
     : super_t()
{
  m_pCacheImpl = pImpl;
  m_bShaderAlpha = View::hasVS();
}

DispCacheRenderer::DispCacheRenderer(const DispCacheRenderer &r, AbstDispCacheImpl *pImpl)
  : super_t(r)
{
  m_pCacheImpl = pImpl;
  m_bShaderAlpha = View::hasVS();
}

DispCacheRenderer::~DispCacheRenderer()
{
  invalidateDisplayCache();
  invalidateHittestCache();
  //if (m_pCacheImpl!=NULL)
  delete m_pCacheImpl;
}

void DispCacheRenderer::unloading()
{
  invalidateDisplayCache();
  invalidateHittestCache();
}

void DispCacheRenderer::display(DisplayContext *pdc)
{
  m_pCacheImpl->display(pdc, this);
}


//////////

void DispCacheRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void DispCacheRenderer::postRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void DispCacheRenderer::invalidateDisplayCache()
{
  m_pCacheImpl->invalidate();

  // Display cache invalidated
  //   --> the scene to be redrawn
  ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();
}

////////////////////////////
// Hittest implementation
//

void DispCacheRenderer::displayHit(DisplayContext *pdc)
{
  m_pCacheImpl->displayHit(pdc, this);
}

void DispCacheRenderer::invalidateHittestCache()
{
  m_pCacheImpl->invalidateHit();
}

void DispCacheRenderer::renderHit(DisplayContext *phl)
{
}

void DispCacheRenderer::objectChanged(ObjectEvent &ev)
{
  // Default implementation:
  //   Treat changed and changed_dynamic events as the same
  if (ev.getType()==ObjectEvent::OBE_CHANGED ||
      ev.getType()==ObjectEvent::OBE_CHANGED_DYNAMIC) {
    invalidateDisplayCache();
  }
}

void DispCacheRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (!m_bShaderAlpha) {
    if (ev.getName().equals("alpha") ||
        ev.getName().equals("material"))
      invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void DispCacheRenderer::styleChanged(StyleEvent &ev)
{
  super_t::styleChanged(ev);
  invalidateDisplayCache();
}

void DispCacheRenderer::sceneChanged(SceneEvent &ev)
{
  super_t::sceneChanged(ev);
  if (ev.getType()==SceneEvent::SCE_SCENE_PROPCHG) {
    if (ev.getDescr()=="icc_filename" ||
        ev.getDescr()=="use_colproof" ||
        ev.getDescr()=="icc_intent" ) {
      invalidateDisplayCache();
    }
  }
}



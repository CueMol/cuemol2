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

DispCacheRenderer::DispCacheRenderer()
  : super_t()
{
  m_bShaderAlpha = View::hasVS();
}

DispCacheRenderer::DispCacheRenderer(const DispCacheRenderer &r)
  : super_t(r)
{
}

DispCacheRenderer::~DispCacheRenderer()
{
  invalidateDisplayCache();
  invalidateHittestCache();
}

void DispCacheRenderer::unloading()
{
  invalidateDisplayCache();
  invalidateHittestCache();
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
  // Display cache invalidated
  //   --> the scene to be redrawn
  ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();
}

////////////////////////////
// Hittest implementation
//

void DispCacheRenderer::invalidateHittestCache()
{
}

void DispCacheRenderer::renderHit(DisplayContext *phl)
{
}

void DispCacheRenderer::objectChanged(ObjectEvent &ev)
{
  if (ev.getType()==ObjectEvent::OBE_CHANGED) {
    // atom pos etc. changed
    //  --> update both display and hittest
    invalidateDisplayCache();
    MB_DPRINTLN("XXX DispCacheRenderer::objectChanged> CALL invalidateHittestCache()");
    invalidateHittestCache();
  }
  else if (ev.getType()==qsys::ObjectEvent::OBE_PROPCHG) {
    qlib::LPropEvent *pPE = ev.getPropEvent();
    if (pPE && pPE->getName().equals("xformMat")) {
      invalidateDisplayCache();
    }
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


////////////////////////////////////////////////////////////
//
//  Implementation of cache using display list
//

DispListCacheImpl::DispListCacheImpl()
     : m_pdl(NULL), m_phl(NULL)
{
}

DispListCacheImpl::~DispListCacheImpl()
{
}

void DispListCacheImpl::display(DisplayContext *pdc, DispCacheRenderer *pOuter)
{
  // check display list cache
  if (m_pdl==NULL) {
    // cache was invalidated  --> create new display list
    if (pdc->canCreateDL()) {
      m_pdl = pdc->createDisplayList();
      // render to the new DL
      m_pdl->recordStart();
      pOuter->render(m_pdl);
      m_pdl->recordEnd();

      pOuter->preRender(pdc);
      pdc->callDisplayList(m_pdl);
      pOuter->postRender(pdc);
      return;
    }
    else {
      // pdc can't create DL --> render directly
      pOuter->preRender(pdc);
      pOuter->render(pdc);
      pOuter->postRender(pdc);
      return;
    }
  }
  else {
    // cached DL exists...

    // check DL compatibility
    if (pdc->isCompatibleDL(m_pdl)) {
      // compatible DL
      //  --> display using display list
      pOuter->preRender(pdc);
      pdc->callDisplayList(m_pdl);
      pOuter->postRender(pdc);
      return;
    }
    else {
      // incompatible DL --> render directly
      pOuter->preRender(pdc);
      pOuter->render(pdc);
      pOuter->postRender(pdc);
      return;
    }
  }
}

void DispListCacheImpl::invalidate()
{
  if (m_pdl!=NULL)
    delete m_pdl;
  m_pdl = NULL;

  if (m_phl!=NULL)
    delete m_phl;
  m_phl = NULL;
}

void DispListCacheImpl::displayHit(DisplayContext *pdc, DispCacheRenderer *pOuter)
{
  // check hittest display list cache
  if (m_phl==NULL) {
    if (pdc->canCreateDL()) {
      // Cache does not exist
      //  --> create new display list.
      m_phl = pdc->createDisplayList();

      // render to the new DL
      m_phl->recordStart();
      pOuter->renderHit(m_phl);
      m_phl->recordEnd();

      // render by the created display list
      pdc->callDisplayList(m_phl);
      return;
    }
    else {
      // pdc can't create DL --> render directly
      pOuter->renderHit(pdc);
      return;
    }
  }
  else {
    if (pdc->isCompatibleDL(m_phl)) {
      // render by existing (&compatible) display list
      pdc->callDisplayList(m_phl);
      return;
    }
    else {
      // incompatible DL --> render directly
      pOuter->renderHit(pdc);
      return;
    }
  }
}

void DispListCacheImpl::invalidateHit()
{
  if (m_phl!=NULL)
    delete m_phl;
  m_phl = NULL;
}


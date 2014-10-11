// -*-Mode: C++;-*-
//
//  Abstract class for renderers with display list cache support
//
//  $Id: DispListRenderer.cpp,v 1.7 2011/04/17 06:16:17 rishitani Exp $

#include <common.h>

#include "DispListRenderer.hpp"
#include "Scene.hpp"
#include <gfx/DisplayContext.hpp>

using namespace qsys;
using gfx::DisplayContext;

DispListRenderer::DispListRenderer()
  : super_t(), m_pdl(NULL), m_phl(NULL)
{
  //ViewCap *pVC = View::getViewCap();
  m_bShaderAlpha = View::hasVS();
}

DispListRenderer::DispListRenderer(const DispListRenderer &r)
  : super_t(r), m_pdl(NULL), m_phl(NULL)
{
}

DispListRenderer::~DispListRenderer()
{
  invalidateDisplayCache();
  invalidateHittestCache();
}

void DispListRenderer::unloading()
{
  invalidateDisplayCache();
  invalidateHittestCache();
}

//////////

void DispListRenderer::display(DisplayContext *pdc)
{
  /*
      preRender(pdc);
      render(pdc);
      postRender(pdc);
      return;
  */

  // check display list cache
  if (m_pdl==NULL) {
    // cache was invalidated  --> create new display list
    if (pdc->canCreateDL()) {
      m_pdl = pdc->createDisplayList();
      // render to the new DL
      m_pdl->recordStart();
      render(m_pdl);
      m_pdl->recordEnd();

      preRender(pdc);
      pdc->callDisplayList(m_pdl);
      postRender(pdc);
      return;
    }
    else {
      // pdc can't create DL --> render directly
      preRender(pdc);
      render(pdc);
      postRender(pdc);
      return;
    }
  }
  else {
    // cached DL exists...

    // check DL compatibility
    if (pdc->isCompatibleDL(m_pdl)) {
      // compatible DL
      //  --> display using display list
      preRender(pdc);
      pdc->callDisplayList(m_pdl);
      postRender(pdc);
      return;
    }
    else {
      // incompatible DL --> render directly
      preRender(pdc);
      render(pdc);
      postRender(pdc);
      return;
    }
  }

}

void DispListRenderer::preRender(DisplayContext *pdc)
{
  pdc->setLighting(true);
}

void DispListRenderer::postRender(DisplayContext *pdc)
{
  pdc->setLighting(false);
}

void DispListRenderer::invalidateDisplayCache()
{
  if (m_pdl!=NULL)
    delete m_pdl;
  m_pdl = NULL;

  if (m_phl!=NULL)
    delete m_phl;
  m_phl = NULL;

  // to be redrawn
  ScenePtr pScene = getScene();
  if (!pScene.isnull())
    pScene->setUpdateFlag();
}

////////////////////////////
// Hittest implementation
//

void DispListRenderer::invalidateHittestCache()
{
  if (m_phl!=NULL)
    delete m_phl;
  m_phl = NULL;
}

void DispListRenderer::displayHit(DisplayContext *pdc)
{
  // check hittest display list cache
  if (m_phl==NULL) {
    if (pdc->canCreateDL()) {
      // Cache does not exist
      //  --> create new display list.
      m_phl = pdc->createDisplayList();

      // render to the new DL
      m_phl->recordStart();
      renderHit(m_phl);
      m_phl->recordEnd();

      // render by the created display list
      pdc->callDisplayList(m_phl);
      return;
    }
    else {
      // pdc can't create DL --> render directly
      renderHit(pdc);
      return;
    }
  }
  else {
    if (pdc->isCompatibleDL(m_pdl)) {
      // render by existing (&compatible) display list
      pdc->callDisplayList(m_phl);
      return;
    }
    else {
      // incompatible DL --> render directly
      renderHit(pdc);
      return;
    }
  }
}

void DispListRenderer::renderHit(DisplayContext *phl)
{
}

/*
bool DispListRenderer::isHitTestSupported() const
{
  return true;
}
*/

void DispListRenderer::objectChanged(ObjectEvent &ev)
{
  if (ev.getType()==ObjectEvent::OBE_CHANGED) {
    invalidateDisplayCache();
  }
}

void DispListRenderer::propChanged(qlib::LPropEvent &ev)
{
  if (!m_bShaderAlpha) {
    if (ev.getName().equals("alpha") ||
        ev.getName().equals("material"))
      invalidateDisplayCache();
  }

  super_t::propChanged(ev);
}

void DispListRenderer::styleChanged(StyleEvent &ev)
{
  super_t::styleChanged(ev);
  invalidateDisplayCache();
}


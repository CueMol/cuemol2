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
     : super_t(MB_NEW DispListCacheImpl())
{
}

DispListRenderer::DispListRenderer(const DispListRenderer &r)
     : super_t(r, MB_NEW DispListCacheImpl())
{
}

DispListRenderer::~DispListRenderer()
{
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



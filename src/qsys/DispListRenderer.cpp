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
  : super_t(), m_dlcache()
{
}

DispListRenderer::DispListRenderer(const DispListRenderer &r)
     : super_t(r), m_dlcache()
{
}

DispListRenderer::~DispListRenderer()
{
}

//////////

void DispListRenderer::display(DisplayContext *pdc)
{
  m_dlcache.display(pdc, this);
}

void DispListRenderer::invalidateDisplayCache()
{
  m_dlcache.invalidate();
  super_t::invalidateDisplayCache();
}

////////////////////////////
// Hittest implementation
//

void DispListRenderer::displayHit(DisplayContext *pdc)
{
  m_dlcache.displayHit(pdc, this);
}

void DispListRenderer::invalidateHittestCache()
{
  m_dlcache.invalidateHit();
  super_t::invalidateHittestCache();
}


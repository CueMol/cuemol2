// -*-Mode: C++;-*-
//
//  Rectangle-selection drawing object (for UI)
//
// $Id: RectSelDrawObj.cpp,v 1.3 2010/12/10 09:17:20 rishitani Exp $

#include <common.h>
#include "RectSelDrawObj.hpp"

#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>

using namespace molstr;

RectSelDrawObj::RectSelDrawObj()
{
  m_color = gfx::SolidColor::createRGB(0.2, 0.8, 1.0);
  m_colorPaint = gfx::SolidColor::createRGB(0.2, 0.8, 1.0, 0.5);
  m_bStart = false;
}

RectSelDrawObj::~RectSelDrawObj()
{
}

void RectSelDrawObj::display(DisplayContext *pdc)
{
/*
  pdc->color(m_color);
  pdc->setLineWidth(4.0);
  pdc->startLines();

  data_t::const_iterator iter = m_data.begin();
  data_t::const_iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    const Vector4D &pos = *iter;
    pdc->drawAster(pos, 0.25f);
  }

  pdc->end();
*/
}

void RectSelDrawObj::display2D(DisplayContext *pdc)
{
  if (!m_bStart)
    return;

  int x = getLeft();
  int y = getTop();
  int w = getWidth();
  int h = getHeight();

  if (w==0||h==0)
    return;

  pdc->color(m_color);
  pdc->setLineWidth(1.0);
  pdc->startLineStrip();
  pdc->vertex( Vector4D(x, y, 0) );
  pdc->vertex( Vector4D(x+w, y, 0) );
  pdc->vertex( Vector4D(x+w, y+h, 0) );
  pdc->vertex( Vector4D(x, y+h, 0) );
  pdc->vertex( Vector4D(x, y, 0) );
  pdc->end();

  pdc->color(m_colorPaint);
  pdc->startPolygon();
  pdc->vertex( Vector4D(x, y, 0) );
  pdc->vertex( Vector4D(x+w, y, 0) );
  pdc->vertex( Vector4D(x+w, y+h, 0) );
  pdc->vertex( Vector4D(x, y+h, 0) );
  pdc->end();
}

void RectSelDrawObj::setEnabled(bool f)
{
  super_t::setEnabled(f);

  if (!f)
    m_bStart = false;
}

void RectSelDrawObj::start(int x, int y)
{
  m_bStart = true;
  m_nStartX = x;
  m_nStartY = y;
  m_nEndX = x;
  m_nEndY = y;
}

void RectSelDrawObj::move(int x, int y)
{
  m_nEndX = x;
  m_nEndY = y;
}

void RectSelDrawObj::end()
{
  m_bStart = false;
}


// -*-Mode: C++;-*-
//
//  Rectangle-selection drawing object (for UI)
//
// $Id: RectSelDrawObj.cpp,v 1.3 2010/12/10 09:17:20 rishitani Exp $

#include <common.h>
#include "RectSelDrawObj.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/DrawObjSet.hpp>
#include <qsys/SceneManager.hpp>

namespace molstr {

RectSelDrawObj::RectSelDrawObj()
{
    m_color = gfx::SolidColor::createRGB(0.2, 0.8, 1.0);
    m_colorPaint = gfx::SolidColor::createRGB(0.2, 0.8, 1.0, 0.5);
    m_bStart = false;
}

RectSelDrawObj::~RectSelDrawObj() {}

bool RectSelDrawObj::init(DisplayContext *pdc)
{
    if (m_pdata != nullptr) {
        return true;
    }

    // Initialize the draw object set
    m_pdata = pdc->createDrawObjSet();

    m_pdata->allocLines(4);
    const float dsize = 20.0f;

    m_pdata->setLineWidth(1.0f);
    m_pdata->setNoDepth(true);
    // m_pdata->setLine(0, Vector4D(0, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
    // m_pdata->setLine(1, Vector4D(0, 0, 0), ccode, Vector4D(0, dsize, 0), ccode);
    // m_pdata->setLine(2, Vector4D(0, 0, 0), ccode, Vector4D(0, 0, dsize), ccode);

    return true;
}

void RectSelDrawObj::display(DisplayContext *pdc, qsys::ViewPtr pView) {}

void RectSelDrawObj::display2D(DisplayContext *pdc, qsys::ViewPtr pView)
{
    if (!m_bStart) return;

    if (!init(pdc)) return;

    int x = getLeft();
    int y = getTop();
    int w = getWidth();
    int h = getHeight();

    if (w == 0 || h == 0) return;

    m_pdata->setLine(0, Vector4D(x, y, 0), m_color, Vector4D(x + w, y, 0), m_color);
    m_pdata->setLine(1, Vector4D(x + w, y, 0), m_color, Vector4D(x + w, y + h, 0), m_color);
    m_pdata->setLine(2, Vector4D(x + w, y + h, 0), m_color, Vector4D(x, y + h, 0), m_color);
    m_pdata->setLine(3, Vector4D(x, y + h, 0), m_color, Vector4D(x, y, 0), m_color);
    m_pdata->setLineUpdated(true);
    
    pdc->drawObjSet(*m_pdata);

    // pdc->color(m_color);
    // pdc->setLineWidth(1.0);
    // pdc->startLineStrip();
    // pdc->vertex(Vector4D(x, y, 0));
    // pdc->vertex(Vector4D(x + w, y, 0));
    // pdc->vertex(Vector4D(x + w, y + h, 0));
    // pdc->vertex(Vector4D(x, y + h, 0));
    // pdc->vertex(Vector4D(x, y, 0));
    // pdc->end();

    // pdc->color(m_colorPaint);
    // pdc->startPolygon();
    // pdc->vertex(Vector4D(x, y, 0));
    // pdc->vertex(Vector4D(x + w, y, 0));
    // pdc->vertex(Vector4D(x + w, y + h, 0));
    // pdc->vertex(Vector4D(x, y + h, 0));
    // pdc->end();
}

void RectSelDrawObj::setEnabled(bool f)
{
    super_t::setEnabled(f);

    if (!f) m_bStart = false;
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

}  // namespace molstr

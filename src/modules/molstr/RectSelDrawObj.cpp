// -*-Mode: C++;-*-
//
//  Rectangle-selection drawing object (for UI)
//
// $Id: RectSelDrawObj.cpp,v 1.3 2010/12/10 09:17:20 rishitani Exp $

#include <common.h>
#include "RectSelDrawObj.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/GpuPrim.hpp>
#include <qsys/View.hpp>

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
    if (m_linePrim.isValid())
        return true;

    if (!m_linePrim.init(pdc) || !m_trigPrim.init(pdc))
        return false;

    m_linePrim.alloc(4);
    m_linePrim.setLineWidth(1.0f);
    m_linePrim.setNoDepth(true);

    m_trigPrim.alloc(4, 2);
    m_trigPrim.setFace(0, 0, 2, 1);
    m_trigPrim.setFace(1, 2, 0, 3);
    m_trigPrim.setNoDepth(true);

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

    auto nSceneID = pView->getSceneID();
    auto cc = m_color->getDevCode(nSceneID);
    auto ccPaint = m_colorPaint->getDevCode(nSceneID);

    m_linePrim.setLine(0, Vector4D(x, y, 0), cc, Vector4D(x + w, y, 0), cc);
    m_linePrim.setLine(1, Vector4D(x + w, y, 0), cc, Vector4D(x + w, y + h, 0), cc);
    m_linePrim.setLine(2, Vector4D(x + w, y + h, 0), cc, Vector4D(x, y + h, 0), cc);
    m_linePrim.setLine(3, Vector4D(x, y + h, 0), cc, Vector4D(x, y, 0), cc);
    m_linePrim.setUpdated(true);

    m_trigPrim.setVertex(0, Vector4D(x, y, 0));
    m_trigPrim.setVertex(1, Vector4D(x + w, y, 0));
    m_trigPrim.setVertex(2, Vector4D(x + w, y + h, 0));
    m_trigPrim.setVertex(3, Vector4D(x, y + h, 0));
    m_trigPrim.setColor(0, ccPaint);
    m_trigPrim.setColor(1, ccPaint);
    m_trigPrim.setColor(2, ccPaint);
    m_trigPrim.setColor(3, ccPaint);
    m_trigPrim.setUpdated(true);

    m_linePrim.draw(pdc);
    m_trigPrim.draw(pdc);
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

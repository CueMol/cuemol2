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
    m_pdata->setLineWidth(1.0f);

    m_pdata->allocTrigMesh(4, 2);
    m_pdata->setTrigMeshFace(0, 0, 2, 1);
    m_pdata->setTrigMeshFace(1, 2, 0, 3);

    m_pdata->setNoDepth(true);

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
    
    m_pdata->setTrigMeshVertex(0, Vector4D(x, y, 0));
    m_pdata->setTrigMeshVertex(1, Vector4D(x + w, y, 0));
    m_pdata->setTrigMeshVertex(2, Vector4D(x + w, y + h, 0));
    m_pdata->setTrigMeshVertex(3, Vector4D(x, y + h, 0));
    m_pdata->setTrigMeshColor(0, m_colorPaint);
    m_pdata->setTrigMeshColor(1, m_colorPaint);
    m_pdata->setTrigMeshColor(2, m_colorPaint);
    m_pdata->setTrigMeshColor(3, m_colorPaint);
    m_pdata->setTrigMeshUpdated(true);

    pdc->drawObjSet(*m_pdata);
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

// -*-Mode: C++;-*-

#include <common.h>
#include "CenterMarkDrawObj.hpp"

#include "Camera.hpp"
#include "View.hpp"
#include <gfx/DisplayContext.hpp>

namespace qsys {

CenterMarkDrawObj::CenterMarkDrawObj() : super_t(), m_nCenterMark(Camera::CCM_CROSS) {}

void CenterMarkDrawObj::setCenterMark(int nMode)
{
    if (m_nCenterMark == nMode) return;

    m_nCenterMark = nMode;
    m_linePrim.invalidate();
}

bool CenterMarkDrawObj::initPrim(gfx::DisplayContext *pdc)
{
    if (m_linePrim.isValid()) return true;

    if (m_nCenterMark == Camera::CCM_NONE) return true;

    if (!m_linePrim.init(pdc)) {
        MB_DPRINTLN("CenterMarkDrawObj::initPrim() shader init failed");
        return false;
    }

    const qlib::quint32 ccode = 0xFFFFFFFF;  // White color

    float linew = 1.0f;

    linew *= pdc->getPixSclFac();

    if (m_nCenterMark == Camera::CCM_AXIS) {
        m_linePrim.alloc(3);
        const float dsize = 20.0f;
        m_linePrim.setLineWidth(linew);
        m_linePrim.setNoDepth(true);
        m_linePrim.setLine(0, Vector4D(0, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
        m_linePrim.setLine(1, Vector4D(0, 0, 0), ccode, Vector4D(0, dsize, 0), ccode);
        m_linePrim.setLine(2, Vector4D(0, 0, 0), ccode, Vector4D(0, 0, dsize), ccode);

    } else if (m_nCenterMark == Camera::CCM_CROSS) {
        m_linePrim.alloc(2);
        const float dsize = 10.0f;
        m_linePrim.setLineWidth(linew);
        m_linePrim.setNoDepth(true);
        m_linePrim.setLine(0, Vector4D(-dsize, 0, 0), ccode, Vector4D(dsize, 0, 0),
                           ccode);
        m_linePrim.setLine(1, Vector4D(0, -dsize, 0), ccode, Vector4D(0, dsize, 0),
                           ccode);

    } else {
        MB_DPRINTLN("CenterMarkDrawObj::initPrim() unknown mode: %d", m_nCenterMark);
        m_linePrim.invalidate();
        return false;
    }

    MB_DPRINTLN("CenterMarkDrawObj::initPrim() OK");
    return true;
}

void CenterMarkDrawObj::display(gfx::DisplayContext *pdc, ViewPtr pView)
{
    if (m_nCenterMark != Camera::CCM_AXIS) return;

    if (!initPrim(pdc)) return;

    pdc->pushMatrix();
    pdc->translate(pView->getViewCenter());
    auto projMat = pdc->getProjMat();

    const double cx = pView->getWidth();
    const double cy = pView->getHeight();
    const double fasp = cx / cy;
    const double vw = cy / 2.0;
    const double slabnear = 150;
    const double slabfar = 250;
    pdc->setProjMat(gfx::DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar));

    pdc->setInvertColorBlend(true);
    m_linePrim.draw(pdc);
    pdc->setInvertColorBlend(false);

    pdc->setProjMat(projMat);
    pdc->popMatrix();
}

void CenterMarkDrawObj::display2D(gfx::DisplayContext *pdc, ViewPtr pView)
{
    if (m_nCenterMark != Camera::CCM_CROSS) return;

    if (!initPrim(pdc)) return;

    const double cx = pView->getWidth();
    const double cy = pView->getHeight();

    pdc->pushMatrix();
    pdc->translate(Vector4D(cx / 2.0, cy / 2.0, 0));

    pdc->setInvertColorBlend(true);
    m_linePrim.draw(pdc);
    pdc->setInvertColorBlend(false);

    pdc->popMatrix();
}

}  // namespace qsys

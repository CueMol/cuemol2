// -*-Mode: C++;-*-

#include <common.h>
#include "CenterMarkDrawObj.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/DrawObjElems.hpp>
#include <qsys/SceneManager.hpp>

namespace sysdep {

using gfx::DisplayContext;

CenterMarkDrawObj::CenterMarkDrawObj()
    : super_t(), m_pdata(nullptr), m_nCenterMark(qsys::Camera::CCM_CROSS)
{
}

CenterMarkDrawObj::~CenterMarkDrawObj() {}

void CenterMarkDrawObj::setCenterMark(int nMode)
{
    if (m_nCenterMark == nMode)
        return;

    m_nCenterMark = nMode;

    if (m_pdata != nullptr) {
        delete m_pdata;
        m_pdata = nullptr;
    }
}

bool CenterMarkDrawObj::init(DisplayContext* pdc)
{
    if (m_pdata != nullptr) {
        return true;
    }

    if (m_nCenterMark == qsys::Camera::CCM_NONE) {
        MB_DPRINTLN("CenterMarkDrawObj::init() CCM_NONE !!!!!");
        return true;
    }

    // Initialize the center mark drawing object
    m_pdata = pdc->createDrawObjSet();

    const qlib::quint32 ccode = 0xFFFFFFFF;  // White color

    if (m_nCenterMark == qsys::Camera::CCM_AXIS) {
        // 3D axis
        m_pdata->allocLines(3);
        const float dsize = 20.0f;

        m_pdata->setLineWidth(1.0f);
        m_pdata->setNoDepth(true);
        m_pdata->setLine(0, Vector4D(0, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
        m_pdata->setLine(1, Vector4D(0, 0, 0), ccode, Vector4D(0, dsize, 0), ccode);
        m_pdata->setLine(2, Vector4D(0, 0, 0), ccode, Vector4D(0, 0, dsize), ccode);

    } else if (m_nCenterMark == qsys::Camera::CCM_CROSS) {
        // 2D cross
        m_pdata->allocLines(2);
        const float dsize = 10.0f;

        m_pdata->setLineWidth(1.0f);
        m_pdata->setNoDepth(true);
        m_pdata->setLine(0, Vector4D(-dsize, 0, 0), ccode, Vector4D(dsize, 0, 0),
                         ccode);
        m_pdata->setLine(1, Vector4D(0, -dsize, 0), ccode, Vector4D(0, dsize, 0),
                         ccode);
    } else {
        MB_DPRINTLN("CenterMarkDrawObj::init(): Unknown center mark mode: %d", m_nCenterMark);
        delete m_pdata;
        m_pdata = nullptr;
        return false;
    }

    m_pdata->setInvertColor(true);
    MB_DPRINTLN("CenterMarkDrawObj::init() OK !!!!!");
    return true;
}

void CenterMarkDrawObj::display(DisplayContext* pdc, qsys::ViewPtr pView)
{
    if (m_nCenterMark != qsys::Camera::CCM_AXIS) {
        return;
    }

    if (!init(pdc)) {
        return;
    }

    pdc->pushMatrix();
    pdc->translate(pView->getViewCenter());
    auto projMat = pdc->getProjMat();

    const double cx = pView->getWidth();
    const double cy = pView->getHeight();
    const double fasp = cx / cy;
    const double vw = cy / 2.0;
    const double slabnear = 150;
    const double slabfar = 250;
    pdc->setProjMat(DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar));

    pdc->drawObjSet(*m_pdata);

    pdc->setProjMat(projMat);
    pdc->popMatrix();

    MB_DPRINTLN("CenterMarkDrawObj::display()");
}

void CenterMarkDrawObj::display2D(DisplayContext* pdc, qsys::ViewPtr pView)
{
    if (m_nCenterMark != qsys::Camera::CCM_CROSS) {
        return;
    }

    MB_DPRINTLN("CenterMarkDrawObj::display2D() CCM_CROSS");

    if (!init(pdc)) {
        return;
    }

    const double cx = pView->getWidth();
    const double cy = pView->getHeight();

    pdc->pushMatrix();
    pdc->translate(Vector4D(cx / 2.0, cy / 2.0, 0));
    pdc->drawObjSet(*m_pdata);
    pdc->popMatrix();
}

}  // namespace sysdep

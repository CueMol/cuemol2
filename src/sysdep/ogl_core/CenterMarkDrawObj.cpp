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

bool CenterMarkDrawObj::init(DisplayContext* pdc)
{
    if (m_pdata != nullptr) {
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
    }
    else {
        // 2D cross
        m_pdata->allocLines(2);
        const float dsize = 10.0f;

        m_pdata->setLineWidth(1.0f);
        m_pdata->setNoDepth(true);
        m_pdata->setLine(0, Vector4D(-dsize, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
        m_pdata->setLine(1, Vector4D(0, -dsize, 0), ccode, Vector4D(0, dsize, 0), ccode);
    }

    MB_DPRINTLN("CenterMarkDrawObj::init() OK !!!!!");
    return true;
}

void CenterMarkDrawObj::display(DisplayContext* pdc)
{
    if (m_nCenterMark != qsys::Camera::CCM_AXIS) {
        return;
    }

    init(pdc);
    pdc->drawObjSet(*m_pdata);
    MB_DPRINTLN("CenterMarkDrawObj::display()");
}

void CenterMarkDrawObj::display2D(DisplayContext* pdc)
{
    if (m_nCenterMark != qsys::Camera::CCM_CROSS) {
        return;
    }

    init(pdc);
    pdc->drawObjSet(*m_pdata);
    MB_DPRINTLN("CenterMarkDrawObj::display2D()");
}

}  // namespace sysdep

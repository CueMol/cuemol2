// -*-Mode: C++;-*-

#include <common.h>
#include "CenterMarkDrawObj.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/DrawObjElems.hpp>
#include <qsys/SceneManager.hpp>

namespace sysdep {

using gfx::DisplayContext;

CenterMarkDrawObj::CenterMarkDrawObj() : super_t(), m_bInitOK(false), m_pdata(nullptr)
{
}

CenterMarkDrawObj::~CenterMarkDrawObj() {}

void CenterMarkDrawObj::display(DisplayContext* pdc)
{
    init(pdc);

    pdc->drawObjSet(*m_pdata);
    MB_DPRINTLN("CenterMarkDrawObj::display()");
}

void CenterMarkDrawObj::display2D(DisplayContext* pdc) {}

bool CenterMarkDrawObj::init(DisplayContext* pdc)
{
    if (m_bInitOK) {
        return true;
    }

    // Initialize the center mark drawing object
    m_pdata = pdc->createDrawObjSet();

    m_pdata->allocLines(3);
    const float dsize = 20.0f;
    const qlib::quint32 ccode = 0xFFFFFFFF; // White color

    m_pdata->setLineWidth(2.0f);
    m_pdata->setNoDepth(true);
    m_pdata->setLine(0, Vector4D(0, 0, 0), ccode, Vector4D(dsize, 0, 0), ccode);
    m_pdata->setLine(1, Vector4D(0, 0, 0), ccode, Vector4D(0, dsize, 0), ccode);
    m_pdata->setLine(2, Vector4D(0, 0, 0), ccode, Vector4D(0, 0, dsize), ccode);

    /*
    m_pdata->assignElems({{0.0f, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {dsize, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {0.0f, dsize, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {0.0f, 0.0f, dsize, 0xFF, 0xFF, 0xFF, 0xFF}});
    // m_pdata->allocInd(6);
    m_pdata->assignInds({0, 1, 0, 2, 0, 3});
    */

    m_bInitOK = true;
    MB_DPRINTLN("CenterMarkDrawObj::init() OK !!!!!");
    return true;
}

}  // namespace sysdep

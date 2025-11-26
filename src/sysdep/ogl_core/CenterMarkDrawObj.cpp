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

    pdc->drawObjElems3D(*m_pdata);
    MB_DPRINTLN("CenterMarkDrawObj::display()");
}

void CenterMarkDrawObj::display2D(DisplayContext* pdc) {}

bool CenterMarkDrawObj::init(DisplayContext* pdc)
{
    if (m_bInitOK) {
        return true;
    }

    // Initialize the center mark drawing object
    m_pdata = pdc->createDrawObjElems3D();

    const float dsize = 10.0f;
    // m_pdata->at(0) = {0.0f, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF};
    // m_pdata->at(1) = {dsize, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF};
    // m_pdata->at(2) = {0.0f, dsize, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF};
    // m_pdata->at(3) = {0.0f, 0.0f, dsize, 0xFF, 0xFF, 0xFF, 0xFF};
    // m_pdata->alloc(4);
    m_pdata->assignElems({{0.0f, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {dsize, 0.0f, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {0.0f, dsize, 0.0f, 0xFF, 0xFF, 0xFF, 0xFF},
                          {0.0f, 0.0f, dsize, 0xFF, 0xFF, 0xFF, 0xFF}});
    // m_pdata->allocInd(6);
    m_pdata->assignInds({0, 1, 0, 2, 0, 3});

    m_bInitOK = true;
    MB_DPRINTLN("CenterMarkDrawObj::init() OK !!!!!");
    return true;
}

}  // namespace sysdep

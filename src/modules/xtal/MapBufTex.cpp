// -*-Mode: C++;-*-
//
// CPU/GPU paired buffer texture for density map display.
//

#include <common.h>

#include "MapBufTex.hpp"
#include <gfx/DisplayContext.hpp>

using namespace xtal;

void MapBufTex::create(gfx::DisplayContext *pDC)
{
    // Release previous GPU representation if any
    delete m_pRep;
    m_pRep = pDC->createBufTexRep();
    if (m_pRep == nullptr) {
        MB_DPRINTLN("MapBufTex::create> createBufTexRep() returned nullptr");
        return;
    }

    size_t sz = m_data.cols() * m_data.rows() * m_data.secs() * sizeof(quint8);
    m_pRep->create(sz, m_data.data());
    MB_DPRINTLN("MapBufTex::create> size=%zu OK", sz);
}

void MapBufTex::update()
{
    if (m_pRep == nullptr) return;

    size_t sz = m_data.cols() * m_data.rows() * m_data.secs() * sizeof(quint8);
    m_pRep->update(sz, m_data.data());
}

// -*-Mode: C++;-*-
//
// CPU/GPU paired lookup texture for density map display.
//

#include <common.h>

#include "MapBufTex.hpp"
#include <gfx/DisplayContext.hpp>

#include <cstring>
#include <vector>

using namespace xtal;

bool MapBufTex::create(gfx::DisplayContext *pDC)
{
    invalidate();

    const size_t nvox = m_data.cols() * m_data.rows() * m_data.secs();
    if (nvox == 0) return false;

    // Row-major wrap of the linear voxel index onto a TEX_WIDTH-wide texture;
    // the last row is zero padded.
    const size_t w = size_t(TEX_WIDTH);
    const size_t h = (nvox + w - 1) / w;
    if (h > size_t(MAX_TEX_HEIGHT)) {
        LOG_DPRINTLN("MapBufTex::create> region of %zu voxels exceeds the lookup texture "
                     "(%dx%d); lower the LoD budget",
                     nvox, TEX_WIDTH, MAX_TEX_HEIGHT);
        return false;
    }

    const quint8 *psrc = m_data.data();
    std::vector<quint8> padded;
    if (nvox != w * h) {
        padded.assign(w * h, 0);
        std::memcpy(padded.data(), psrc, nvox);
        psrc = padded.data();
    }

    m_pTex = pDC->createDataTexture(int(w), int(h), 1, false, psrc);
    if (m_pTex == nullptr) {
        MB_DPRINTLN("MapBufTex::create> createDataTexture() returned nullptr");
        return false;
    }

    MB_DPRINTLN("MapBufTex::create> %zu voxels as %zux%zu R8 texture OK", nvox, w, h);
    return true;
}

void MapBufTex::invalidate()
{
    delete m_pTex;
    m_pTex = nullptr;
}

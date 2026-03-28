// -*-Mode: C++;-*-
//
// CPU/GPU paired buffer texture for density map display.
// CPU side holds the current display region's voxel data (quint8 per voxel).
// GPU side is managed via gfx::BufTexRep.
//

#pragma once

#include "xtal.hpp"

#include <qlib/LTypes.hpp>
#include <qlib/ByteMap.hpp>   // qlib::Array3D
#include <gfx/PixelBuffer.hpp>   // BufTexRep

namespace gfx {
class DisplayContext;
}

namespace xtal {

/// CPU/GPU buffer texture pair for density map marching-cubes rendering.
/// GLSLMapMeshRenderer2 owns one instance of this class.
/// The renderer fills m_data with the current display subset, then calls
/// create() or update() to sync the data to the GPU.
class MapBufTex
{
public:
    typedef qlib::Array3D<quint8> DataArray;

    /// CPU-side voxel data (current display subset).
    DataArray m_data;

private:
    /// GPU-side representation (owned).
    gfx::BufTexRep *m_pRep;

public:
    MapBufTex() : m_pRep(nullptr) {}

    /// Copy constructor: copies CPU data only; GPU rep must be re-created.
    MapBufTex(const MapBufTex &src) : m_data(src.m_data), m_pRep(nullptr) {}

    ~MapBufTex() { delete m_pRep; }

    // Non-assignable
    MapBufTex &operator=(const MapBufTex &) = delete;

    /// Returns true if the GPU representation has been created.
    bool isValid() const { return m_pRep != nullptr; }

    /// Create or recreate the GPU buffer texture from current m_data contents.
    /// Call this when the buffer size changes.
    void create(gfx::DisplayContext *pDC);

    /// Update GPU buffer in-place (same size as previous create()).
    void update();

    void bind(int texUnit)
    {
        if (m_pRep) m_pRep->bind(texUnit);
    }
    void unbind()
    {
        if (m_pRep) m_pRep->unbind();
    }
};

}  // namespace xtal

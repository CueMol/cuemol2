// -*-Mode: C++;-*-
//
// CPU/GPU paired lookup texture for density map display.
// CPU side holds the current display region's voxel data (quint8 per voxel).
// GPU side is an R8 2D data texture (gfx::DataTexture): the linear voxel
// index (column fastest) wraps onto (index % TEX_WIDTH, index / TEX_WIDTH),
// which every backend supports (buffer textures do not exist in WebGL2).
//

#pragma once

#include "xtal.hpp"

#include <qlib/LTypes.hpp>
#include <qlib/ByteMap.hpp>   // qlib::Array3D
#include <gfx/DataTexture.hpp>

namespace gfx {
class DisplayContext;
}

namespace xtal {

/// CPU/GPU lookup texture pair for density map marching-cubes rendering.
/// GLSLMapMeshRenderer2 owns one instance of this class.
/// The renderer fills m_data with the current display subset, then calls
/// create() to upload it (the data texture is immutable, so every region
/// change re-creates it; the shader reads the width back with textureSize()).
class MapBufTex
{
public:
    typedef qlib::Array3D<quint8> DataArray;

    /// Width of the 2D lookup texture (texels per row)
    static constexpr int TEX_WIDTH = 4096;

    /// Largest texture height accepted (the WebGL2 / GL core minimum
    /// MAX_TEXTURE_SIZE on desktop hardware)
    static constexpr int MAX_TEX_HEIGHT = 16384;

    /// CPU-side voxel data (current display subset).
    DataArray m_data;

private:
    /// GPU-side representation (owned).
    gfx::DataTexture *m_pTex;

public:
    MapBufTex() : m_pTex(nullptr) {}

    /// Copy constructor: copies CPU data only; GPU texture must be re-created.
    MapBufTex(const MapBufTex &src) : m_data(src.m_data), m_pTex(nullptr) {}

    ~MapBufTex() { invalidate(); }

    // Non-assignable
    MapBufTex &operator=(const MapBufTex &) = delete;

    /// Returns true if the GPU texture has been created.
    bool isValid() const { return m_pTex != nullptr; }

    /// Upload the current m_data contents as the GPU lookup texture,
    /// replacing any previous one. Returns false (and leaves no texture)
    /// when the backend has no data textures or the region does not fit
    /// the texture size limit.
    bool create(gfx::DisplayContext *pDC);

    /// Release the GPU texture (CPU data kept).
    void invalidate();

    void bind(int texUnit)
    {
        if (m_pTex) m_pTex->bind(texUnit);
    }
    void unbind()
    {
        if (m_pTex) m_pTex->unbind();
    }
};

}  // namespace xtal

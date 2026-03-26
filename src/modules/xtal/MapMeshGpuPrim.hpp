// -*-Mode: C++;-*-
//
// xtal-specific GpuPrim for GPU marching-cubes map mesh rendering.
// Manages the GLSL shader and issues the instanced draw call.
//

#pragma once

#include "xtal.hpp"
#include "MapBufTex.hpp"

#include <gfx/GpuPrim.hpp>
#include <gfx/DrawAttrArray.hpp>

namespace gfx {
class ShaderObject;
class DisplayContext;
}

namespace xtal {

/// Per-frame draw parameters for MapMeshGpuPrim::draw().
struct MapMeshDrawParams {
    MapBufTex *pBufTex;       // non-owning pointer to CPU/GPU buffer texture
    unsigned int isolevel;    // isosurface threshold (0-255)
    int ncol, nrow, nsec;     // voxel grid dimensions
    float frag_alpha;         // fragment alpha
};

/// GPU marching-cubes draw primitive for density map mesh.
/// Owns the GLSL shader program; the texture buffer is passed via MapMeshDrawParams.
class MapMeshGpuPrim : public gfx::GpuPrim
{
private:
    gfx::ShaderObject *m_pPO;

    // Dummy draw element for instanced rendering (no actual vertex attributes).
    // size=2 (two vertices per line), drawMode=DRAW_LINES, numInstances updated per frame.
    using InstDrawArray = gfx::DrawAttrArray<quint8>;
    InstDrawArray *m_pDrawElem;

public:
    MapMeshGpuPrim() : m_pPO(nullptr), m_pDrawElem(nullptr) {}
    virtual ~MapMeshGpuPrim() { invalidate(); }

    // Non-copyable
    MapMeshGpuPrim(const MapMeshGpuPrim &) = delete;
    MapMeshGpuPrim &operator=(const MapMeshGpuPrim &) = delete;

    /// Load shaders and set static uniforms (ivdel[], edgetab[]).
    bool init(gfx::DisplayContext *pDC) override;

    /// Unused overload (required by GpuPrim).
    void draw(gfx::DisplayContext *pDC) override {}

    /// Issue instanced draw call with per-frame uniforms.
    void draw(gfx::DisplayContext *pDC, const MapMeshDrawParams &params);

    /// Release shader resources.
    void invalidate() override;

    bool isValid() const override { return m_pPO != nullptr; }
};

}  // namespace xtal

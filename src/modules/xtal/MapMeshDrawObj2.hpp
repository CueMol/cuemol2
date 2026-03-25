// -*-Mode: C++;-*-
//
// xtal-specific DrawObj2 for GPU marching-cubes map mesh rendering.
// Manages the GLSL shader and issues the instanced draw call.
//

#pragma once

#include "xtal.hpp"
#include "MapBufTex.hpp"

#include <gfx/DrawObj2.hpp>
#include <gfx/DrawAttrArray.hpp>

namespace gfx {
class ShaderObject;
class DisplayContext;
}

namespace xtal {

/// Per-frame draw parameters for MapMeshDrawObj2::draw().
struct MapMeshDrawParams {
    MapBufTex *pBufTex;       // non-owning pointer to CPU/GPU buffer texture
    unsigned int isolevel;    // isosurface threshold (0-255)
    int ncol, nrow, nsec;     // voxel grid dimensions
    float frag_alpha;         // fragment alpha
};

/// GPU marching-cubes draw object for density map mesh.
/// Owns the GLSL shader program; the texture buffer is passed via MapMeshDrawParams.
class MapMeshDrawObj2 : public gfx::BaseDrawObj2
{
private:
    gfx::ShaderObject *m_pPO;

    // Dummy draw element for instanced rendering (no actual vertex attributes).
    // size=2 (two vertices per line), drawMode=DRAW_LINES, numInstances updated per frame.
    using InstDrawArray = gfx::DrawAttrArray<quint8>;
    InstDrawArray *m_pDrawElem;

public:
    MapMeshDrawObj2() : m_pPO(nullptr), m_pDrawElem(nullptr) {}
    virtual ~MapMeshDrawObj2() { invalidate(); }

    // Non-copyable
    MapMeshDrawObj2(const MapMeshDrawObj2 &) = delete;
    MapMeshDrawObj2 &operator=(const MapMeshDrawObj2 &) = delete;

    /// Load shaders and set static uniforms (ivdel[], edgetab[]).
    bool init(gfx::DisplayContext *pDC) override;

    /// Unused overload (required by BaseDrawObj2).
    void draw(gfx::DisplayContext *pDC) override {}

    /// Issue instanced draw call with per-frame uniforms.
    void draw(gfx::DisplayContext *pDC, const MapMeshDrawParams &params);

    /// Release shader resources.
    void invalidate() override;

    bool isValid() const override { return m_pPO != nullptr; }
};

}  // namespace xtal

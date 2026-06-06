// -*-Mode: C++;-*-
//
// PostProcGpuPrim: fullscreen post-processing pass (depth visualization)
//

#pragma once

#include "gfx.hpp"
#include "GpuPrim.hpp"
#include "DrawAttrArray.hpp"

namespace gfx {

class ShaderObject;
class RenderTarget;

/// Fullscreen post-processing primitive.
///
/// Draws a single screen-covering triangle. The current pass samples a
/// RenderTarget's depth texture and writes a linearized grayscale
/// visualization to the bound framebuffer. This is the reusable base shape for
/// future screen-space effects (SSAO/GTAO), which swap the fragment shader.
class GFX_API PostProcGpuPrim : public GpuPrim
{
private:
    struct Elem
    {
        qfloat32 x, y;  // NDC vertex position
    };

    using TriArray = DrawAttrArray<Elem>;

    // Must match layout(location=N) in postproc_vert.glsl.
    static constexpr int ATTRLOC_VERTEX = 0;

    /// Depth-visualization program (off-screen export depth mode).
    ShaderObject *m_pPO = nullptr;
    /// AO composite program (live AO path): samples the scene color texture.
    ShaderObject *m_pCompPO = nullptr;
    TriArray *m_pDrawElem = nullptr;

public:
    PostProcGpuPrim() = default;
    ~PostProcGpuPrim() override
    {
        invalidate();
    }

    bool init(DisplayContext *pDC) override;
    void draw(DisplayContext *pDC) override {}
    void invalidate() override;
    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    /// Sample prt's depth texture and draw a linearized grayscale fullscreen
    /// image into the currently bound framebuffer. vnear/vfar are the camera
    /// slab planes used to linearize the (perspective) depth.
    void drawDepthVis(DisplayContext *pDC, RenderTarget *prt, float vnear,
                      float vfar);

    /// Sample sceneRT's color attachment and draw it into the currently bound
    /// framebuffer (fullscreen). aoRT is reserved for the AO multiply step
    /// added in a later step and is currently ignored. Self-initializes the
    /// vertex buffer and composite program (no init() call required).
    void drawComposite(DisplayContext *pDC, RenderTarget *sceneRT,
                       RenderTarget *aoRT);

private:
    void alloc(DisplayContext *pDC);

    /// Allocate the fullscreen-triangle vertex buffer on first use.
    bool ensureDrawElem(DisplayContext *pDC);
};

}  // namespace gfx

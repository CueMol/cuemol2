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

/// View-space reconstruction constants for the GTAO passes, derived CPU-side
/// from the projection matrix (see GUIView). All shader-facing math uses these
/// instead of a near/far lerp so off-center / asymmetric frusta work and the
/// GL window-depth [0,1] convention is handled.
struct AoConstants
{
    /// (depthLinearizeMul, depthLinearizeAdd): viewZ = mul / (add - rawDepth).
    float depthLinearizeMul = 0.0f;
    float depthLinearizeAdd = 0.0f;
    /// viewPos.xy = (ndcToViewMul * uv + ndcToViewAdd) * viewZ.
    float ndcToViewMul[2] = {0.0f, 0.0f};
    float ndcToViewAdd[2] = {0.0f, 0.0f};
    /// (1/width, 1/height) in pixels.
    float viewportPixelSize[2] = {0.0f, 0.0f};
    /// Occlusion sphere radius in view-space (world) units.
    float effectRadius = 1.0f;
    /// Final occlusion contrast: occlusion = pow(occlusion, finalValuePower).
    float finalValuePower = 2.2f;
};

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
    /// GTAO program (live AO path): reads scene depth, writes the AO term
    /// (currently a debug visualization of depth / reconstructed normal).
    ShaderObject *m_pGtaoPO = nullptr;
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

    /// Read sceneRT's depth texture, reconstruct view-space depth/position with
    /// the given constants, and draw the GTAO term into the currently bound
    /// framebuffer (fullscreen). debugMode selects a debug visualization while
    /// the algorithm is brought up: 0 = linear depth, 1 = reconstructed normal.
    void drawGtao(DisplayContext *pDC, RenderTarget *sceneRT,
                  const AoConstants &consts, int debugMode);

private:
    void alloc(DisplayContext *pDC);

    /// Allocate the fullscreen-triangle vertex buffer on first use.
    bool ensureDrawElem(DisplayContext *pDC);
};

}  // namespace gfx

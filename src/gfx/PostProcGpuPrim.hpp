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
class DataTexture;

/// View-space reconstruction constants for the GTAO passes, derived CPU-side
/// from the projection matrix (see fromCamera). All shader-facing math uses
/// these instead of a near/far lerp so off-center / asymmetric frusta work and
/// the GL window-depth [0,1] convention is handled.
///
/// Perspective and orthographic projections reconstruct view space differently,
/// so the depth/xy fields below are interpreted according to isOrtho.
struct AoConstants
{
    /// 1 = orthographic projection, 0 = perspective. Selects how the shaders
    /// reconstruct view-space Z and XY (see the two fields below).
    int isOrtho = 0;
    /// View-space Z from the [0,1] window depth d:
    ///   perspective:  viewZ = depthLinearizeMul / (depthLinearizeAdd - d)
    ///   orthographic: viewZ = depthLinearizeMul + d * depthLinearizeAdd
    ///                 (= slabNear, slabFar - slabNear; depth is linear in viewZ)
    float depthLinearizeMul = 0.0f;
    float depthLinearizeAdd = 0.0f;
    /// View-space XY from the bottom-up [0,1] uv:
    ///   perspective:  xy = (ndcToViewMul * uv + ndcToViewAdd) * viewZ
    ///   orthographic: xy = (ndcToViewMul * uv + ndcToViewAdd)  (depth-independent)
    float ndcToViewMul[2] = {0.0f, 0.0f};
    float ndcToViewAdd[2] = {0.0f, 0.0f};
    /// (1/width, 1/height) in pixels.
    float viewportPixelSize[2] = {0.0f, 0.0f};
    /// (1/width, 1/height) of the AO term buffer. Equals viewportPixelSize at
    /// full resolution; doubled when the GTAO term is computed at half
    /// resolution. The composite uses it to edge-aware upsample the AO term.
    float aoTexelSize[2] = {0.0f, 0.0f};
    /// Occlusion sphere radius in view-space (world) units.
    float effectRadius = 1.0f;
    /// Final occlusion contrast: occlusion = pow(occlusion, finalValuePower).
    float finalValuePower = 2.2f;
    /// Horizon search radius cap, in the GTAO pass's own pixel units. The
    /// caller scales it to a fixed full-resolution-equivalent radius so the
    /// half-resolution pass clamps at the same world radius (same occlusion).
    float maxScreenspaceRadius = 256.0f;
    /// Linear fog parameters (depth cueing), mirrored from the scene's FogBlock
    /// so the composite can recompute the same fog factor and fade the AO term
    /// out where fog has taken over (otherwise AO darkens fully-fogged
    /// background-color pixels). fogScale = 1/(fogEnd - fogStart); both in
    /// view-space Z units.
    float fogEnd = 0.0f;
    float fogScale = 0.0f;
    /// Number of horizon slices (quality vs. speed).
    int sliceCount = 9;
    /// Number of steps marched per slice (radial samples).
    int stepsPerSlice = 3;
    /// Per-sample noise rotation [0,1) for temporal supersampling (0 = single
    /// frame). Decorrelates the GTAO noise across accumulated jitter samples.
    float aoNoiseOffset = 0.0f;
    /// SMAA edge-detection threshold (max RGB delta between neighbor pixels),
    /// mirrored from Scene.aaSmaaThreshold. 0.1 = SMAA Medium/High preset,
    /// 0.05 = Ultra.
    float smaaThreshold = 0.05f;

    /// Fill the camera-derived geometric fields (isOrtho, depthLinearize*,
    /// ndcToView*, viewportPixelSize) from the camera parameters. The AO tuning
    /// fields (effectRadius / finalValuePower / slice & step counts / fog) are
    /// filled by the caller from the Scene. `aspect` = width/height; `bcx`/`bcy`
    /// = backing-store pixel size. The near/far derivation MUST match
    /// GUIView::setUpProjMat, and the depth/xy formulas MUST match the matrices
    /// from DisplayContext::makePersProjMat / makeOrthoProjMat.
    static AoConstants fromCamera(double camDist, double zoom, double slabDepth,
                                  double aspect, int bcx, int bcy, bool perspec);
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
    /// Edge-aware AO denoise program.
    ShaderObject *m_pDenoisePO = nullptr;
    /// FXAA post-process program (final AA stage of the live AO path).
    ShaderObject *m_pFxaaPO = nullptr;
    /// SMAA 1x programs (edge detection / blending weights / neighborhood blend).
    ShaderObject *m_pSmaaEdgePO = nullptr;
    ShaderObject *m_pSmaaWeightPO = nullptr;
    ShaderObject *m_pSmaaBlendPO = nullptr;
    /// SMAA precomputed lookup textures (loaded once from share/data/textures).
    DataTexture *m_pSmaaAreaTex = nullptr;
    DataTexture *m_pSmaaSearchTex = nullptr;
    /// Temporal-jitter compose program (sample*weight; accumulate + display).
    ShaderObject *m_pJitterComposePO = nullptr;
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

    /// Sample sceneRT's color attachment, multiply by aoRT's AO term, and draw
    /// the result into the currently bound framebuffer (fullscreen). When the AO
    /// term is at a lower resolution than sceneRT (consts.aoTexelSize coarser
    /// than consts.viewportPixelSize), it is joint-bilateral upsampled using the
    /// scene depth so the AO does not bleed across silhouettes. Pass aoRT ==
    /// nullptr for a plain copy. Self-initializes the vertex buffer and composite
    /// program (no init() call required).
    void drawComposite(DisplayContext *pDC, RenderTarget *sceneRT,
                       RenderTarget *aoRT, const AoConstants &consts);

    /// Read sceneRT's depth texture, reconstruct view-space depth/position with
    /// the given constants, and draw the GTAO term into the currently bound
    /// framebuffer (fullscreen). debugMode: 0 = AO, 1 = normal, 2 = depth.
    void drawGtao(DisplayContext *pDC, RenderTarget *sceneRT,
                  const AoConstants &consts, int debugMode);

    /// Edge-aware blur of aoRT (R = AO, G = packed edges) into the currently
    /// bound framebuffer (fullscreen). consts supplies the viewport pixel size.
    void drawDenoise(DisplayContext *pDC, RenderTarget *aoRT,
                     const AoConstants &consts);

    /// FXAA pass: sample srcColorRT's color attachment (must be LINEAR) and draw
    /// the antialiased result into the currently bound framebuffer (fullscreen).
    /// consts.viewportPixelSize supplies the reciprocal frame size.
    void drawFxaa(DisplayContext *pDC, RenderTarget *srcColorRT,
                  const AoConstants &consts);

    /// SMAA 1x passes (consts.viewportPixelSize supplies 1/size). Each draws a
    /// fullscreen quad into the currently bound framebuffer:
    ///   edges:   color (LINEAR) -> edge texture (RG)
    ///   weights: edges + AreaTex/SearchTex -> blending weights (RGBA)
    ///   blend:   color + weights -> antialiased color
    /// drawSmaaWeights lazily loads the lookup textures; if they fail to load it
    /// draws nothing (the caller should fall back to no AA).
    void drawSmaaEdges(DisplayContext *pDC, RenderTarget *srcColorRT,
                       const AoConstants &consts);
    void drawSmaaWeights(DisplayContext *pDC, RenderTarget *edgesRT,
                         const AoConstants &consts);
    void drawSmaaBlend(DisplayContext *pDC, RenderTarget *srcColorRT,
                       RenderTarget *weightsRT, const AoConstants &consts);

    /// True once both SMAA lookup textures are available (lazily loaded).
    bool ensureSmaaTextures(DisplayContext *pDC);

    /// Temporal-jitter compose: draw srcRT's color * weight into the currently
    /// bound framebuffer (fullscreen). Used for both the additive accumulate
    /// step (weight 1/N, with additive blend enabled by the caller) and the
    /// normalized display step (weight N/count, no blend).
    void drawJitterCompose(DisplayContext *pDC, RenderTarget *srcRT, float weight);

private:
    void alloc(DisplayContext *pDC);

    /// Allocate the fullscreen-triangle vertex buffer on first use.
    bool ensureDrawElem(DisplayContext *pDC);
};

}  // namespace gfx

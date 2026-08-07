// -*-Mode: C++;-*-
//
// FrameRenderPipeline: off-screen multi-pass orchestration for the GTAO AO and
// post-process AA paths (scene -> [GTAO -> denoise] -> composite ->
// [FXAA/SMAA] -> [temporal jitter]). AO and AA are independent: either one
// routes the frame through this pipeline.
//
// Extracted from GUIView::drawScene so the same pass chain serves both the live
// view and the off-screen exporter, and so the future tritium (WebGL2) port
// touches one class. The pipeline owns the render targets and the fullscreen
// post-process primitive; the View keeps camera/projection, jitter control flow,
// and the UI overlay. All GPU access goes through gfx:: abstract interfaces, so
// the class is platform-agnostic (it never issues a raw GL call).
//

#pragma once

#include "qsys.hpp"

#include <gfx/PostProcGpuPrim.hpp>  // gfx::AoConstants (by-value Params member)

#include <functional>

namespace gfx {
class DisplayContext;
class RenderTarget;
class PostProcGpuPrim;
}  // namespace gfx

namespace qsys {

/// View-decided inputs for one FrameRenderPipeline::render() call. The Scene-owned
/// render settings (AO tuning, AA method, background color) are read by the
/// pipeline directly from the ScenePtr; only the values the View controls (camera
/// constants, jitter control flow, output routing) are passed here.
struct FrameRenderParams
{
    /// Camera-derived AO constants (View owns the derivation; see
    /// GUIView::computeAoConstants). The AO tuning fields and the AO-buffer texel
    /// size / half-res variant are filled inside render().
    gfx::AoConstants camAoc;

    /// GTAO noise rotation [0,1) for temporal supersampling (0 = single frame).
    float aoNoiseOffset = 0.0f;

    /// Run the GTAO + denoise passes and multiply the AO term in the composite.
    /// false = the pipeline serves AA only: the scene color passes through the
    /// composite unchanged (u_hasAO == 0 plain copy).
    bool enableAO = true;

    /// Clear the scene target's background alpha to 0 (transparent export).
    bool bgTransparent = false;

    /// Apply the Scene's spatial post-AA (FXAA/SMAA) after the composite. The
    /// live path passes true; the off-screen exporter passes false (composite
    /// only, blend off so transparent pixels keep their alpha).
    bool enablePostAA = true;

    /// Temporal-jitter supersampling: accumulate this sample into the float
    /// buffer and display the running average. The View owns the sample index /
    /// count and the projection offset; the pipeline only executes the blend.
    bool jitterActive = false;
    int jitterIndex = 0;
    int jitterCount = 1;

    /// Final output target when not jittering. nullptr = default framebuffer.
    /// When jitterActive, the per-sample color goes to the internal sample target
    /// and the average is displayed to the default framebuffer regardless.
    gfx::RenderTarget *outRT = nullptr;

    /// Restore the scene depth into the default framebuffer so the UI overlay
    /// z-tests against the scene (live path). The exporter passes false.
    bool blitDepthToDefault = false;
};

/// Owns the off-screen render targets + the fullscreen post-process primitive and
/// runs the GTAO AO multi-pass chain. Lifecycle mirrors the molstar pass shape:
/// setSize (idempotent (re)alloc) / render / dispose.
class QSYS_API FrameRenderPipeline
{
public:
    FrameRenderPipeline() = default;
    ~FrameRenderPipeline();

    /// (Re)create the render targets at the given backing-pixel size. Idempotent:
    /// existing targets are resized, not reallocated. When halfRes is true the
    /// GTAO term targets (AO / denoise) are allocated at half resolution; the
    /// scene and composite targets stay full resolution.
    void setSize(gfx::DisplayContext *pdc, int w, int h, bool halfRes);

    /// Release all render targets and the post-process primitive. Does NOT touch
    /// the display context (the targets self-guard the GL context via their parent
    /// view id), so it is safe to call from a destructor after the concrete view
    /// subclass is gone.
    void dispose();

    /// True once the core targets and post-process primitive exist (setSize ran).
    bool isReady() const;

    /// Run the pass chain: scene(via sceneRenderFn) -> [GTAO -> denoise (when
    /// params.enableAO)] -> composite -> [post-AA] -> [jitter
    /// accumulate/display] -> [depth blit]. pScene supplies AO/AA/background
    /// settings. sceneRenderFn sets the model matrix and calls
    /// pScene->display(pdc); the pipeline binds/clears the scene target around
    /// it. Returns true when the chain ran (always true once isReady()); the
    /// caller handles the plain-scene fallback when not ready.
    bool render(gfx::DisplayContext *pdc, const ScenePtr &pScene,
                const FrameRenderParams &params,
                const std::function<void()> &sceneRenderFn);

private:
    /// Final blend output target: the internal jitter sample target while
    /// jittering, otherwise the caller-supplied target (nullptr = default fb).
    gfx::RenderTarget *selectOutRT(const FrameRenderParams &params) const;

    /// Off-screen scene target (color + depth + MRT normal).
    gfx::RenderTarget *m_pAOSceneRT = nullptr;
    /// GTAO term + packed edges, and its edge-aware denoised result.
    gfx::RenderTarget *m_pAoRT = nullptr;
    gfx::RenderTarget *m_pAoDenRT = nullptr;
    /// LINEAR composite target feeding the post-process AA stage.
    gfx::RenderTarget *m_pCompRT = nullptr;
    /// SMAA intermediates (edges, blending weights).
    gfx::RenderTarget *m_pSmaaEdgeRT = nullptr;
    gfx::RenderTarget *m_pSmaaWeightRT = nullptr;
    /// Temporal-jitter per-sample color (RGBA8) and float accumulation (RGBA16F).
    gfx::RenderTarget *m_pJitterSampleRT = nullptr;
    gfx::RenderTarget *m_pJitterAccumRT = nullptr;

    /// Fullscreen post-processing primitive (GTAO + denoise + composite + AA +
    /// jitter compose). Owned.
    gfx::PostProcGpuPrim *m_pAOPostProc = nullptr;

    /// True when the float accumulation target was created successfully. Desktop
    /// GL always supports it; a backend lacking float color attachments (e.g. a
    /// WebGL2 context without EXT_color_buffer_float) leaves it false so the
    /// jitter path degrades gracefully to non-jittered rendering.
    bool m_jitterSupported = false;
};

}  // namespace qsys

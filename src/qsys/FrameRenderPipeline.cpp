// -*-Mode: C++;-*-
//
// FrameRenderPipeline: off-screen multi-pass orchestration for the GTAO AO and
// post-process AA paths.
//

#include <common.h>
#include "FrameRenderPipeline.hpp"
#include "Scene.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/RenderTarget.hpp>
#include <gfx/PostProcGpuPrim.hpp>
#include <gfx/AbstractColor.hpp>

namespace qsys {

FrameRenderPipeline::~FrameRenderPipeline()
{
    dispose();
}

void FrameRenderPipeline::setSize(gfx::DisplayContext *pdc, int w, int h, bool halfRes,
                                  bool aoEnabled)
{
    if (pdc == nullptr) return;

    // The normal attachment (MRT) lets the GTAO pass use real geometry
    // normals instead of depth-reconstructed ones; it exists only for the AO
    // passes. Attachment flags are fixed at creation, so recreate the scene
    // target when the AO requirement changes.
    if (m_pAOSceneRT != nullptr && m_pAOSceneRT->hasNormal() != aoEnabled) {
        delete m_pAOSceneRT;
        m_pAOSceneRT = nullptr;
    }
    if (m_pAOSceneRT == nullptr) {
        int flags = gfx::RT_COLOR_RGBA8 | gfx::RT_DEPTH_TEX;
        if (aoEnabled) flags |= gfx::RT_NORMAL_RGBA16F;
        m_pAOSceneRT = pdc->createRenderTarget(w, h, flags);
    } else {
        m_pAOSceneRT->resize(w, h);
    }

    // AO term targets (GTAO + denoise), allocated only while AO is on. Half
    // resolution when requested; the composite edge-aware upsamples them back
    // to full res. resize() is a no-op when unchanged, so toggling halfRes at
    // runtime re-allocates them.
    if (aoEnabled) {
        const int aoW = halfRes ? (w + 1) / 2 : w;
        const int aoH = halfRes ? (h + 1) / 2 : h;

        // AO targets hold packed data (AO + edges) and must use NEAREST filtering.
        const int aoFlags = gfx::RT_COLOR_RGBA8 | gfx::RT_COLOR_NEAREST;
        if (m_pAoRT == nullptr) {
            m_pAoRT = pdc->createRenderTarget(aoW, aoH, aoFlags);
        } else {
            m_pAoRT->resize(aoW, aoH);
        }

        if (m_pAoDenRT == nullptr) {
            m_pAoDenRT = pdc->createRenderTarget(aoW, aoH, aoFlags);
        } else {
            m_pAoDenRT->resize(aoW, aoH);
        }
    } else {
        if (m_pAoRT != nullptr) {
            delete m_pAoRT;
            m_pAoRT = nullptr;
        }
        if (m_pAoDenRT != nullptr) {
            delete m_pAoDenRT;
            m_pAoDenRT = nullptr;
        }
    }

    // Composite target for the post-process AA stage. LINEAR filtering (no
    // RT_COLOR_NEAREST) is required for the FXAA sub-texel sampling.
    if (m_pCompRT == nullptr) {
        m_pCompRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA8);
    } else {
        m_pCompRT->resize(w, h);
    }

    // SMAA intermediate targets (edges, weights). LINEAR (SMAA relies on
    // bilinear sampling of both). Allocated regardless of the active method;
    // they are cheap RGBA8 buffers and only sampled when aaMethod is smaa.
    if (m_pSmaaEdgeRT == nullptr) {
        m_pSmaaEdgeRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA8);
    } else {
        m_pSmaaEdgeRT->resize(w, h);
    }
    if (m_pSmaaWeightRT == nullptr) {
        m_pSmaaWeightRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA8);
    } else {
        m_pSmaaWeightRT->resize(w, h);
    }

    // Temporal-jitter targets: per-sample 3D color (RGBA8 LINEAR) and the float
    // accumulation buffer (RGBA16F, to avoid 8-bit banding when summing samples).
    if (m_pJitterSampleRT == nullptr) {
        m_pJitterSampleRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA8);
    } else {
        m_pJitterSampleRT->resize(w, h);
    }
    if (m_pJitterAccumRT == nullptr) {
        // The float accumulation target may be refused by a backend without
        // float color attachments; if so, jitter degrades to non-jittered.
        m_pJitterAccumRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA16F);
        m_jitterSupported = (m_pJitterAccumRT != nullptr);
    } else {
        m_pJitterAccumRT->resize(w, h);
    }

    if (m_pAOPostProc == nullptr) {
        m_pAOPostProc = MB_NEW gfx::PostProcGpuPrim();
    }
}

void FrameRenderPipeline::dispose()
{
    // The render targets and the post-proc primitive's VBO both guard the GL
    // context themselves (via the parent view looked up by ID in their
    // destructors), so do NOT call any display-context method here. dispose() runs
    // from ~GUIView, after the concrete view subclass is already destroyed, where
    // getDisplayContext() would be a pure-virtual call (crash).
    if (m_pAOPostProc != nullptr) {
        delete m_pAOPostProc;
        m_pAOPostProc = nullptr;
    }
    if (m_pJitterAccumRT != nullptr) {
        delete m_pJitterAccumRT;
        m_pJitterAccumRT = nullptr;
    }
    if (m_pJitterSampleRT != nullptr) {
        delete m_pJitterSampleRT;
        m_pJitterSampleRT = nullptr;
    }
    if (m_pSmaaWeightRT != nullptr) {
        delete m_pSmaaWeightRT;
        m_pSmaaWeightRT = nullptr;
    }
    if (m_pSmaaEdgeRT != nullptr) {
        delete m_pSmaaEdgeRT;
        m_pSmaaEdgeRT = nullptr;
    }
    if (m_pCompRT != nullptr) {
        delete m_pCompRT;
        m_pCompRT = nullptr;
    }
    if (m_pAoDenRT != nullptr) {
        delete m_pAoDenRT;
        m_pAoDenRT = nullptr;
    }
    if (m_pAoRT != nullptr) {
        delete m_pAoRT;
        m_pAoRT = nullptr;
    }
    if (m_pAOSceneRT != nullptr) {
        delete m_pAOSceneRT;
        m_pAOSceneRT = nullptr;
    }
    m_jitterSupported = false;
}

bool FrameRenderPipeline::isReady() const
{
    // The AO term targets are optional (absent in AA-only mode); render()
    // falls back to the no-AO composite when they are missing.
    return m_pAOSceneRT != nullptr && m_pAOPostProc != nullptr;
}

gfx::RenderTarget *FrameRenderPipeline::selectOutRT(const FrameRenderParams &params) const
{
    // While jittering, the final blend lands in the internal per-sample target
    // (accumulated afterwards); otherwise it goes to the caller-supplied target
    // (nullptr = default framebuffer).
    return (params.jitterActive && m_jitterSupported) ? m_pJitterSampleRT
                                                      : params.outRT;
}

bool FrameRenderPipeline::render(gfx::DisplayContext *pdc, const ScenePtr &pScene,
                                 const FrameRenderParams &params,
                                 const std::function<void()> &sceneRenderFn)
{
    if (!isReady()) return false;

    const bool jitter = params.jitterActive && m_jitterSupported;
    // AA-only mode skips the GTAO/denoise passes and composites without an AO
    // term. The RT guards also cover the case where the AO targets were not
    // allocated (setSize with aoEnabled=false).
    const bool aoActive =
        params.enableAO && m_pAoRT != nullptr && m_pAoDenRT != nullptr;

    // 1. Render the 3D scene into the off-screen target (color + depth + MRT
    // normal). The clear precedes the scene callback; the model-matrix setup the
    // callback performs is independent of the clear, so the result is identical to
    // clearing after it.
    gfx::ColorPtr bg = pScene->getBgColor();
    const float bgA = params.bgTransparent ? 0.0f : 1.0f;
    m_pAOSceneRT->bind();
    m_pAOSceneRT->clear(float(bg->fr()), float(bg->fg()), float(bg->fb()), bgA);
    sceneRenderFn();
    m_pAOSceneRT->unbind();

    // 2. AO constants: camera part from params, AO tuning read from the Scene.
    gfx::AoConstants aoc = params.camAoc;
    // SMAA tuning (used by the post-AA stage, independent of AO).
    aoc.smaaThreshold = float(pScene->getAASmaaThreshold());
    if (aoActive) {
        aoc.effectRadius = float(pScene->getAORadius());
        aoc.finalValuePower = float(pScene->getAOIntensity());
        aoc.sliceCount = pScene->getAOSlices();
        aoc.stepsPerSlice = pScene->getAOSteps();
        aoc.aoNoiseOffset = params.aoNoiseOffset;
        // AO buffer texel size (= full res, or 2x coarser at half res). The GTAO /
        // denoise passes run at this resolution, so they use it as their pixel size;
        // the composite reads both to know whether (and how) to upsample.
        aoc.aoTexelSize[0] = 1.0f / float(m_pAoRT->getWidth());
        aoc.aoTexelSize[1] = 1.0f / float(m_pAoRT->getHeight());
        // Fog parameters for the composite's AO fade. These must match the scene's
        // setupFog (ShaderObject::setupFog): fogScale = 1/(fogEnd - fogStart). The
        // composite recomputes the same linear fog factor from the scene depth and
        // fades the AO term out where fog has taken over, so fully-fogged pixels are
        // not darkened by AO.
        const double fogStart = pdc->getFogStart();
        const double fogEnd = pdc->getFogEnd();
        aoc.fogEnd = float(fogEnd);
        aoc.fogScale = (fogEnd > fogStart) ? float(1.0 / (fogEnd - fogStart)) : 0.0f;
        gfx::AoConstants aocAO = aoc;
        aocAO.viewportPixelSize[0] = aoc.aoTexelSize[0];
        aocAO.viewportPixelSize[1] = aoc.aoTexelSize[1];
        // Keep the horizon-radius cap at a fixed full-res-equivalent value so half
        // res yields the same occlusion as full res.
        aocAO.maxScreenspaceRadius =
            256.0f * (aoc.viewportPixelSize[0] / aoc.aoTexelSize[0]);

        // 3. GTAO pass: read the scene depth, write AO + packed edges.
        m_pAoRT->bind();
        m_pAoRT->clear(1.0f, 1.0f, 1.0f, 1.0f);
        m_pAOPostProc->drawGtao(pdc, m_pAOSceneRT, aocAO, /*debugMode=*/0);
        m_pAoRT->unbind();

        // 4. Edge-aware denoise of the AO term (single pass).
        m_pAoDenRT->bind();
        m_pAOPostProc->drawDenoise(pdc, m_pAoRT, aocAO);
        m_pAoDenRT->unbind();
    } else {
        // AA-only: keep the AO texel size equal to the viewport so the
        // composite's upsample check stays off. The composite shader reads no
        // other AO uniforms when u_hasAO == 0 (plain copy).
        aoc.aoTexelSize[0] = aoc.viewportPixelSize[0];
        aoc.aoTexelSize[1] = aoc.viewportPixelSize[1];
    }

    gfx::RenderTarget *outRT = selectOutRT(params);
    // The composite multiplies the denoised AO term, or plain-copies the scene
    // color when the AO passes did not run (nullptr -> u_hasAO == 0).
    gfx::RenderTarget *pAoDen = aoActive ? m_pAoDenRT : nullptr;

    if (params.enablePostAA) {
        // ---- Live path: composite scene color * denoised AO, then the selected
        // post-process AA, then optional temporal-jitter accumulate/display. ----
        const int aaMethod = pScene->getAAMethod();
        const bool postAA = (aaMethod == Scene::AA_FXAA ||
                             aaMethod == Scene::AA_SMAA) &&
                            m_pCompRT != nullptr;
        pdc->setDepthTestEnabled(false);
        if (postAA) {
            // The post-AA passes write data (SMAA edges have alpha 0, the
            // weights' alpha carries data); with GL_BLEND on their output would be
            // discarded. Disable it for the off-screen AA passes.
            pdc->setBlendEnabled(false);

            m_pCompRT->bind();
            m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, pAoDen, aoc);
            m_pCompRT->unbind();

            if (aaMethod == Scene::AA_SMAA && m_pSmaaEdgeRT != nullptr &&
                m_pSmaaWeightRT != nullptr) {
                // 1. Edge detection (cleared so non-edge pixels read 0).
                m_pSmaaEdgeRT->bind();
                m_pSmaaEdgeRT->clear(0.0f, 0.0f, 0.0f, 0.0f);
                m_pAOPostProc->drawSmaaEdges(pdc, m_pCompRT, aoc);
                m_pSmaaEdgeRT->unbind();
                // 2. Blending weight calculation.
                m_pSmaaWeightRT->bind();
                m_pSmaaWeightRT->clear(0.0f, 0.0f, 0.0f, 0.0f);
                m_pAOPostProc->drawSmaaWeights(pdc, m_pSmaaEdgeRT, aoc);
                m_pSmaaWeightRT->unbind();
                // 3. Neighborhood blending -> outRT (sample) or default fb.
                if (outRT != nullptr) outRT->bind();
                m_pAOPostProc->drawSmaaBlend(pdc, m_pCompRT, m_pSmaaWeightRT, aoc);
                if (outRT != nullptr) outRT->unbind();
            } else {
                if (outRT != nullptr) outRT->bind();
                m_pAOPostProc->drawFxaa(pdc, m_pCompRT, aoc);
                if (outRT != nullptr) outRT->unbind();
            }

            pdc->setBlendEnabled(true);
        } else {
            if (outRT != nullptr) outRT->bind();
            m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, pAoDen, aoc);
            if (outRT != nullptr) outRT->unbind();
        }

        // Temporal-jitter accumulate + display. The final color of this sample is
        // in m_pJitterSampleRT.
        if (jitter) {
            const float invN = 1.0f / float(params.jitterCount);
            // Additive sum into the float accumulation buffer (cleared on the
            // first sample).
            m_pJitterAccumRT->bind();
            if (params.jitterIndex == 0)
                m_pJitterAccumRT->clear(0.0f, 0.0f, 0.0f, 0.0f);
            pdc->setBlendEnabled(true);
            pdc->setBlendModeAdd(true);
            m_pAOPostProc->drawJitterCompose(pdc, m_pJitterSampleRT, invN);
            pdc->setBlendModeAdd(false);
            pdc->setBlendEnabled(false);
            m_pJitterAccumRT->unbind();

            // Display the normalized partial average to the default framebuffer.
            const float disp =
                float(params.jitterCount) / float(params.jitterIndex + 1);
            m_pAOPostProc->drawJitterCompose(pdc, m_pJitterAccumRT, disp);

            // Restore over-blend for the UI overlay drawn afterwards.
            pdc->setBlendEnabled(true);
        }
        pdc->setDepthTestEnabled(true);

        // Restore the scene depth into the default framebuffer so the UI overlays
        // depth-test against the scene as usual.
        if (params.blitDepthToDefault) m_pAOSceneRT->blitDepthToDefault();
    } else {
        // ---- Exporter path: composite only (color * AO, edge-aware upsampled
        // when half res) -> outRT. No spatial post-AA. Blend off so the
        // fullscreen pass replaces (transparent-bg pixels keep alpha 0). ----
        pdc->setDepthTestEnabled(false);
        pdc->setBlendEnabled(false);
        if (outRT != nullptr) outRT->bind();
        m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, pAoDen, aoc);
        if (outRT != nullptr) outRT->unbind();
        pdc->setBlendEnabled(true);
        pdc->setDepthTestEnabled(true);
    }

    return true;
}

}  // namespace qsys

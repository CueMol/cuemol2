// -*-Mode: C++;-*-
//
// View: Generic Molecule View Class
//
// $Id: View.cpp,v 1.48 2011/03/13 12:02:45 rishitani Exp $
//

#include <common.h>
#include "GUIView.hpp"
#include "OffScreenView.hpp"
#include "FrameRenderPipeline.hpp"

#include <gfx/HittestContext.hpp>
#include <gfx/RenderTarget.hpp>
#include <gfx/PostProcGpuPrim.hpp>
#include <gfx/JitterSamples.hpp>
#include <gfx/PickBuffer.hpp>

#include <algorithm>
#include <cmath>
#include <vector>
#include <qlib/LPerfMeas.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/RangeSet.hpp>

#include "CenterMarkDrawObj.hpp"
#include "SceneManager.hpp"
#include "Renderer.hpp"
#include "ViewInputConfig.hpp"

namespace qsys {

GUIView::GUIView() : View()
{
    auto pMark = DrawObjPtr(new CenterMarkDrawObj());
    pMark->setEnabled(true);
    addDrawObj("CenterMarkDrawObj", pMark);
}

GUIView::~GUIView()
{
    if (m_pPipeline != nullptr) {
        m_pPipeline->dispose();
        delete m_pPipeline;
        m_pPipeline = nullptr;
    }
    releasePickBuffer();
}

void GUIView::unloading()
{
    // Release AO GPU resources while the GL context is still alive (the base
    // unloading tears down the display context). The destructor also disposes the
    // pipeline as a fallback, but by then getDisplayContext() is gone.
    if (m_pPipeline != nullptr) {
        m_pPipeline->dispose();
        delete m_pPipeline;
        m_pPipeline = nullptr;
    }
    releasePickBuffer();
    m_bHoverSet = false;
    m_bPresentDirty = false;
    m_bFrameCached = false;
    super_t::unloading();
}

void GUIView::sizeChanged(int cx, int cy)
{
    super_t::sizeChanged(cx, cy);
    m_bPickDirty = true;
    // The pipeline targets are resized on the next regular frame; nothing to
    // re-present until then.
    m_bFrameCached = false;
}

void GUIView::setCenterMark(int nMode)
{
    super_t::setCenterMark(nMode);
    auto pdo = getDrawObj("CenterMarkDrawObj");
    auto *pcmdo = dynamic_cast<CenterMarkDrawObj *>(pdo.get());
    if (pcmdo == nullptr) return;
    pcmdo->setCenterMark(nMode);
}

void GUIView::setUpModelMat(int nid)
{
    DisplayContext *pdc = getDisplayContext();

    pdc->loadIdent();
    pdc->translate(Vector4D(0, 0, -getViewDist()));

    double sd = getStereoDist();

    switch (nid) {
        case MM_NORMAL:
            break;

        case MM_STEREO_RIGHT:
            pdc->rotate(
                qlib::LQuat(qlib::Vector4D(0, 1, 0), qlib::toRadian(-sd / 2.0)));
            break;

        case MM_STEREO_LEFT:
            pdc->rotate(qlib::LQuat(qlib::Vector4D(0, 1, 0), qlib::toRadian(sd / 2.0)));
            break;

        default:
            break;
    }

    pdc->rotate(getRotQuat());

    const qlib::Vector4D c = getViewCenter();
    pdc->translate(-c);
}

void GUIView::setUpLightColor() {}

// setup the projection matrix
void GUIView::setUpProjMat(int cx, int cy)
{
    DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();

    if (cx < 0 || cy < 0) {
        cx = getWidth();
        cy = getHeight();
    }

    double zoom = (double)getZoom(), dist = (double)getViewDist();
    double slabdepth = (double)getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;

    double slabnear = dist - slabdepth / 2.0;
    double slabfar = dist + slabdepth;
    // truncate near slab by camera distance
    if (slabnear < 0.1) slabnear = 0.1;

    double fognear = dist;
    double fogfar = dist + slabdepth / 2.0;
    if (fognear < 1.0) fognear = 1.0;

    pdc->setFogStart(fognear);
    pdc->setFogEnd(fogfar);

    setFogColorImpl(pdc);

    // MB_DPRINTLN("Zoom=%f", zoom);
    double vw = zoom / 2.0f;
    double fasp = (cy > 0) ? (double)cx / (double)cy : 1.0;

    // MB_DPRINTLN("OcView.setUpProjMat> CX=%d, CY=%d, Vw=%f, Fasp=%f", cx, cy, vw, fasp);
    // MB_DPRINTLN("OcView.setUpProjMat> Near=%f, Far=%f", slabnear, slabfar);

    int bcx = convToBackingX(cx);
    int bcy = convToBackingY(cy);

    // MB_DPRINTLN("OcView.setUpProjMat> BCX=%d, BCY=%d", bcx, bcy);

    if (getStereoMode() == Camera::CSM_PARA || getStereoMode() == Camera::CSM_CROSS) {
        fasp /= 2.0f;
        pdc->setViewport(Vector4D(0, 0, bcx / 2, bcy));
    } else {
        pdc->setViewport(Vector4D(0, 0, bcx, bcy));
    }

    // Setup projection matrix
    Matrix4D projMat;
    if (isPerspec()) {
        projMat = DisplayContext::makePersProjMat(vw, fasp, slabnear, slabfar, dist);
    } else {
        projMat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
    }

    // Temporal-jitter sub-pixel offset (no-op when m_jitterPxX/Y are 0). Shift
    // the projection by a fraction of a pixel in NDC. For perspective this is a
    // depth-independent screen shift via the z column (clip.x += j * clip.w);
    // for ortho it is the translation column. Sign is irrelevant to the result
    // (the offset set is symmetric and averaged).
    if (m_jitterPxX != 0.0 || m_jitterPxY != 0.0) {
        const double jx = (bcx > 0) ? (2.0 * m_jitterPxX / double(bcx)) : 0.0;
        const double jy = (bcy > 0) ? (2.0 * m_jitterPxY / double(bcy)) : 0.0;
        if (isPerspec()) {
            projMat.aij(1, 3) += -jx;
            projMat.aij(2, 3) += -jy;
        } else {
            projMat.aij(1, 4) += jx;
            projMat.aij(2, 4) += jy;
        }
    }
    pdc->setProjMat(projMat);

    resetProjChgFlag();
}

void GUIView::forceRedraw()
{
    // Scene-content changes reach views through the scene-level update flag and
    // forceRedraw (not the per-view flag), so restart temporal-jitter
    // accumulation here to avoid blending stale content. Camera changes are
    // caught separately via getUpdateFlag() in drawScene.
    m_jitterResetRequested = true;
    drawScene();
    clearUpdateFlag();
}

GUIView::FramePlan GUIView::planFrame(const FrameFlags &f)
{
    FramePlan p;
    p.sceneChanged = f.updateFlag || f.jitterReset;
    // A present-only frame re-presents the cached frame with the overlay: only
    // when nothing else changed, no progressive work (jitter samples, AO
    // follow-up) is pending and the pipeline still holds the frame.
    p.presentOnly = f.presentDirty && !p.sceneChanged && !f.jitterMore &&
                    !f.aoHalfPending && f.frameCached;
    // Otherwise the request costs a regular frame of an unchanged scene. A
    // converged jitter accumulation would add its last sample once more, so
    // restart it; an accumulation still in progress just continues.
    p.restartJitter =
        f.presentDirty && !p.presentOnly && !p.sceneChanged && !f.jitterMore;
    return p;
}

bool GUIView::hoverIdToPickId(qlib::uid_t rendUid, int atomId, int symmId,
                              const std::vector<qlib::uid_t> &rendTab, int out[3])
{
    if (atomId < 0) return false;
    auto it = std::find(rendTab.begin(), rendTab.end(), rendUid);
    if (it == rendTab.end()) return false;
    out[0] = int(it - rendTab.begin()) + 1;
    out[1] = int(gfx::encodeHitName(atomId));
    out[2] = int(gfx::encodeHitName(symmId));
    return true;
}

void GUIView::setHoverHit(int rend_id, int atom_id, int symm_id)
{
    if (atom_id < 0) {
        clearHoverHit();
        return;
    }
    const auto uid = qlib::uid_t(rend_id);
    if (m_bHoverSet && m_hoverRendUid == uid && m_hoverAtomId == atom_id &&
        m_hoverSymmId == symm_id)
        return;
    m_hoverRendUid = uid;
    m_hoverAtomId = atom_id;
    m_hoverSymmId = symm_id;
    m_bHoverSet = true;
    // The present-only frame is picked up by the idle loop
    // (needsContinuousRedraw); the update flag stays clear so the temporal
    // jitter accumulation is not restarted.
    if (isGpuPickActive()) m_bPresentDirty = true;
}

void GUIView::clearHoverHit()
{
    if (!m_bHoverSet) return;
    m_bHoverSet = false;
    if (isGpuPickActive()) m_bPresentDirty = true;
}

bool GUIView::isHoverHighlightActive() const
{
    return m_bHoverSet && isGpuPickActive();
}

namespace {
// Hover highlight look; the colour itself is ViewInputConfig::hover_hl_color.
constexpr float HOVER_HL_FILL_ALPHA = 0.35f;
constexpr float HOVER_HL_EDGE_ALPHA = 0.9f;
constexpr float HOVER_HL_EDGE_DARKEN = 0.5f;
}  // namespace

void GUIView::drawHoverOverlay(DisplayContext *pdc)
{
    if (m_pPipeline == nullptr || !m_pPipeline->isReady()) return;
    gfx::PostProcGpuPrim *pPP = m_pPipeline->getPostProc();
    if (pPP == nullptr) return;

    // The pick pass runs only when the buffer is stale (scene / camera changed
    // since it was last rendered); its guard restores the GL / context state.
    if (!renderPickBuffer() || m_pPickRT == nullptr) return;

    int id[3];
    if (!hoverIdToPickId(m_hoverRendUid, m_hoverAtomId, m_hoverSymmId, m_pickRendTab, id))
        return;

    float r = 1.0f, g = 0.4f, b = 0.6f;
    const gfx::ColorPtr &pCol = ViewInputConfig::getInstance()->getHoverHlColor();
    if (!pCol.isnull()) {
        r = float(pCol->fr());
        g = float(pCol->fg());
        b = float(pCol->fb());
    }
    const float fill[4] = {r, g, b, HOVER_HL_FILL_ALPHA};
    const float edge[4] = {r * HOVER_HL_EDGE_DARKEN, g * HOVER_HL_EDGE_DARKEN,
                           b * HOVER_HL_EDGE_DARKEN, HOVER_HL_EDGE_ALPHA};

    // Alpha-blend the overlay over the finished frame, ignoring depth.
    pdc->setDepthTestEnabled(false);
    pdc->setBlendEnabled(true);
    pdc->setBlendModeAdd(false);
    pPP->drawHoverHighlight(pdc, m_pPickRT, id, fill, edge);
    pdc->setDepthTestEnabled(true);
}

void GUIView::drawUiOverlays(DisplayContext *pdc)
{
    // Display UI drawing objects (+center mark)
    {
        super_t::showDrawObj(pdc);
    }

    // Display 2D-UI drawing objects
    {
        const double cx = getWidth();
        const double cy = getHeight();
        // const float dist = float(getViewDist());

        pdc->pushMatrix();
        pdc->loadIdent();
        auto projMat = pdc->getProjMat();
        pdc->setProjMat(DisplayContext::makeOrthoProjMat(0, cx, cy, 0, 1.0, -1.0));

        super_t::showDrawObj2D(pdc);

        pdc->setProjMat(projMat);
        pdc->popMatrix();
    }
}

bool GUIView::presentFrame(DisplayContext *pdc)
{
    if (m_pPipeline == nullptr) return false;

    const int bw = convToBackingX(getWidth());
    const int bh = convToBackingY(getHeight());
    if (bw <= 0 || bh <= 0) return false;

    pdc->bindDefaultFramebuffer();
    pdc->setViewport(Vector4D(0, 0, bw, bh));
    pdc->setLighting(false);

    if (!m_pPipeline->presentLast(pdc)) return false;

    if (isHoverHighlightActive()) drawHoverOverlay(pdc);

    // The UI overlays use the un-jittered projection / model matrices of the
    // current camera (the pick pass or the off-screen exporter may have left
    // other matrices in the context).
    m_jitterPxX = m_jitterPxY = 0.0;
    setUpProjMat(-1, -1);
    setUpModelMat(MM_NORMAL);
    drawUiOverlays(pdc);

    swapBuffers();
    return true;
}

void GUIView::drawScene()
{
    // MB_DPRINTLN("GUIView::drawScene called");

    // if (!m_bInitOK) return;
    if (!safeSetCurrent()) return;

    qlib::AutoPerfMeas apm(PM_DRAW_SCENE);

    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("DrawScene: invalid scene %d !!", (int)getSceneID());
        return;
    }

    DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();

    // Decide the frame kind and consume the one-shot request flags here, so an
    // early return below cannot leave them armed (m_bPresentDirty keeps the
    // idle loop alive through needsContinuousRedraw).
    FrameFlags ff;
    ff.presentDirty = m_bPresentDirty;
    ff.updateFlag = getUpdateFlag();
    ff.jitterReset = m_jitterResetRequested;
    ff.jitterMore = m_jitterMoreSamples;
    ff.aoHalfPending = m_aoHalfPending;
    ff.frameCached = m_bFrameCached && m_pPipeline != nullptr &&
                     m_pPipeline->hasCachedStage() &&
                     m_pPipeline->getWidth() == convToBackingX(getWidth()) &&
                     m_pPipeline->getHeight() == convToBackingY(getHeight());
    FramePlan plan = planFrame(ff);
    m_bPresentDirty = false;
    m_jitterResetRequested = false;

    if (plan.presentOnly) {
        // Only the hover highlight changed: re-present the cached frame with
        // the overlay (no scene pass, no pick pass, jitter state untouched).
        if (presentFrame(pdc)) return;
        // The cached frame could not be served after all: render a regular
        // frame of the unchanged scene (see planFrame for the jitter restart).
        plan.restartJitter = true;
    }

    // gfx::ColorPtr pBgCol = pScene->getBgColor();
    // glClearColor(float(pBgCol->fr()), float(pBgCol->fg()),
    // float(pBgCol->fb()), 1.0f);
    setFogColorImpl(pdc);

    pdc->setLighting(false);

    ////////////////////////////////////////////////

    // Temporal-jitter: assume no further accumulation this frame unless the
    // pipeline path re-arms it below; keep the projection un-jittered for the
    // default setUpProjMat call (the pipeline path re-applies the per-sample
    // offset).
    m_jitterMoreSamples = false;
    m_jitterPxX = m_jitterPxY = 0.0;
    m_aoHalfPending = false;
    m_bFrameCached = false;

    if (isProjChange()) setUpProjMat(-1, -1);

    const bool hlActive = isHoverHighlightActive();

    switch (getStereoMode()) {
        default:
        case Camera::CSM_NONE: {
            // The off-screen frame pipeline serves AO (GTAO) and/or AA
            // (FXAA/SMAA/temporal jitter): the 3D scene is rendered into an
            // off-screen target so depth/color are available to the fullscreen
            // passes, then composited onto the default framebuffer. AO and AA
            // are independent: any of them routes the frame through the
            // pipeline; none of them = legacy direct rendering (hardware MSAA
            // on the default framebuffer). The hover highlight overlay needs a
            // re-presentable frame (its present-only frames replay the
            // pipeline's final stage), so while it is shown the plain mode goes
            // through the pipeline as well (AA-only composite = plain copy).
            const bool pipeAvail = hasFBO();
            const bool aoOn = pScene->isAOEnabled() && pipeAvail;
            const bool usePipeline =
                pipeAvail && (pScene->requiresFramePipeline() || hlActive);

            // Adaptive half-resolution AO: when aoHalfRes is enabled, the GTAO
            // term is computed at half resolution only while the camera is
            // moving (this frame was triggered by an update), then re-rendered
            // at full resolution once the view settles. getUpdateFlag() is true
            // for camera/scene-driven redraws and false for the idle continuous
            // redraws, so it distinguishes "moving" from "still".
            const bool aoHalfRes =
                aoOn && pScene->isAOHalfRes() && getUpdateFlag();
            if (usePipeline) {
                ensurePipeline(convToBackingX(getWidth()),
                               convToBackingY(getHeight()), aoHalfRes, aoOn);
            }
            // Owe a full-resolution follow-up frame after a half-res one, so the
            // idle loop keeps running until the still image is rendered at full
            // resolution (needed when temporal jitter is off and would not
            // otherwise re-arm the redraw).
            m_aoHalfPending = aoHalfRes;

            if (usePipeline && m_pPipeline != nullptr &&
                m_pPipeline->isReady()) {
                // Temporal-jitter supersampling (camera still): the pipeline
                // renders each jittered sample's final color, sums it into the
                // float accumulation buffer, and displays the running average.
                // Clamp to the supported range: levels above 5 have no jitter
                // table (would degenerate to a zero-offset average) and the huge
                // 1<<level sample count makes the per-sample weight so small that
                // the RGBA16F accumulation bands on smooth gradients.
                int jitterLevel = pScene->getAAJitterLevel();
                if (jitterLevel < 0) jitterLevel = 0;
                if (jitterLevel > 5) jitterLevel = 5;
                const bool jitterActive = jitterLevel > 0;
                const int jitterN = gfx::jitterSampleCount(jitterLevel);
                if (jitterActive) {
                    // Restart accumulation when the scene or camera changed
                    // (planFrame: view update flag / forceRedraw), when a
                    // present-only request fell back to this frame, or after
                    // convergence.
                    if (plan.sceneChanged || plan.restartJitter ||
                        m_jitterSampleIndex >= jitterN) {
                        m_jitterSampleIndex = 0;
                        MB_DPRINTLN("GUIView> jitter SS start (level=%d, %d samples)",
                                    jitterLevel, jitterN);
                    }
                    gfx::jitterOffset(jitterLevel, m_jitterSampleIndex, m_jitterPxX,
                                      m_jitterPxY);
                    setUpProjMat(-1, -1);  // apply this sample's jittered frustum
                }

                // Drive the off-screen pass chain. The camera constants come from
                // the View; the AO/AA/background settings are read from the Scene
                // by the pipeline; the scene geometry is rendered via the callback.
                FrameRenderParams params;
                params.camAoc = computeAoConstants();
                params.enableAO = aoOn;
                // Rotate the GTAO noise per accumulated jitter sample (R1
                // sequence) so the grain averages out; 0 when not jittering.
                if (jitterActive) {
                    const double t = double(m_jitterSampleIndex) * 0.6180339887;
                    params.aoNoiseOffset = float(t - std::floor(t));
                }
                params.enablePostAA = true;
                params.jitterActive = jitterActive;
                params.jitterIndex = m_jitterSampleIndex;
                params.jitterCount = jitterN;
                params.outRT = nullptr;  // live: default fb (or internal sample RT)
                params.blitDepthToDefault = true;

                m_pPipeline->render(pdc, pScene, params, [this, pdc, &pScene]() {
                    setUpModelMat(MM_NORMAL);
                    pScene->display(pdc);
                });
                m_bFrameCached = true;

                // Advance / converge the jitter accumulation. The pipeline ran
                // this sample; the View owns the sample index and the idle redraw
                // re-arm (needsContinuousRedraw reads m_jitterMoreSamples).
                if (jitterActive) {
                    MB_DPRINTLN("GUIView> jitter SS sample %d/%d",
                                m_jitterSampleIndex + 1, jitterN);
                    if (m_jitterSampleIndex + 1 < jitterN) {
                        m_jitterSampleIndex += 1;
                        m_jitterMoreSamples = true;  // keep redrawing on idle
                    } else {
                        m_jitterMoreSamples = false;  // converged
                        MB_DPRINTLN("GUIView> jitter SS converged (%d samples)",
                                    jitterN);
                    }
                }
            } else {
                setUpModelMat(MM_NORMAL);
                // glDrawBuffer(GL_BACK);
                // glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
                pdc->clearBuffer(pScene->getBgColor());

                // Draw main 3D objects
                pScene->display(pdc);
            }
            break;
        }

            //     ////////////////////////////////////////////////
            //     // Quad-buffer stereo
            // case Camera::CSM_HW_QBUF:

            //     // for right eye
            //     setUpModelMat(MM_STEREO_RIGHT);
            //     if (isSwapStereoEyes())
            //         glDrawBuffer(GL_BACK_LEFT);
            //     else
            //         glDrawBuffer(GL_BACK_RIGHT);
            //     glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            //     // Draw main 3D objects
            //     pScene->display(pdc);

            //     // for left eye
            //     setUpModelMat(MM_STEREO_LEFT);
            //     if (isSwapStereoEyes())
            //         glDrawBuffer(GL_BACK_RIGHT);
            //     else
            //         glDrawBuffer(GL_BACK_LEFT);
            //     glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            //     // Draw main 3D objects
            //     pScene->display(pdc);

            //     break;
    }

    ////////////////////////////////////////////////

    // The scene or camera changed: the pick ID buffer no longer matches the
    // frame. Progressive jitter samples and the AO follow-up re-render the same
    // scene, so they keep it valid (no pick pass while the highlight is shown).
    if (plan.sceneChanged) m_bPickDirty = true;

    // Hover highlight overlay (renders the pick buffer first when stale).
    if (hlActive) drawHoverOverlay(pdc);

    drawUiOverlays(pdc);

    swapBuffers();

    return;
}

/// clean-up the drawing display with the current bg color
void GUIView::clear()
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("OcView::clear() invalid scene %d !!", (int)getSceneID());
        return;
    }

    DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();
    pdc->clearBuffer(pScene->getBgColor());
}

//////////

using gfx::HittestContext;

LString GUIView::hitTest(int ax, int ay)
{
    m_hitdata.clear();

    qlib::uid_t rend_id = qlib::invalid_uid;

    // GPU ID-buffer pick (renderer-accurate, occlusion-aware) when the backend
    // supports it and the user has not switched it off. The CPU point hit
    // test remains the path for backends without the capability (uxp_gui),
    // for the switched-off state and, after a GPU miss, for renderers that
    // do not take part in the pick pass.
    bool bGpu = isGpuPickActive();
    if (!bGpu && m_pPickRT != nullptr) {
        // Switched off (or stereo): give the pick target's VRAM back; it is
        // recreated lazily when the GPU path is used again.
        releasePickBuffer();
    }
    if (bGpu && !hitTestGpu(ax, ay, rend_id)) {
        bGpu = false;  // GPU path unavailable at runtime: full CPU path
    }

    if (rend_id == qlib::invalid_uid) {
        bool bRunCpu = !bGpu;
        if (bGpu) {
            qsys::ScenePtr pScene = getScene();
            bRunCpu = !pScene.isnull() && pScene->hasCpuOnlyHitRenderers();
        }
        if (bRunCpu) {
            int x = convToBackingX(ax);
            int y = convToBackingY(ay);

            HittestContext hc;

            double dHitPrec =
                convToBackingX(qsys::ViewInputConfig::getInstance()->getHitPrec());

            // Perform hittest (single hit)
            if (!hitTestImpl(&hc, Vector4D(x, y, dHitPrec, dHitPrec), false, 1.0, bGpu))
                return LString();

            m_hitdata.createNearest(&hc);
            rend_id = m_hitdata.getNearestRendID();
        }
    }

    if (rend_id == qlib::invalid_uid) {
        // hit nothing
        return LString();
    }

    return formatHitResult(rend_id);
}

LString GUIView::formatHitResult(qlib::uid_t rend_id)
{
    qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
    if (pRend.isnull()) {
        LOG_DPRINTLN("FATAL ERROR: Unknown renderer id %d", rend_id);
        return LString();
    }

    qlib::uid_t sceneid = pRend->getSceneID();
    qlib::uid_t objid = pRend->getClientObjID();

    qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
    if (pObj.isnull()) {
        LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
        return LString();
    }

    MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", (int)sceneid, (int)rend_id, (int)objid);

    LString rval;
    {
        rval += "{";
        rval += pRend->interpHit(m_hitdata);
        rval += LString::format("\"scene_id\": %d,\n", sceneid);
        rval += LString::format("\"rend_id\": %d,\n", rend_id);
        rval += LString::format("\"rendtype\": \"%s\",\n", pRend->getTypeName());
        rval += LString::format("\"rend_name\": \"%s\",\n", pRend->getName().c_str());
        rval += LString::format("\"obj_id\": %d,\n", objid);
        rval += LString::format("\"obj_name\": \"%s\"\n", pObj->getName().c_str());
        rval += "}";
    }

    return rval;
}

LString GUIView::hitTestRect(int ax, int ay, int aw, int ah, bool bNearest)
{
    // Reset accumulated hit data from previous hit tests; createAll() below
    // appends to m_hitdata, so without this the result would include atoms
    // from earlier rectangle / single-click hit tests (same as hitTest()).
    m_hitdata.clear();

    int x = convToBackingX(ax);
    int y = convToBackingY(ay);
    int w = convToBackingX(aw);
    int h = convToBackingY(ah);

    double cnx = double(x) + double(w) / 2.0;
    double cny = double(y) + double(h) / 2.0;

    // HittestContext *phc = MB_NEW HittestContext();
    HittestContext hc;

    // Perform hittest (multiple hit)
    if (!hitTestImpl(&hc, Vector4D(cnx, cny, w, h), true, 1.0)) return LString();

    m_hitdata.createAll(&hc);

    int nrend = m_hitdata.getRendSize();
    if (nrend == 0)  // no hit
        return LString();

    std::vector<qlib::uid_t> rend_ids;
    if (bNearest) {
        nrend = 1;
        rend_ids.resize(1);
        rend_ids[0] = m_hitdata.getNearestRendID();
    } else {
        rend_ids.resize(nrend);
        m_hitdata.getRendArray(rend_ids.data(), nrend);
    }

    ////////////////////////

    std::set<int> objids;

    LString rval;
    rval += "[";

    for (int ii = 0; ii < nrend; ++ii) {
        qlib::uid_t rend_id = rend_ids[ii];

        if (rend_id == qlib::invalid_uid) {
            // empty entry
            continue;
        }

        qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
        if (pRend.isnull()) {
            LOG_DPRINTLN("GUIView.hitTestRect> FATAL ERROR: Unknown renderer id %d",
                         rend_id);
            return LString();
        }

        qlib::uid_t objid = pRend->getClientObjID();

        if (objids.find(objid) != objids.end()) {
            MB_DPRINTLN(
                "GUIView.hitTestRect> duplicated objid %d for rendid %d ignored", (int)objid,
                (int)rend_id);
            continue;
        }
        objids.insert(objid);

        qlib::uid_t sceneid = pRend->getSceneID();

        qsys::ObjectPtr pObj = SceneManager::getObjectS(objid);
        if (pObj.isnull()) {
            LOG_DPRINTLN("FATAL ERROR: Unknown object id %d", objid);
            return LString();
        }

        if (ii > 0) rval += ",";
        rval += "{";
        rval += LString::format("\"rend_id\": %d,\n", rend_id);

        rval += pRend->interpHit(m_hitdata);
        rval += LString::format("\"obj_id\": %d", objid);
        rval += "}";
        // MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);
    }
    rval += "]";

    return rval;
}

/// Ray-casting point-in-polygon test (logical-pixel screen space). Mirrors the
/// former TypeScript lasso implementation.
static bool pointInPolygon(double x, double y, const std::vector<double> &px,
                           const std::vector<double> &py)
{
    const size_t n = px.size();
    if (n < 3) return false;
    bool inside = false;
    for (size_t i = 0, j = n - 1; i < n; j = i++) {
        const bool cross = ((py[i] > y) != (py[j] > y)) &&
                           (x < (px[j] - px[i]) * (y - py[i]) / (py[j] - py[i]) + px[i]);
        if (cross) inside = !inside;
    }
    return inside;
}

LString GUIView::hitTestPolygon(qlib::LByteArrayPtr pPts, bool bNearest)
{
    // Vertices arrive as a FLOAT32 ByteArray [x0,y0,x1,y1,...] in logical
    // canvas pixels -- the same space as hitTestRect's input and projToScreen's
    // output.
    if (pPts.isnull()) return LString();
    const int npts = pPts->getElemCount() / 2;
    if (npts < 3) return LString();

    std::vector<double> polyx(npts), polyy(npts);
    double minX = 1e30, minY = 1e30, maxX = -1e30, maxY = -1e30;
    for (int i = 0; i < npts; ++i) {
        const double x = pPts->getAtF(i * 2);
        const double y = pPts->getAtF(i * 2 + 1);
        polyx[i] = x;
        polyy[i] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    const int bx = int(std::floor(minX));
    const int by = int(std::floor(minY));
    const int bw = int(std::ceil(maxX)) - bx;
    const int bh = int(std::ceil(maxY)) - by;
    if (bw <= 0 || bh <= 0) return LString();

    // Gather candidate elements in the polygon's bounding box. This is the
    // identical pick setup to hitTestRect, so candidates match the rubber-band
    // rectangle tool exactly (and inherit its DPR-robust projection).
    m_hitdata.clear();
    {
        const int x = convToBackingX(bx);
        const int y = convToBackingY(by);
        const int w = convToBackingX(bw);
        const int h = convToBackingY(bh);
        const double cnx = double(x) + double(w) / 2.0;
        const double cny = double(y) + double(h) / 2.0;
        HittestContext hc;
        if (!hitTestImpl(&hc, Vector4D(cnx, cny, w, h), true, 1.0)) return LString();
        m_hitdata.createAll(&hc);
    }

    int nrend = m_hitdata.getRendSize();
    if (nrend == 0) return LString();

    std::vector<qlib::uid_t> rend_ids;
    if (bNearest) {
        nrend = 1;
        rend_ids.resize(1);
        rend_ids[0] = m_hitdata.getNearestRendID();
    } else {
        rend_ids.resize(nrend);
        m_hitdata.getRendArray(rend_ids.data(), nrend);
    }

    std::set<qlib::uid_t> objids;
    LString rval = "[";
    bool first = true;

    for (int ii = 0; ii < nrend; ++ii) {
        const qlib::uid_t rend_id = rend_ids[ii];
        if (rend_id == qlib::invalid_uid) continue;

        qsys::RendererPtr pRend = SceneManager::getRendererS(rend_id);
        if (pRend.isnull()) continue;

        const qlib::uid_t objid = pRend->getClientObjID();
        if (objids.find(objid) != objids.end()) continue;
        objids.insert(objid);

        // Per-hit world positions (only MolCoord-type renderers supply them).
        std::vector<int> ids;
        std::vector<Vector4D> poss;
        pRend->getHitPositions(m_hitdata, ids, poss);
        if (ids.empty()) continue;

        // Keep the elements whose screen projection falls inside the polygon.
        // projToScreen uses the same camera that gathered the bounding-box
        // candidates, so this filter never diverges from the rectangle tool.
        qlib::RangeSet<int> range;
        for (size_t k = 0; k < ids.size(); ++k) {
            const qlib::LScrVector4D scr = projToScreen(poss[k]);
            if (pointInPolygon(scr.x(), scr.y(), polyx, polyy))
                range.append(ids[k], ids[k] + 1);
        }
        if (range.isEmpty()) continue;

        if (!first) rval += ",";
        first = false;
        rval += "{";
        rval += LString::format("\"rend_id\": %d,\n", rend_id);
        rval += "\"objtype\": \"MolCoord\",\n";
        rval += "\"sel\": \"aid " + qlib::rangeToString(range) + "\", ";
        rval += LString::format("\"obj_id\": %d", objid);
        rval += "}";
    }
    rval += "]";

    // No renderer contributed an in-polygon element.
    if (first) return LString();

    return rval;
}

qlib::LScrVector4D GUIView::projToScreen(const qlib::Vector4D &wpos)
{
    double slabdepth = getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;

    const double zoom = getZoom();
    const double dist = getViewDist();
    const double slabnear = dist - slabdepth / 2.0;
    const double slabfar = dist + slabdepth;
    const double vw = zoom / 2.0;
    const double width = getWidth();
    const double height = getHeight();
    const double fasp = (height > 0.0) ? (width / height) : 1.0;

    // Projection + model-view, matching hitTestImpl (minus the pick matrix).
    Matrix4D projmat;
    if (isPerspec())
        projmat = DisplayContext::makePersProjMat(vw, fasp, slabnear, slabfar, dist);
    else
        projmat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);

    Matrix4D mvmat;
    mvmat.translate(Vector4D(0, 0, -dist));
    mvmat.rotate(getRotQuat());
    const Vector4D cen = getViewCenter();
    mvmat.translate(Vector4D(-cen.x(), -cen.y(), -cen.z()));

    const Vector4D p(wpos.x(), wpos.y(), wpos.z(), 1.0);
    const Vector4D clip = projmat.mulvec(mvmat.mulvec(p));

    double w = clip.w();
    if (std::fabs(w) < 1.0e-8) w = (w < 0.0) ? -1.0e-8 : 1.0e-8;

    const double ndcx = clip.x() / w;
    const double ndcy = clip.y() / w;
    const double ndcz = clip.z() / w;

    // NDC -> logical screen pixels (top-left origin, y down).
    const double sx = (ndcx * 0.5 + 0.5) * width;
    const double sy = (0.5 - ndcy * 0.5) * height;

    return qlib::LScrVector4D(Vector4D(sx, sy, ndcz));
}

bool GUIView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
                          double far_factor, bool bCpuOnly /*= false*/)
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("hitTest: invalid scene %d !!", (int)getSceneID());
        return false;
    }

    HittestContext *phc = static_cast<HittestContext *>(pdc);

    // setUpHitProjMat(pdc, parm, far_factor);
    double slabdepth = getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;

    const double zoom = getZoom();
    const double dist = getViewDist();

    const double slabnear = dist - slabdepth / 2.0f;
    const double slabfar = dist + slabdepth * far_factor;
    const double vw = zoom / 2.0;
    const double cx = convToBackingX(getWidth());
    const double cy = convToBackingY(getHeight());
    const double fasp = (cy > 0.0) ? cx / cy : 1.0;

    MB_DPRINTLN("HitTestImpl> near=%f, far=%f, vw=%f, fasp=%f", slabnear, slabfar, vw,
                fasp);

    // Setup projection matrix
    Matrix4D projmat;
    if (isPerspec()) {
        projmat = DisplayContext::makePersProjMat(vw, fasp, slabnear, slabfar, dist);
        // projmat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
    } else {
        projmat = DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar);
    }

    /////
    // GLint viewport[4] = {0, 0, GLint(cx), GLint(cy)};
    // gluPickMatrix((GLfloat)parm.x(), (GLfloat)(cy - parm.y()),parm.z(), parm.w(),
    // viewport);
    const double pickx = parm.x();
    const double picky = cy - parm.y();
    const double deltax = parm.z();
    const double deltay = parm.w();

    Matrix4D pickmat;
    // Scale (cx / deltax, cy / deltay, 1)
    pickmat.aij(1, 1) = cx / deltax;
    pickmat.aij(2, 2) = cy / deltay;

    // Translate ((cx - 2.0 * pickx) / deltax, (cy - 2.0 * picky) / deltay, 0)
    pickmat.aij(1, 4) = (cx - 2.0 * pickx) / deltax;
    pickmat.aij(2, 4) = (cy - 2.0 * picky) / deltay;
    // pickmat.aij(3, 4) = 1.0;

    MB_DPRINTLN("PickMat:");
    pickmat.dump();

    MB_DPRINTLN("ProjMat:");
    projmat.dump();

    /////

    // phc->m_projMat = projmat.mul(pickmat);
    phc->m_projMat = pickmat.mul(projmat);

    // MB_DPRINTLN("PickMat * ProjMat:");
    // phc->m_projMat.dump();

    // 0 == no stereo
    // setUpModelMat(MM_NORMAL);
    phc->loadIdent();
    phc->translate(Vector4D(0, 0, -getViewDist()));
    phc->rotate(getRotQuat());
    const qlib::Vector4D c = getViewCenter();
    phc->translate(-c);

    // MB_DPRINTLN("*** ModelMat:");
    // phc->getModelViewMat().dump();

    pScene->processHit(phc, bCpuOnly);

    // phc->dump();

    return true;
}

//////////
// GPU ID-buffer picking

bool GUIView::isGpuPickActive() const
{
    if (!hasGpuPick()) return false;
    if (!qsys::ViewInputConfig::getInstance()->isGpuPick()) return false;
    return getStereoMode() == Camera::CSM_NONE;
}

bool GUIView::ensurePickTarget(int pw, int ph)
{
    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return false;

    if (m_pPickRT != nullptr) {
        if (m_pPickRT->getWidth() != pw || m_pPickRT->getHeight() != ph) {
            m_pPickRT->resize(pw, ph);
            m_bPickDirty = true;
        }
        return true;
    }

    m_pPickRT = pdc->createRenderTarget(
        pw, ph, gfx::RT_COLOR_RGBA32UI | gfx::RT_DEPTH_TEX | gfx::RT_COLOR_NEAREST);
    if (m_pPickRT == nullptr) {
        LOG_DPRINTLN("GUIView> cannot create the pick target (%dx%d)", pw, ph);
        return false;
    }
    m_bPickDirty = true;
    return true;
}

void GUIView::releasePickBuffer()
{
    if (m_pPickRT != nullptr) {
        delete m_pPickRT;
        m_pPickRT = nullptr;
    }
    m_pickRendTab.clear();
    m_bPickDirty = true;
}

bool GUIView::renderPickBuffer()
{
    if (!m_bPickDirty && m_pPickRT != nullptr) return true;

    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) return false;
    if (!safeSetCurrent()) return false;

    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return false;
    pdc->setCurrent();

    const int bw = convToBackingX(getWidth());
    const int bh = convToBackingY(getHeight());
    if (bw <= 0 || bh <= 0) return false;
    const int pw = std::max(1, int(std::ceil(double(bw) * PICK_SCALE)));
    const int ph = std::max(1, int(std::ceil(double(bh) * PICK_SCALE)));
    if (!ensurePickTarget(pw, ph)) return false;

    // Everything the pass touches is restored on scope exit, also when a
    // renderer throws: the next rAF frame must find neutral GL/context state.
    struct PassGuard
    {
        GUIView *pView;
        DisplayContext *pdc;
        gfx::RenderTarget *prt;
        Vector4D savedVp;
        Matrix4D savedProj;
        bool bound = false;
        ~PassGuard()
        {
            if (bound) prt->unbind();
            pdc->setPickMode(DisplayContext::PICK_OFF);
            pdc->setPickScale(1.0);
            pdc->resetNames();
            pdc->resetHitRendTable();
            pdc->setBlendEnabled(true);
            pdc->bindDefaultFramebuffer();
            pdc->setViewport(savedVp);
            pdc->setProjMat(savedProj);
            // The next frame recomputes its own (possibly jittered) projection.
            pView->setProjChange();
        }
    } guard{this, pdc, m_pPickRT, pdc->getViewport(), pdc->getProjMat()};

    // Un-jittered projection of the current camera (same aspect as the pick
    // target); only the viewport is scaled.
    setJitterOffsetPx(0.0, 0.0);
    setUpProjMat(-1, -1);
    pdc->setViewport(Vector4D(0, 0, pw, ph));

    pdc->setPickMode(DisplayContext::PICK_DRAW);
    pdc->setPickScale(double(pw) / double(bw));
    // Integer draw buffers reject blending (and blending would corrupt IDs).
    pdc->setBlendEnabled(false);
    pdc->setDepthTestEnabled(true);
    pdc->enableDepthTest(true);
    pdc->setLighting(false);

    m_pPickRT->bind();
    guard.bound = true;
    m_pPickRT->clear(0.0f, 0.0f, 0.0f, 0.0f);

    setUpModelMat(MM_NORMAL);
    pdc->resetHitRendTable();
    pScene->displayPick(pdc);
    m_pickRendTab = pdc->getHitRendTable();

    m_bPickDirty = false;
    return true;
}

bool GUIView::hitTestGpu(int ax, int ay, qlib::uid_t &rend_id)
{
    rend_id = qlib::invalid_uid;

    if (!renderPickBuffer()) return false;
    if (m_pPickRT == nullptr) return false;

    const int pw = m_pPickRT->getWidth();
    const int ph = m_pPickRT->getHeight();
    const int bw = convToBackingX(getWidth());
    const int bh = convToBackingY(getHeight());
    if (pw <= 0 || ph <= 0 || bw <= 0 || bh <= 0) return false;
    const double sx = double(pw) / double(bw);
    const double sy = double(ph) / double(bh);

    // Cursor position in pick texels, bottom-left origin (as hitTestImpl's
    // picky = cy - y).
    int px = int(std::floor(double(convToBackingX(ax)) * sx));
    int py = ph - 1 - int(std::floor(double(convToBackingY(ay)) * sy));
    px = std::clamp(px, 0, pw - 1);
    py = std::clamp(py, 0, ph - 1);

    // Search radius: half of the hit precision box, in pick texels.
    const double hitPrec =
        convToBackingX(qsys::ViewInputConfig::getInstance()->getHitPrec());
    int radius = int(std::ceil(hitPrec * 0.5 * sx));
    if (radius < 1) radius = 1;

    const int x0 = std::max(0, px - radius);
    const int y0 = std::max(0, py - radius);
    const int x1 = std::min(pw - 1, px + radius);
    const int y1 = std::min(ph - 1, py + radius);
    const int w = x1 - x0 + 1;
    const int h = y1 - y0 + 1;

    std::vector<quint32> buf(size_t(w) * size_t(h) * 4u);
    if (!m_pPickRT->readColorUInt(0, x0, y0, w, h, buf.data())) return false;

    gfx::PickTexel texel;
    if (!gfx::findNearestPickTexel(buf.data(), w, h, px - x0, py - y0, radius, texel)) {
        return true;  // the GPU pass ran; nothing under the cursor
    }

    if (!pickTexelToHitData(m_hitdata, m_pickRendTab, texel)) return true;
    rend_id = m_hitdata.getNearestRendID();
    return true;
}

// static
bool GUIView::pickTexelToHitData(gfx::HitData &hd,
                                 const std::vector<qlib::uid_t> &rendTab,
                                 const gfx::PickTexel &texel)
{
    if (texel.rend == 0u || size_t(texel.rend) > rendTab.size()) return false;

    const int name = gfx::decodeHitName(texel.name);
    if (name < 0) return false;

    // Name list layout matches HittestContext::callDisplayList: outer names
    // first, the element name last.
    std::vector<int> names;
    const int outer = gfx::decodeHitName(texel.outer);
    if (outer >= 0) names.push_back(outer);
    names.push_back(name);

    hd.addHit(rendTab[texel.rend - 1], names);
    return true;
}

//////////
// Framebuffer operations

qsys::View *GUIView::createOffScreenView(int w, int h, int aa_depth)
{
    // aa_depth (multisample) is not supported yet. The off-screen view always
    // renders at its maximum jitter-supersample level (see OffScreenView ctor).
    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return nullptr;

    auto *pView = MB_NEW OffScreenView(pdc, w, h,
                                       gfx::RT_COLOR_RGBA8 | gfx::RT_DEPTH_TEX);
    if (!pView->isValid()) {
        // Off-screen rendering not supported by this display context.
        delete pView;
        return nullptr;
    }
    return pView;
}

void GUIView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize,
                         int ncomp)
{
    // not implemented yet
}

void GUIView::setFogColorImpl(DisplayContext *pdc)
{
    qsys::ScenePtr pScene = getScene();
    gfx::ColorPtr pBgCol = pScene->getBgColor();
    if (pdc == nullptr) {
        pdc = getDisplayContext();
        pdc->setCurrent();
    }
    pdc->setFogColor(pBgCol);
}

//////////
// Screen-space ambient occlusion (GTAO) live path

void GUIView::ensurePipeline(int w, int h, bool halfRes, bool aoEnabled)
{
    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return;

    // Lazily create the pipeline (the display context is not valid in the GUIView
    // constructor, so this cannot be done there).
    if (m_pPipeline == nullptr) m_pPipeline = MB_NEW FrameRenderPipeline();
    m_pPipeline->setSize(pdc, w, h, halfRes, aoEnabled);
}

gfx::AoConstants GUIView::computeAoConstants() const
{
    // Geometric (camera-derived) part only. The AO tuning fields (effectRadius /
    // finalValuePower / slice & step counts / fog) are filled by the caller from
    // the Scene properties. Perspective and orthographic projections reconstruct
    // view space differently, so fromCamera branches on the projection mode.
    const double aspect = (getHeight() > 0) ? double(getWidth()) / double(getHeight()) : 1.0;
    const int bcx = convToBackingX(getWidth());
    const int bcy = convToBackingY(getHeight());
    return gfx::AoConstants::fromCamera(getViewDist(), double(getZoom()),
                                        getSlabDepth(), aspect, bcx, bcy,
                                        isPerspec());
}

bool GUIView::renderAOColorFrame(DisplayContext *pdc, const ScenePtr &pScene,
                                 gfx::RenderTarget *outRT, bool bgTransparent,
                                 float aoNoiseOffset)
{
    if (outRT == nullptr) return false;

    const int bw = outRT->getWidth();
    const int bh = outRT->getHeight();

    const bool useAO = pScene->isAOEnabled() && hasFBO();
    // The off-screen export always renders the AO term at full resolution: the
    // half-res mode is a live-interaction optimization (see drawScene), not a
    // quality setting, so an exported still must not inherit it. The AO-off
    // plain-scene fallback below is equivalent to an AA-only pipeline composite
    // (this path never applies spatial post-AA), so the pipeline is only set up
    // for AO here; pass params.enableAO when export post-AA is added.
    if (useAO) ensurePipeline(bw, bh, /*halfRes=*/false, /*aoEnabled=*/true);

    if (useAO && m_pPipeline != nullptr && m_pPipeline->isReady()) {
        // Composite-only chain (no spatial post-AA, no jitter, no UI depth blit),
        // written to outRT. Shares FrameRenderPipeline::render with the live path.
        FrameRenderParams params;
        params.camAoc = computeAoConstants();
        params.aoNoiseOffset = aoNoiseOffset;
        params.bgTransparent = bgTransparent;
        params.enablePostAA = false;
        params.jitterActive = false;
        params.outRT = outRT;
        params.blitDepthToDefault = false;

        return m_pPipeline->render(pdc, pScene, params, [this, pdc, &pScene]() {
            setUpModelMat(MM_NORMAL);
            pScene->display(pdc);
        });
    }

    // Plain scene (AO off / unavailable) -> outRT.
    gfx::ColorPtr bg = pScene->getBgColor();
    const float bg_a = bgTransparent ? 0.0f : 1.0f;
    outRT->bind();
    setUpModelMat(MM_NORMAL);
    outRT->clear(float(bg->fr()), float(bg->fg()), float(bg->fb()), bg_a);
    pScene->display(pdc);
    outRT->unbind();
    return false;
}

//////////
// Mouse event handling

void GUIView::dispatchMouseEvent(int nType, InDevEvent &ev)
{
    switch (nType) {
        case DME_MOUSE_DOWN:
            // MB_DPRINTLN("onMouseDown (%d, %d) (%d, %d) %x", ev.getX(), ev.getY(),
            //             ev.getRootX(), ev.getRootY(), ev.getModifier());
            m_meh.buttonDown(ev);
            break;
        case DME_MOUSE_MOVE:
            if (!m_meh.move(ev)) {
                return;
            }
            break;
        case DME_MOUSE_UP:
            if (!m_meh.buttonUp(ev)) {
                return;
            }
            break;
        case DME_WHEEL:
            break;
        default:
            MB_DPRINTLN("GUIView::dispatchMouseEvent unknown nType %d", nType);
            return;
    }
    fireInDevEvent(ev);
}

void GUIView::onMouseDown(double clientX, double clientY, double screenX,
                          double screenY, int modif)
{
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_DOWN, ev);
}

void GUIView::onMouseUp(double clientX, double clientY, double screenX, double screenY,
                        int modif)
{
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_UP, ev);
}

void GUIView::onMouseMove(double clientX, double clientY, double screenX,
                          double screenY, int modif)
{
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_MOVE, ev);
}

void GUIView::onWheel(double clientX, double clientY, double screenX, double screenY,
                      int modif, double deltaX, double deltaY)
{
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    ev.setType(InDevEvent::INDEV_WHEEL);
    ev.setDeltaX(int(std::lround(deltaX)));
    ev.setDeltaY(int(std::lround(deltaY)));
    dispatchMouseEvent(DME_WHEEL, ev);
}

void GUIView::onGesture(double clientX, double clientY, double screenX,
                        double screenY, int modif, int axisID, double delta)
{
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    ev.setType(InDevEvent::INDEV_GESTURE);
    ev.setGestureAxis(axisID);
    ev.setDeltaX(0);
    ev.setDeltaY(int(std::lround(delta)));
    fireInDevEvent(ev);
}

void GUIView::setupInDevEvent(double clientX, double clientY, double screenX,
                              double screenY, int amodif, InDevEvent &ev)
{
    ev.setX(int(clientX));
    ev.setY(int(clientY));

    ev.setRootX(int(screenX));
    ev.setRootY(int(screenY));

    int modif = 0;

    if (amodif & 1)   modif |= InDevEvent::INDEV_LBTN;
    if (amodif & 2)   modif |= InDevEvent::INDEV_RBTN;
    if (amodif & 4)   modif |= InDevEvent::INDEV_MBTN;
    if (amodif & 32)  modif |= InDevEvent::INDEV_CTRL;
    if (amodif & 64)  modif |= InDevEvent::INDEV_SHIFT;
    if (amodif & 128) modif |= InDevEvent::INDEV_ALT;

    // MB_DPRINTLN("setupInDevEvent: amodif=%d -> modif=%d", amodif, modif);
    ev.setModifier(modif);
}

}  // namespace qsys

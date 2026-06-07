// -*-Mode: C++;-*-
//
// View: Generic Molecule View Class
//
// $Id: View.cpp,v 1.48 2011/03/13 12:02:45 rishitani Exp $
//

#include <common.h>
#include "GUIView.hpp"
#include "OffScreenView.hpp"

#include <gfx/HittestContext.hpp>
#include <gfx/RenderTarget.hpp>
#include <gfx/PostProcGpuPrim.hpp>
#include <gfx/JitterSamples.hpp>
#include <qlib/LPerfMeas.hpp>

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
    cleanupAORTs();
}

void GUIView::unloading()
{
    // Release AO GPU resources while the GL context is still alive (the base
    // unloading tears down the display context). The destructor also calls
    // cleanupAORTs() as a fallback, but by then getDisplayContext() is gone.
    cleanupAORTs();
    super_t::unloading();
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
    double fasp = (double)cx / (double)cy;

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

void GUIView::drawScene()
{
    // MB_DPRINTLN("GUIView::drawScene called");

    // if (!m_bInitOK) return;
    if (!safeSetCurrent()) return;

    qlib::AutoPerfMeas apm(PM_DRAW_SCENE);

    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
        return;
    }

    DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();

    // gfx::ColorPtr pBgCol = pScene->getBgColor();
    // glClearColor(float(pBgCol->fr()), float(pBgCol->fg()),
    // float(pBgCol->fb()), 1.0f);
    setFogColorImpl(pdc);

    pdc->setLighting(false);

    ////////////////////////////////////////////////

    // Temporal-jitter: assume no further accumulation this frame unless the AO
    // path re-arms it below; keep the projection un-jittered for the default
    // setUpProjMat call (the AO path re-applies the per-sample offset).
    m_jitterMoreSamples = false;
    m_jitterPxX = m_jitterPxY = 0.0;

    if (isProjChange()) setUpProjMat(-1, -1);

    switch (getStereoMode()) {
        default:
        case Camera::CSM_NONE: {
            // Screen-space ambient occlusion (GTAO) renders the 3D scene into
            // an off-screen target so depth/color are available to a fullscreen
            // pass, then composites the result onto the default framebuffer.
            const bool useAO = pScene->isAOEnabled() && hasFBO() &&
                               getStereoMode() == Camera::CSM_NONE;

            if (useAO) {
                ensureAORTs(convToBackingX(getWidth()),
                            convToBackingY(getHeight()));
            }

            if (useAO && m_pAOSceneRT != nullptr && m_pAoRT != nullptr &&
                m_pAoDenRT != nullptr && m_pAOPostProc != nullptr) {
                // Temporal-jitter supersampling (camera still): render each
                // jittered sample's final color into m_pJitterSampleRT, sum into
                // the float accumulation buffer, and display the running average.
                // Clamp to the supported range: levels above 5 have no jitter
                // table (would degenerate to a zero-offset average) and the huge
                // 1<<level sample count makes the per-sample weight so small that
                // the RGBA16F accumulation bands on smooth gradients.
                int jitterLevel = pScene->getAAJitterLevel();
                if (jitterLevel < 0) jitterLevel = 0;
                if (jitterLevel > 5) jitterLevel = 5;
                const bool jitterActive = jitterLevel > 0 &&
                                          m_pJitterSampleRT != nullptr &&
                                          m_pJitterAccumRT != nullptr;
                const int jitterN = gfx::jitterSampleCount(jitterLevel);
                if (jitterActive) {
                    // Restart accumulation on any externally-requested redraw:
                    // camera changes set the view update flag; scene-content
                    // changes arrive via forceRedraw (-> m_jitterResetRequested).
                    if (getUpdateFlag() || m_jitterResetRequested ||
                        m_jitterSampleIndex >= jitterN) {
                        m_jitterSampleIndex = 0;
                        MB_DPRINTLN("GUIView> jitter SS start (level=%d, %d samples)",
                                    jitterLevel, jitterN);
                    }
                    m_jitterResetRequested = false;
                    gfx::jitterOffset(jitterLevel, m_jitterSampleIndex, m_jitterPxX,
                                      m_jitterPxY);
                    setUpProjMat(-1, -1);  // apply this sample's jittered frustum
                }
                // Final 3D color goes to the sample target when jittering,
                // otherwise straight to the default framebuffer (nullptr).
                gfx::RenderTarget *outRT = jitterActive ? m_pJitterSampleRT : nullptr;

                // 1. Render the 3D scene into the off-screen target.
                m_pAOSceneRT->bind();
                setUpModelMat(MM_NORMAL);
                gfx::ColorPtr bg = pScene->getBgColor();
                m_pAOSceneRT->clear(float(bg->fr()), float(bg->fg()),
                                  float(bg->fb()), 1.0f);
                pScene->display(pdc);
                m_pAOSceneRT->unbind();

                // 2. GTAO pass: read the scene depth, write AO + packed edges
                // into the AO target (no depth attachment -> not depth-rejected).
                gfx::AoConstants aoc = computeAoConstants();
                aoc.effectRadius = float(pScene->getAORadius());
                aoc.finalValuePower = float(pScene->getAOIntensity());
                aoc.sliceCount = pScene->getAOSlices();
                aoc.stepsPerSlice = pScene->getAOSteps();
                m_pAoRT->bind();
                m_pAoRT->clear(1.0f, 1.0f, 1.0f, 1.0f);
                m_pAOPostProc->drawGtao(pdc, m_pAOSceneRT, aoc, /*debugMode=*/0);
                m_pAoRT->unbind();

                // 3. Edge-aware denoise of the AO term (single pass). The base
                // noise is kept low by a high slice count instead of heavy
                // blurring, which would dilute the broad soft AO on convex
                // surfaces toward white.
                m_pAoDenRT->bind();
                m_pAOPostProc->drawDenoise(pdc, m_pAoRT, aoc);
                m_pAoDenRT->unbind();

                // 4. Composite scene color * denoised AO, then apply the
                // selected post-process AA. The fullscreen passes must not be
                // depth-rejected. The off-screen scene was rendered single-
                // sample (no MSAA on the FBO), so an AA stage here restores the
                // edge antialiasing lost in the AO path.
                //   none: composite straight to the default framebuffer.
                //   fxaa: composite to the LINEAR m_pCompRT, then FXAA to the
                //         default framebuffer.
                //   smaa: composite to m_pCompRT, then SMAA 1x (edges ->
                //         weights -> blend) to the default framebuffer.
                const int aaMethod = pScene->getAAMethod();
                const bool postAA = (aaMethod == Scene::AA_FXAA ||
                                     aaMethod == Scene::AA_SMAA) &&
                                    m_pCompRT != nullptr;
                pdc->setDepthTestEnabled(false);
                if (postAA) {
                    // Blending is enabled globally for the scene color pass, but
                    // the post-AA passes write data (SMAA edges have alpha 0, the
                    // weights' alpha carries data); with GL_BLEND on their output
                    // would be discarded. Disable it for the off-screen AA passes.
                    pdc->setBlendEnabled(false);

                    m_pCompRT->bind();
                    m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, m_pAoDenRT);
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
                        m_pAOPostProc->drawSmaaBlend(pdc, m_pCompRT, m_pSmaaWeightRT,
                                                     aoc);
                        if (outRT != nullptr) outRT->unbind();
                    } else {
                        if (outRT != nullptr) outRT->bind();
                        m_pAOPostProc->drawFxaa(pdc, m_pCompRT, aoc);
                        if (outRT != nullptr) outRT->unbind();
                    }

                    pdc->setBlendEnabled(true);
                } else {
                    if (outRT != nullptr) outRT->bind();
                    m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, m_pAoDenRT);
                    if (outRT != nullptr) outRT->unbind();
                }

                // Temporal-jitter accumulate + display (when active). The final
                // color of this sample is in m_pJitterSampleRT.
                if (jitterActive) {
                    const float invN = 1.0f / float(jitterN);
                    // Additive sum into the float accumulation buffer (cleared on
                    // the first sample).
                    m_pJitterAccumRT->bind();
                    if (m_jitterSampleIndex == 0)
                        m_pJitterAccumRT->clear(0.0f, 0.0f, 0.0f, 0.0f);
                    pdc->setBlendEnabled(true);
                    pdc->setBlendModeAdd(true);
                    m_pAOPostProc->drawJitterCompose(pdc, m_pJitterSampleRT, invN);
                    pdc->setBlendModeAdd(false);
                    pdc->setBlendEnabled(false);
                    m_pJitterAccumRT->unbind();

                    // Display the normalized partial average to the default fb.
                    const float disp =
                        float(jitterN) / float(m_jitterSampleIndex + 1);
                    m_pAOPostProc->drawJitterCompose(pdc, m_pJitterAccumRT, disp);

                    // Restore over-blend for the UI overlay drawn afterwards.
                    pdc->setBlendEnabled(true);

                    MB_DPRINTLN("GUIView> jitter SS sample %d/%d",
                                m_jitterSampleIndex + 1, jitterN);

                    // Advance / converge.
                    if (m_jitterSampleIndex + 1 < jitterN) {
                        m_jitterSampleIndex += 1;
                        m_jitterMoreSamples = true;  // keep redrawing on idle
                    } else {
                        m_jitterMoreSamples = false;  // converged
                        MB_DPRINTLN("GUIView> jitter SS converged (%d samples)",
                                    jitterN);
                    }
                }
                pdc->setDepthTestEnabled(true);

                // Restore the scene depth into the default framebuffer so the
                // UI overlays below depth-test against the scene as usual.
                m_pAOSceneRT->blitDepthToDefault();
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

    swapBuffers();

    return;
}

/// clean-up the drawing display with the current bg color
void GUIView::clear()
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("OcView::clear() invalid scene %d !!", getSceneID());
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

    int x = convToBackingX(ax);
    int y = convToBackingY(ay);

    // HittestContext *phc = MB_NEW HittestContext();
    HittestContext hc;

    double dHitPrec =
        convToBackingX(qsys::ViewInputConfig::getInstance()->getHitPrec());

    // Perform hittest (single hit)
    if (!hitTestImpl(&hc, Vector4D(x, y, dHitPrec, dHitPrec), false, 1.0))
        return LString();

    m_hitdata.createNearest(&hc);

    qlib::uid_t rend_id = m_hitdata.getNearestRendID();
    if (rend_id == qlib::invalid_uid) {
        // hit nothing
        return LString();
    }

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

    MB_DPRINTLN("Hittest OK: sc=%d, rend=%d, obj=%d", sceneid, rend_id, objid);

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
                "GUIView.hitTestRect> duplicated objid %d for rendid %d ignored", objid,
                rend_id);
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

bool GUIView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
                          double far_factor)
{
    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("hitTest: invalid scene %d !!", getSceneID());
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
    const double fasp = cx / cy;

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

    pScene->processHit(phc);

    // phc->dump();

    return true;
}

//////////
// Framebuffer operations

qsys::View *GUIView::createOffScreenView(int w, int h, int aa_depth)
{
    // aa_depth (multisample) is not supported yet.
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

void GUIView::ensureAORTs(int w, int h)
{
    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return;

    if (m_pAOSceneRT == nullptr) {
        // The normal attachment (MRT) lets the GTAO pass use real geometry
        // normals instead of depth-reconstructed ones.
        m_pAOSceneRT = pdc->createRenderTarget(
            w, h, gfx::RT_COLOR_RGBA8 | gfx::RT_DEPTH_TEX | gfx::RT_NORMAL_RGBA16F);
    } else {
        m_pAOSceneRT->resize(w, h);
    }

    // AO targets hold packed data (AO + edges) and must use NEAREST filtering.
    const int aoFlags = gfx::RT_COLOR_RGBA8 | gfx::RT_COLOR_NEAREST;
    if (m_pAoRT == nullptr) {
        m_pAoRT = pdc->createRenderTarget(w, h, aoFlags);
    } else {
        m_pAoRT->resize(w, h);
    }

    if (m_pAoDenRT == nullptr) {
        m_pAoDenRT = pdc->createRenderTarget(w, h, aoFlags);
    } else {
        m_pAoDenRT->resize(w, h);
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
        m_pJitterAccumRT = pdc->createRenderTarget(w, h, gfx::RT_COLOR_RGBA16F);
    } else {
        m_pJitterAccumRT->resize(w, h);
    }

    if (m_pAOPostProc == nullptr) {
        m_pAOPostProc = MB_NEW gfx::PostProcGpuPrim();
    }
}

gfx::AoConstants GUIView::computeAoConstants() const
{
    // Camera slab planes, matching setUpProjMat's near/far derivation.
    const double dist = getViewDist();
    double slabdepth = getSlabDepth();
    if (slabdepth <= 0.1) slabdepth = 0.1;
    double slabnear = dist - slabdepth / 2.0;
    if (slabnear < 0.1) slabnear = 0.1;
    const double slabfar = dist + slabdepth;

    // Perspective half-FOV: makePersProjMat uses t = dist / (zoom/2), with
    // P[1][1] = t (so tanHalfFOVY = 1/t = (zoom/2)/dist) and P[0][0] = t/aspect
    // (so tanHalfFOVX = aspect * tanHalfFOVY).
    const double width = double(getZoom()) / 2.0;
    const double aspect = double(getWidth()) / double(getHeight());
    const double tanHalfFovY = width / dist;
    const double tanHalfFovX = tanHalfFovY * aspect;

    const int bcx = convToBackingX(getWidth());
    const int bcy = convToBackingY(getHeight());

    gfx::AoConstants c;
    // viewZ = mul / (add - rawDepth); matches XeGTAO with GL window depth [0,1].
    c.depthLinearizeMul = float(slabfar * slabnear / (slabfar - slabnear));
    c.depthLinearizeAdd = float(slabfar / (slabfar - slabnear));
    // GL uses a bottom-up [0,1] UV (postproc_vert v_uv), so viewY keeps the
    // same sign as the NDC mapping (unlike XeGTAO's top-down DX convention).
    c.ndcToViewMul[0] = float(2.0 * tanHalfFovX);
    c.ndcToViewMul[1] = float(2.0 * tanHalfFovY);
    c.ndcToViewAdd[0] = float(-tanHalfFovX);
    c.ndcToViewAdd[1] = float(-tanHalfFovY);
    c.viewportPixelSize[0] = (bcx > 0) ? 1.0f / float(bcx) : 0.0f;
    c.viewportPixelSize[1] = (bcy > 0) ? 1.0f / float(bcy) : 0.0f;
    // The AO tuning fields (effectRadius / finalValuePower / sliceCount) are
    // filled by the caller from the Scene properties.
    return c;
}

bool GUIView::renderAOColorFrame(DisplayContext *pdc, const ScenePtr &pScene,
                                 gfx::RenderTarget *outRT, bool bgTransparent)
{
    if (outRT == nullptr) return false;

    const int bw = outRT->getWidth();
    const int bh = outRT->getHeight();
    const float bg_a = bgTransparent ? 0.0f : 1.0f;
    gfx::ColorPtr bg = pScene->getBgColor();

    const bool useAO = pScene->isAOEnabled() && hasFBO();
    if (useAO) ensureAORTs(bw, bh);

    if (useAO && m_pAOSceneRT != nullptr && m_pAoRT != nullptr &&
        m_pAoDenRT != nullptr && m_pAOPostProc != nullptr) {
        // 1. Scene -> AO scene target (color + depth + MRT normal).
        m_pAOSceneRT->bind();
        setUpModelMat(MM_NORMAL);
        m_pAOSceneRT->clear(float(bg->fr()), float(bg->fg()), float(bg->fb()), bg_a);
        pScene->display(pdc);
        m_pAOSceneRT->unbind();

        // 2. GTAO + 3. denoise.
        gfx::AoConstants aoc = computeAoConstants();
        aoc.effectRadius = float(pScene->getAORadius());
        aoc.finalValuePower = float(pScene->getAOIntensity());
        aoc.sliceCount = pScene->getAOSlices();
        aoc.stepsPerSlice = pScene->getAOSteps();
        m_pAoRT->bind();
        m_pAoRT->clear(1.0f, 1.0f, 1.0f, 1.0f);
        m_pAOPostProc->drawGtao(pdc, m_pAOSceneRT, aoc, /*debugMode=*/0);
        m_pAoRT->unbind();
        m_pAoDenRT->bind();
        m_pAOPostProc->drawDenoise(pdc, m_pAoRT, aoc);
        m_pAoDenRT->unbind();

        // 4. Composite (color * AO) -> outRT. No spatial post-AA. Blend off so
        // the fullscreen pass replaces (transparent-bg pixels keep alpha 0).
        pdc->setDepthTestEnabled(false);
        pdc->setBlendEnabled(false);
        outRT->bind();
        m_pAOPostProc->drawComposite(pdc, m_pAOSceneRT, m_pAoDenRT);
        outRT->unbind();
        pdc->setBlendEnabled(true);
        pdc->setDepthTestEnabled(true);
        return true;
    }

    // Plain scene (AO off / unavailable) -> outRT.
    outRT->bind();
    setUpModelMat(MM_NORMAL);
    outRT->clear(float(bg->fr()), float(bg->fg()), float(bg->fb()), bg_a);
    pScene->display(pdc);
    outRT->unbind();
    return false;
}

void GUIView::cleanupAORTs()
{
    // The render target and the post-proc primitive's VBO both guard the GL
    // context themselves (via the parent view looked up by ID in their
    // destructors), so do NOT call getDisplayContext() here. cleanupAORTs runs
    // from ~GUIView, after the concrete view subclass is already destroyed,
    // where getDisplayContext() is a pure-virtual call (crash).
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

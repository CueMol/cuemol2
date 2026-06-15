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

#include <cmath>
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
    if (m_pPipeline != nullptr) {
        m_pPipeline->dispose();
        delete m_pPipeline;
        m_pPipeline = nullptr;
    }
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
    m_aoHalfPending = false;

    if (isProjChange()) setUpProjMat(-1, -1);

    switch (getStereoMode()) {
        default:
        case Camera::CSM_NONE: {
            // Screen-space ambient occlusion (GTAO) renders the 3D scene into
            // an off-screen target so depth/color are available to a fullscreen
            // pass, then composites the result onto the default framebuffer.
            const bool useAO = pScene->isAOEnabled() && hasFBO() &&
                               getStereoMode() == Camera::CSM_NONE;

            // Adaptive half-resolution AO: when aoHalfRes is enabled, the GTAO
            // term is computed at half resolution only while the camera is
            // moving (this frame was triggered by an update), then re-rendered
            // at full resolution once the view settles. getUpdateFlag() is true
            // for camera/scene-driven redraws and false for the idle continuous
            // redraws, so it distinguishes "moving" from "still".
            const bool aoHalfRes =
                useAO && pScene->isAOHalfRes() && getUpdateFlag();
            if (useAO) {
                ensurePipeline(convToBackingX(getWidth()),
                               convToBackingY(getHeight()), aoHalfRes);
            }
            // Owe a full-resolution follow-up frame after a half-res one, so the
            // idle loop keeps running until the still image is rendered at full
            // resolution (needed when temporal jitter is off and would not
            // otherwise re-arm the redraw).
            m_aoHalfPending = aoHalfRes;

            if (useAO && m_pPipeline != nullptr && m_pPipeline->isReady()) {
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

                // Drive the off-screen pass chain. The camera constants come from
                // the View; the AO/AA/background settings are read from the Scene
                // by the pipeline; the scene geometry is rendered via the callback.
                FrameRenderParams params;
                params.camAoc = computeAoConstants();
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

void GUIView::ensurePipeline(int w, int h, bool halfRes)
{
    DisplayContext *pdc = getDisplayContext();
    if (pdc == nullptr) return;

    // Lazily create the pipeline (the display context is not valid in the GUIView
    // constructor, so this cannot be done there).
    if (m_pPipeline == nullptr) m_pPipeline = MB_NEW FrameRenderPipeline();
    m_pPipeline->setSize(pdc, w, h, halfRes);
}

gfx::AoConstants GUIView::computeAoConstants() const
{
    // Geometric (camera-derived) part only. The AO tuning fields (effectRadius /
    // finalValuePower / slice & step counts / fog) are filled by the caller from
    // the Scene properties. Perspective and orthographic projections reconstruct
    // view space differently, so fromCamera branches on the projection mode.
    const double aspect = double(getWidth()) / double(getHeight());
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
    // quality setting, so an exported still must not inherit it.
    if (useAO) ensurePipeline(bw, bh, /*halfRes=*/false);

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

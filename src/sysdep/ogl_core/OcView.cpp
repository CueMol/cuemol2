// -*-Mode: C++;-*-
//
//  OpenGL Core Profile molecular viewer implementation
//

#include <common.h>

#ifdef HAVE_GL_GLEW_H
#define GLEW_STATIC
#include <GL/glew.h>
#endif

#ifdef HAVE_GL_GL_H
#include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#include <OpenGL/gl.h>
#else
#error no gl.h
#endif

#ifdef HAVE_GL_GLU_H
#include <GL/glu.h>
#elif defined(HAVE_OPENGL_GLU_H)
#include <OpenGL/glu.h>
#else
#error no glu.h
#endif

#include "OcView.hpp"

#include <qlib/Utils.hpp>
#include <qlib/LPerfMeas.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

#ifdef HAVE_OGL_FBO
#include "OglFBOView.hpp"
#endif

#include "OcDisplayContext.hpp"
#include "OcViewCap.hpp"
#include "CenterMarkDrawObj.hpp"

#include <gfx/HittestContext.hpp>
#include <gfx/SolidColor.hpp>

namespace sysdep {

using gfx::DisplayContext;
using qsys::Camera;
using qsys::Object;
using qsys::Renderer;
using qsys::SceneManager;

OcView::OcView()
{
    m_bInitOK = false;
}

OcView::~OcView() {}

LString OcView::toString() const
{
    return LString::format("OpenGL CoreProf View(%p)", this);
}

void OcView::setup()
{
    if (!safeSetCurrent()) return;
    OcDisplayContext *pdc = static_cast<OcDisplayContext *>(getDisplayContext());

    glEnable(GL_DEPTH_TEST);
    glEnable(GL_CULL_FACE);

    glClearDepth(1.0f);

    glEnable(GL_NORMALIZE);
    glShadeModel(GL_SMOOTH);
    // glShadeModel(GL_FLAT);

    glEnable(GL_LINE_SMOOTH);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glEnable(GL_BLEND);

    // glDisable(GL_LINE_SMOOTH);
    // glDisable(GL_BLEND);

    pdc->enableFog(true);
    pdc->setFogColor(gfx::SolidColor::createRGB(0.0, 0.0, 0.0));

    setUpProjMat(-1, -1);
    setUpLightColor();

    // clear();
    MB_DPRINTLN("OcView::setup() OK.");

#ifdef HAVE_GLEW
    GLenum err = glewInit();
    if (GLEW_OK != err) {
        LOG_DPRINTLN("OcView> glewInit failed!!");
    } else {
        MB_DPRINTLN("OcView> glewInit OK.");
    }
#endif

    // set view capability flag object
    {
        OcViewCap *pVC = new OcViewCap();
        setViewCap(pVC);
    }

    try {
        pdc->init();
    } catch (qlib::LException &e) {
        LOG_DPRINTLN("Exception: %s", e.getMsg().c_str());
        LOG_DPRINTLN("OglDispCtxt init() failed!!");
        setViewCap(NULL);
    } catch (...) {
        LOG_DPRINTLN("OglDispCtxt init() failed!!");
        setViewCap(NULL);
    }

    if (useSclFac()) pdc->setPixSclFac(getSclFacX());

    GLint buffers, samples;
    glGetIntegerv(GL_SAMPLE_BUFFERS, &buffers);
    glGetIntegerv(GL_SAMPLES, &samples);
    LOG_DPRINTLN("OcView> GL_SAMPLE_BUFFERS=%d, GL_SAMPLES=%d", buffers, samples);
    if (buffers > 0 && samples > 0) {
        glEnable(GL_MULTISAMPLE);
        LOG_DPRINTLN("OcView> MSAA enabled");
    }

    // Default VAO
    GLuint vao;
    glGenVertexArrays(1, &vao);
    glBindVertexArray(vao);

    auto pMark = qsys::DrawObjPtr(MB_NEW CenterMarkDrawObj());
    pMark->setEnabled(true);
    addDrawObj("CenterMarkDrawObj", pMark);
}

// setup the projection matrix
void OcView::setUpProjMat(int cx, int cy)
{
    GLenum errc;

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

    MB_DPRINTLN("OcView.setUpProjMat> CX=%d, CY=%d, Vw=%f, Fasp=%f", cx, cy, vw, fasp);
    MB_DPRINTLN("OcView.setUpProjMat> Near=%f, Far=%f", slabnear, slabfar);

    int bcx = convToBackingX(cx);
    int bcy = convToBackingY(cy);

    MB_DPRINTLN("OcView.setUpProjMat> BCX=%d, BCY=%d", bcx, bcy);

    if (getStereoMode() == Camera::CSM_PARA || getStereoMode() == Camera::CSM_CROSS) {
        fasp /= 2.0f;
        glViewport(0, 0, bcx / 2, bcy);
    } else {
        glViewport(0, 0, bcx, bcy);
    }

    // Setup projection matrix
    if (isPerspec()) {
        pdc->loadPerspProj(vw, fasp, slabnear, slabfar, dist);
    } else {
        pdc->loadOrthoProj(vw, fasp, slabnear, slabfar);
    }

    resetProjChgFlag();
}

void OcView::setFogColorImpl(DisplayContext *pdc)
{
    qsys::ScenePtr pScene = getScene();
    gfx::ColorPtr pBgCol = pScene->getBgColor();
    if (pdc == nullptr) {
        pdc = getDisplayContext();
        pdc->setCurrent();
    }
    pdc->setFogColor(pBgCol);
}

void OcView::setUpModelMat(int nid)
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
            // glRotated(-sd,0,1,0);
            break;

        case MM_STEREO_LEFT:
            pdc->rotate(qlib::LQuat(qlib::Vector4D(0, 1, 0), qlib::toRadian(sd / 2.0)));
            // glRotated(sd,0,1,0);
            break;

        default:
            break;
    }

    pdc->rotate(getRotQuat());

    const qlib::Vector4D c = getViewCenter();
    pdc->translate(-c);
}

void OcView::setUpLightColor() {}

void OcView::drawScene()
{
    if (!m_bInitOK) return;
    if (!safeSetCurrent()) return;

    qlib::AutoPerfMeas apm(PM_DRAW_SCENE);

    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
        return;
    }

    DisplayContext *pdc = getDisplayContext();
    pdc->setCurrent();

    gfx::ColorPtr pBgCol = pScene->getBgColor();
    glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 1.0f);
    setFogColorImpl(pdc);

    pdc->setLighting(false);

    ////////////////////////////////////////////////

    if (isProjChange()) setUpProjMat(-1, -1);

    switch (getStereoMode()) {
        default:
        case Camera::CSM_NONE:
            setUpModelMat(MM_NORMAL);
            glDrawBuffer(GL_BACK);
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

            // Draw main 3D objects
            pScene->display(pdc);
            break;

            ////////////////////////////////////////////////
            // Quad-buffer stereo
        case Camera::CSM_HW_QBUF:

            // for right eye
            setUpModelMat(MM_STEREO_RIGHT);
            if (isSwapStereoEyes())
                glDrawBuffer(GL_BACK_LEFT);
            else
                glDrawBuffer(GL_BACK_RIGHT);
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            // Draw main 3D objects
            pScene->display(pdc);

            // for left eye
            setUpModelMat(MM_STEREO_LEFT);
            if (isSwapStereoEyes())
                glDrawBuffer(GL_BACK_RIGHT);
            else
                glDrawBuffer(GL_BACK_LEFT);
            glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            // Draw main 3D objects
            pScene->display(pdc);

            break;
    }

    ////////////////////////////////////////////////

    // TODO: Display UI drawing objects (+center mark)
    super_t::showDrawObj(pdc);

    // Display 2D-UI drawing objects
    super_t::showDrawObj2D(pdc);

    swapBuffers();

    return;
}

//////////////////////////////////////////////////////////////////////////////
// Hittest Impl

using gfx::HittestContext;

LString OcView::hitTest(int ax, int ay)
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

LString OcView::hitTestRect(int ax, int ay, int aw, int ah, bool bNearest)
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
            LOG_DPRINTLN("OcView.hitTestRect> FATAL ERROR: Unknown renderer id %d",
                         rend_id);
            return LString();
        }

        qlib::uid_t objid = pRend->getClientObjID();

        if (objids.find(objid) != objids.end()) {
            MB_DPRINTLN("OcView.hitTestRect> duplicated objid %d for rendid %d ignored",
                        objid, rend_id);
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

bool OcView::hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
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

qsys::View *OcView::createOffScreenView(int w, int h, int aa_depth)
{
    return NULL;
}

void OcView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize,
                        int ncomp)
{
}

/// clean-up the drawing display with the current bg color
void OcView::clear()
{
    if (!safeSetCurrent()) return;

    qsys::ScenePtr pScene = getScene();
    if (pScene.isnull()) {
        MB_DPRINTLN("OcView::clear() invalid scene %d !!", getSceneID());
        return;
    }

    gfx::ColorPtr pBgCol = pScene->getBgColor();
    glClearColor(pBgCol->fr(), pBgCol->fg(), pBgCol->fb(), 1.0f);

    ::glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    glFlush();
}

}  // namespace sysdep

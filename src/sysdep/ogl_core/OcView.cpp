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

#include "OcView.hpp"

#include <qlib/Utils.hpp>
#include <qlib/LPerfMeas.hpp>
#include <gfx/DisplayContext.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ViewInputConfig.hpp>

// #ifdef HAVE_OGL_FBO
// #include "OglFBOView.hpp"
// #endif

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
        pdc->setProjMat(
            DisplayContext::makePersProjMat(vw, fasp, slabnear, slabfar, dist));
    } else {
        pdc->setProjMat(DisplayContext::makeOrthoProjMat(vw, fasp, slabnear, slabfar));
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

    // update center mark mode

    // TODO: Display UI drawing objects (+center mark)
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

void OcView::setCenterMark(int nMode)
{
    if (getCenterMark() == nMode) {
        return;
    }
    super_t::setCenterMark(nMode);
    auto pdo = getDrawObj("CenterMarkDrawObj");
    auto *pcmdo = dynamic_cast<CenterMarkDrawObj *>(pdo.get());
    if (pcmdo == nullptr) {
        MB_DPRINTLN("OcView::setCenterMark> CenterMarkDrawObj not found!!");
        return;
    }
    pcmdo->setCenterMark(nMode);
}

//////////////////////////////////////////////////////////////////////////////
// Hittest Impl


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

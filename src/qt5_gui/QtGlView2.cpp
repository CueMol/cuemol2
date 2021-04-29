// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtGlView2.hpp"

#include <QtGui/QOpenGLWindow>
#include <qlib/Utils.hpp>

#include "QtGlDisplayContext2.hpp"
#include "QtMolWidget.hpp"

using qsys::InDevEvent;

using namespace qt5_gui;

QtGlView2::QtGlView2()
{
    m_pCtxt = NULL;
    m_pWidget = NULL;
    m_bHasQuadBuffer = false;
}

QtGlView2::~QtGlView2()
{
    MB_DPRINTLN("QtGlView2 (ctxt=%p) destructing.", m_pCtxt);
}

LString QtGlView2::toString() const
{
    return LString::format("Qt/OpenGL View(%p)", this);
}

void QtGlView2::swapBuffers()
{
    QOpenGLWindow *pGLWidget = static_cast<QOpenGLWindow *>(m_pWidget);
    QOpenGLContext *pCtxt = static_cast<QOpenGLContext *>(m_pCtxt->getImpl());
    pCtxt->swapBuffers(pGLWidget);
}

DisplayContext *QtGlView2::getDisplayContext()
{
    return m_pCtxt;
}

////////////////////////////////////////////

bool QtGlView2::initGL(void *pWidget)
{
    MB_ASSERT(m_pCtxt == NULL);
    m_pWidget = pWidget;
    QOpenGLWindow *pGLWidget = static_cast<QOpenGLWindow *>(pWidget);

    // TO DO: setup context sharing

    // m_pCtxt = MB_NEW QtGlDisplayContext(getSceneID(), this, pGLWidget->context());
    // create display context object for OpenGL
    if (m_pCtxt == NULL) {
        m_pCtxt = MB_NEW QtGlDisplayContext2(pGLWidget);
        m_pCtxt->setup(pGLWidget->context());
        m_pCtxt->setTargetView(this);
    }

    m_pCtxt->setCurrent();

    // perform OpenGL-common initialization tasks
    OglView::setup();

    m_bInitOK = true;

    setCenterMark(qsys::Camera::CCM_CROSS);
    return true;
}

void QtGlView2::unloading()
{
    if (m_pCtxt != NULL) {
        delete m_pCtxt;
        m_pCtxt = NULL;
    }
}

/// Query hardware stereo capability
bool QtGlView2::hasHWStereo() const
{
    // LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
    return m_bHasQuadBuffer;
}

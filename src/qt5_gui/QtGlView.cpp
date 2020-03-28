// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtGlView.hpp"
#include "QtGlDisplayContext.hpp"

#include "QtMolWidget.hpp"

#include <qlib/Utils.hpp>

using qsys::InDevEvent;

using namespace qt5_gui;

QtGlView::QtGlView()
{
  m_pCtxt = NULL;
  m_pWidget = NULL;
  m_bHasQuadBuffer = false;
}

QtGlView::~QtGlView()
{
  MB_DPRINTLN("QtGlView (ctxt=%p) destructing.", m_pCtxt);
}

LString QtGlView::toString() const
{
  return LString::format("Qt/OpenGL View(%p)", this);
}

void QtGlView::swapBuffers()
{
  QGLWidget *pGLWidget = static_cast<QGLWidget *>(m_pWidget);
  pGLWidget->swapBuffers();
}

DisplayContext *QtGlView::getDisplayContext()
{
  return m_pCtxt;
}

////////////////////////////////////////////

bool QtGlView::initGL(void *pWidget)
{
  MB_ASSERT(m_pCtxt==NULL);
  m_pWidget = pWidget;
  QGLWidget *pGLWidget = static_cast<QGLWidget *>(pWidget);

  // TO DO: setup context sharing

  // m_pCtxt = MB_NEW QtGlDisplayContext(getSceneID(), this, pGLWidget->context());
  // create display context object for OpenGL
  if (m_pCtxt==NULL) {
    m_pCtxt = MB_NEW QtGlDisplayContext();
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

void QtGlView::unloading()
{
  if (m_pCtxt!=NULL) {
    delete m_pCtxt;
    m_pCtxt = NULL;
  }
}

/// Query hardware stereo capability
bool QtGlView::hasHWStereo() const
{
  //LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
  return m_bHasQuadBuffer;
}

////////////////////////////////////////////


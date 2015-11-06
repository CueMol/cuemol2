// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtglView.hpp"
#include "QtglDisplayContext.hpp"

#include "QtMolWidget_moc.hpp"

#include <qlib/Utils.hpp>

using qsys::InDevEvent;

using namespace qtgui;

QtglView::QtglView()
{
  m_pCtxt = NULL;
  m_pWidget = NULL;
  m_bHasQuadBuffer = false;
}

QtglView::~QtglView()
{
  MB_DPRINTLN("QtglView (ctxt=%p) destructing.", m_pCtxt);
}

LString QtglView::toString() const
{
  return LString::format("Qt/OpenGL View(%p)", this);
}

void QtglView::swapBuffers()
{
  QGLWidget *pGLWidget = static_cast<QGLWidget *>(m_pWidget);
  pGLWidget->swapBuffers();
}

DisplayContext *QtglView::getDisplayContext()
{
  return m_pCtxt;
}

////////////////////////////////////////////

bool QtglView::initGL(void *pWidget)
{
  MB_ASSERT(m_pCtxt==NULL);
  m_pWidget = pWidget;
  QGLWidget *pGLWidget = static_cast<QGLWidget *>(pWidget);

  // TO DO: setup context sharing

  m_pCtxt = MB_NEW QtglDisplayContext(getSceneID(), this, pGLWidget->context());

  m_pCtxt->setCurrent();

  // perform OpenGL-common initialization tasks
  OglView::setup();

  m_bInitOK = true;

  setCenterMark(qsys::Camera::CCM_CROSS);
  return true;
}

void QtglView::unloading()
{
  if (m_pCtxt!=NULL) {
    delete m_pCtxt;
    m_pCtxt = NULL;
  }
}

/// Query hardware stereo capability
bool QtglView::hasHWStereo() const
{
  //LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
  return m_bHasQuadBuffer;
}

////////////////////////////////////////////


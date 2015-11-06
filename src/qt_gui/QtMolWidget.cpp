//
// Qt MolView widget implementation
//

#define NO_USING_QTYPES
#include <common.h>
#include "QtglView.hpp"

#include "QtMolWidget_moc.hpp"

#include <QtGui/QMouseEvent>
#include <QtCore/QTimer>

#include <qlib/qlib.hpp>
#include <qsys/SceneManager.hpp>
#include <sysdep/MouseEventHandler.hpp>

//using namespace qtgui;

QtMolWidget::QtMolWidget(QWidget *parent)
     : QGLWidget(parent)
{
  m_pView = NULL;
  m_nSceneID = qlib::invalid_uid;
  m_nViewID = qlib::invalid_uid;
  m_pMeh = new sysdep::MouseEventHandler();

  //QTimer *timer = new QTimer(this);
  //connect(timer, SIGNAL(timeout()), this, SLOT(advanceGears()));
  //timer->start(20);
}

QtMolWidget::QtMolWidget(const QGLFormat &format ,QWidget *parent)
     : QGLWidget(format, parent)
{
  m_pView = NULL;
  m_nSceneID = qlib::invalid_uid;
  m_nViewID = qlib::invalid_uid;
  m_pMeh = new sysdep::MouseEventHandler();
}

QtMolWidget::~QtMolWidget()
{
}

void QtMolWidget::bind(int scid, int vwid)
{
  qsys::ViewPtr pView = qsys::SceneManager::getViewS(vwid);
  m_pView = dynamic_cast<qtgui::QtglView *>(pView.get());

  if (m_pView==NULL) {
    LOG_DPRINTLN("QtMolWidget> FatalError; Cannot cast view %d to QtglView!!", vwid);
    return;
  }

  m_nSceneID = scid;
  m_nViewID = vwid;
}

void QtMolWidget::initializeGL()
{
  if (m_pView==NULL) {
    LOG_DPRINTLN("QtMolWidget> FatalError; QtglView is not attached!!");
    return;
  }
  
  // turn off autoswapbuffer
  QGLWidget::setAutoBufferSwap(false);

  // TO DO: set useshader flag
  // pWglView->setUseGlShader(m_bUseGlShader);
  // TO DO: set HiDPI scaling value
  // pWglView->setSclFac(m_sclX, m_sclY);

  if (!m_pView->initGL(this)) {
    LOG_DPRINTLN("QtMolWidget> FatalError; initGL() failed!!");
    return;
  }

  MB_DPRINTLN("initializeGL OK.");

}

void QtMolWidget::paintGL()
{
  m_pView->forceRedraw();
}

void QtMolWidget::resizeGL(int width, int height)
{
  // MB_DPRINTLN("calling sizeChanged(%d,%d)", width, height);
  m_pView->sizeChanged(width, height);
}

void QtMolWidget::setupMouseEvent(QMouseEvent *event, qsys::InDevEvent &ev)
{
  ev.setX(event->x());
  ev.setY(event->y());

  ev.setRootX(event->globalX());
  ev.setRootY(event->globalY());

  // set modifier
  int modif = 0;
  Qt::MouseButtons btns = event->buttons();
  Qt::KeyboardModifiers mdfs = event->modifiers();

  if (mdfs & Qt::ControlModifier)
    modif |= qsys::InDevEvent::INDEV_CTRL;
  if (mdfs & Qt::ShiftModifier)
    modif |= qsys::InDevEvent::INDEV_SHIFT;
  if (btns & Qt::LeftButton)
    modif |= qsys::InDevEvent::INDEV_LBTN;
  if (btns & Qt::MidButton)
    modif |= qsys::InDevEvent::INDEV_MBTN;
  if (btns & Qt::RightButton)
    modif |= qsys::InDevEvent::INDEV_RBTN;

  // ev.setSource(this);
  ev.setModifier(modif);

  return;
}

void QtMolWidget::mousePressEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  m_pMeh->buttonDown(ev);
  m_pView->fireInDevEvent(ev);
}

void QtMolWidget::mouseReleaseEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  if (!m_pMeh->buttonUp(ev))
    return; // click/drag state error --> skip event invokation
  m_pView->fireInDevEvent(ev);
}

void QtMolWidget::mouseMoveEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  if (!m_pMeh->move(ev))
    return; // drag checking/state error --> skip event invokation
  m_pView->fireInDevEvent(ev);
}

/*
void QtMolWidget::advanceGears()
{
    gear1Rot += 2 * 16;
    updateGL();
}
*/



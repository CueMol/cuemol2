//
// Qt MolView widget implementation
//

#define NO_USING_QTYPES
#include <common.h>
#include "QtglView.hpp"

#include "QtMolWidget_moc.hpp"
#include "QtTimerImpl_moc.hpp"

#include <QtGui/QMouseEvent>
#include <QtGui/QWindow>

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
  double r = windowHandle()->devicePixelRatio();

  //double rx = double(width)/r;
  //double ry = double(height)/r;
  //MB_DPRINTLN("calling sizeChanged(%f,%f), DPR=%f", rx, ry, r);
  //m_pView->sizeChanged(int(rx), int(ry));

  MB_DPRINTLN("calling sizeChanged(%d,%d), DPR=%f", width, height, r);
  m_pView->sizeChanged(width, height);
}

/////////////////
// Event handling

void QtMolWidget::mousePressEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  m_pMeh->buttonDown(ev);
  m_pView->fireInDevEvent(ev);

  event->accept();
}

void QtMolWidget::mouseReleaseEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  if (!m_pMeh->buttonUp(ev))
    return; // click/drag state error --> skip event invokation
  m_pView->fireInDevEvent(ev);

  event->accept();
}

void QtMolWidget::mouseMoveEvent(QMouseEvent *event)
{
  qsys::InDevEvent ev;
  setupMouseEvent(event, ev);
  if (!m_pMeh->move(ev))
    return; // drag checking/state error --> skip event invokation
  m_pView->fireInDevEvent(ev);

  event->accept();
}

void QtMolWidget::wheelEvent(QWheelEvent * event)
{
  QPoint numPixels = event->pixelDelta();
  QPoint numDegrees = event->angleDelta();
  
  qsys::InDevEvent ev;
  setupWheelEvent(event, ev);

  if (!numPixels.isNull()) {
    // scrollWithPixels(numPixels);
  }
  else if (!numDegrees.isNull()) {
    int zDelta = numDegrees.y();

    ev.setType(qsys::InDevEvent::INDEV_WHEEL);
    ev.setDeltaX((int) zDelta);
    m_pView->fireInDevEvent(ev);
  }
  
  event->accept();

  //MB_DPRINTLN("*** WheelEvent: X=%d", event->angleDelta().x());
  //MB_DPRINTLN("*** WheelEvent: Y=%d", event->angleDelta().y());
}

void QtMolWidget::setupMouseEvent(QMouseEvent *event, qsys::InDevEvent &ev)
{
  double r = windowHandle()->devicePixelRatio();

  ev.setX(int( double(event->x())*r ));
  ev.setY(int( double(event->y())*r ));

  ev.setRootX(int( double(event->globalX())*r ));
  ev.setRootY(int( double(event->globalY())*r ));

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

void QtMolWidget::setupWheelEvent(QWheelEvent *event, qsys::InDevEvent &ev)
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


//////////////////////////////////////////////////

#ifdef WIN32
#  include <windows.h>
#endif

#ifdef XP_MACOSX
#include <CoreServices/CoreServices.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <unistd.h>
#endif

namespace {
  class MyTimerImpl : public qlib::TimerImpl
  {
  private:
    QtTimerImpl m_impl;

  public:
    MyTimerImpl()
    {
    }
    
    virtual ~MyTimerImpl()
    {
    }

    virtual qlib::time_value getCurrentTime()
    {
      qlib::time_value tval;
#ifdef WIN32
      tval = (qlib::time_value) ::GetTickCount();
#endif
#ifdef XP_MACOSX
      uint64_t abstime = mach_absolute_time();
      Nanoseconds nanos = AbsoluteToNanoseconds( *(AbsoluteTime *) &abstime );
      tval = UnsignedWideToUInt64(nanos)/1000000;
#endif
      
      return tval;
    }

    virtual void start()
    {
      m_impl.start(0);
    }

    virtual void stop()
    {
      m_impl.stop();
    }

    //static void timerCallbackFunc(nsITimer *aTimer, void *aClosure);
  };
}

//static
void QtMolWidget::setupEventTimer()
{
  qlib::EventManager::getInstance()->initTimer(new MyTimerImpl);
}


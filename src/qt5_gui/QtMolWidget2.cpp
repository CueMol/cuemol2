//
// Qt MolView widget implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtMolWidget2.hpp"

#include <QtGui/QMouseEvent>
#include <QtGui/QWindow>
#include <qlib/qlib.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/SceneXMLReader.hpp>
#include <qsys/StreamManager.hpp>
#include <sysdep/MouseEventHandler.hpp>

#include "QtGlView2.hpp"
#include "QtTimerImpl.hpp"
#include "moc_QtMolWidget2.cpp"

using namespace qt5_gui;

QtMolWidget2::QtMolWidget2(QWidget *parent) : super_t(parent)
{
    m_pView = NULL;
    m_nSceneID = qlib::invalid_uid;
    m_nViewID = qlib::invalid_uid;
    m_pMeh = new sysdep::MouseEventHandler();

    grabGesture(Qt::PinchGesture);
    grabGesture(Qt::PanGesture);
}

QtMolWidget2::~QtMolWidget2() {}

void QtMolWidget2::bind(int scid, int vwid)
{
    qsys::ViewPtr pView = qsys::SceneManager::getViewS(vwid);
    m_pView = dynamic_cast<qt5_gui::QtGlView2 *>(pView.get());

    if (m_pView == NULL) {
        LOG_DPRINTLN("QtMolWidget2> FatalError; Cannot cast view %d to QtGlView!!",
                     vwid);
        return;
    }

    m_nSceneID = scid;
    m_nViewID = vwid;
    LOG_DPRINTLN("QtMolWidget2> bind(%d, %d) OK", scid, vwid);
}

void QtMolWidget2::initializeGL()
{
    if (m_pView == nullptr) {
        LOG_DPRINTLN(
            "QtMolWidget2::initializeGL> FatalError; QtGlView is not attached!!");
        return;
    }

    // // turn off autoswapbuffer
    // super_t::setAutoBufferSwap(false);

    // TODO: set useshader flag
    // pWglView->setUseGlShader(m_bUseGlShader);

    // TODO: set HiDPI scaling value
    double r = devicePixelRatio();
    LOG_DPRINTLN("QtMolWidget2> scale factor: %f", r);
    if (!qlib::isNear4(r, 1.0)) m_pView->setSclFac(r, r);

    if (!m_pView->initGL(this)) {
        LOG_DPRINTLN("QtMolWidget2::initializeGL> FatalError; initGL() failed!!");
        return;
    }

    MB_DPRINTLN("initializeGL OK.");
}

void QtMolWidget2::paintGL()
{
    LOG_DPRINTLN("QtMolWidget2::paintGL called!!");
    m_pView->forceRedraw();
}

void QtMolWidget2::resizeGL(int width, int height)
{
    double r = devicePixelRatio();

    double rx = double(width);
    double ry = double(height);
    LOG_DPRINTLN("QtMolWidget2::resizeGL> calling sizeChanged(%f,%f), DPR=%f", rx, ry,
                 r);
    if (m_pView == nullptr) {
        LOG_DPRINTLN("QtMolWidget2::resizeGL> FatalError; QtGlView is not attached!!");
        return;
    }
    m_pView->sizeChanged(int(rx), int(ry));
}

/////////////////
// Event handling

void QtMolWidget2::mousePressEvent(QMouseEvent *event)
{
    qsys::InDevEvent ev;
    setupMouseEvent(event, ev);
    m_pMeh->buttonDown(ev);
    m_pView->fireInDevEvent(ev);

    event->accept();
}

void QtMolWidget2::mouseReleaseEvent(QMouseEvent *event)
{
    qsys::InDevEvent ev;
    setupMouseEvent(event, ev);
    if (!m_pMeh->buttonUp(ev))
        return;  // click/drag state error --> skip event invokation
    m_pView->fireInDevEvent(ev);

    MB_DPRINTLN("mouse release %d, %d", ev.getX(), ev.getY());
    event->accept();
}

void QtMolWidget2::mouseMoveEvent(QMouseEvent *event)
{
    qsys::InDevEvent ev;
    setupMouseEvent(event, ev);
    if (!m_pMeh->move(ev))
        return;  // drag checking/state error --> skip event invokation
    m_pView->fireInDevEvent(ev);

    event->accept();
}

void QtMolWidget2::wheelEvent(QWheelEvent *event)
{
    QPoint numPixels = event->pixelDelta();
    QPoint numDegrees = event->angleDelta();

    qsys::InDevEvent ev;
    setupWheelEvent(event, ev);

    if (!numPixels.isNull()) {
        // scrollWithPixels(numPixels);
    } else if (!numDegrees.isNull()) {
        int zDelta = numDegrees.y();

        ev.setType(qsys::InDevEvent::INDEV_WHEEL);
        ev.setDeltaX((int)zDelta);
        m_pView->fireInDevEvent(ev);
    }

    event->accept();

    // MB_DPRINTLN("*** WheelEvent: X=%d", event->angleDelta().x());
    // MB_DPRINTLN("*** WheelEvent: Y=%d", event->angleDelta().y());
}

void QtMolWidget2::setupMouseEvent(QMouseEvent *event, qsys::InDevEvent &ev)
{
    // XXX: mouse coord is already DPI-scaled ??
    const double r = 1.0;

    // const double r = windowHandle()->devicePixelRatio();
    if (!qlib::isNear4(r, 1.0)) {
        ev.setX(int(double(event->x()) * r));
        ev.setY(int(double(event->y()) * r));
        ev.setRootX(int(double(event->globalX()) * r));
        ev.setRootY(int(double(event->globalY()) * r));
    } else {
        ev.setX(event->x());
        ev.setY(event->y());
        ev.setRootX(event->globalX());
        ev.setRootY(event->globalY());
    }

    // set modifier
    int modif = 0;
    // button() should be included for button-up (release) event
    Qt::MouseButtons btns = event->buttons() | event->button();
    Qt::KeyboardModifiers mdfs = event->modifiers();

    if (mdfs & Qt::ControlModifier) modif |= qsys::InDevEvent::INDEV_CTRL;
    if (mdfs & Qt::ShiftModifier) modif |= qsys::InDevEvent::INDEV_SHIFT;

    if (btns & Qt::LeftButton) modif |= qsys::InDevEvent::INDEV_LBTN;
    if (btns & Qt::MidButton) modif |= qsys::InDevEvent::INDEV_MBTN;
    if (btns & Qt::RightButton) modif |= qsys::InDevEvent::INDEV_RBTN;

    // ev.setSource(this);
    ev.setModifier(modif);
}

void QtMolWidget2::setupWheelEvent(QWheelEvent *event, qsys::InDevEvent &ev)
{
    const auto &pos = event->position();
    ev.setX(pos.x());
    ev.setY(pos.y());

    const auto &gpos = event->globalPosition();
    ev.setRootX(gpos.x());
    ev.setRootY(gpos.y());

    // set modifier
    int modif = 0;
    Qt::MouseButtons btns = event->buttons();
    Qt::KeyboardModifiers mdfs = event->modifiers();

    if (mdfs & Qt::ControlModifier) modif |= qsys::InDevEvent::INDEV_CTRL;
    if (mdfs & Qt::ShiftModifier) modif |= qsys::InDevEvent::INDEV_SHIFT;
    if (btns & Qt::LeftButton) modif |= qsys::InDevEvent::INDEV_LBTN;
    if (btns & Qt::MidButton) modif |= qsys::InDevEvent::INDEV_MBTN;
    if (btns & Qt::RightButton) modif |= qsys::InDevEvent::INDEV_RBTN;

    // ev.setSource(this);
    ev.setModifier(modif);

    return;
}

bool QtMolWidget2::event(QEvent *event)
{
    if (event->type() == QEvent::Gesture)
        return gestureEvent(static_cast<QGestureEvent *>(event));
    return super_t::event(event);
}

bool QtMolWidget2::gestureEvent(QGestureEvent *event)
{
    MB_DPRINTLN("***** gestureEvent called!!");

    /*
    if (QGesture *swipe = event->gesture(Qt::SwipeGesture)) {
      // swipeTriggered(static_cast<QSwipeGesture *>(swipe));
      MB_DPRINTLN("* SwipeGesture!!");
    }
    else if (QGesture *pan = event->gesture(Qt::PanGesture)) {
    panTriggered(static_cast<QPanGesture *>(pan));
    }
    */

    if (QGesture *pinch = event->gesture(Qt::PinchGesture)) {
        pinchTriggered(static_cast<QPinchGesture *>(pinch));
    }

    return true;
}

void QtMolWidget2::pinchTriggered(QPinchGesture *gesture)
{
    LOG_DPRINTLN("* PinchGesture!!");

    QPinchGesture::ChangeFlags changeFlags = gesture->changeFlags();
    if (changeFlags & QPinchGesture::RotationAngleChanged) {
        double rot = gesture->rotationAngle() - gesture->lastRotationAngle();
        MB_DPRINTLN("** Pinch gesture rotation %f", rot);
        m_pView->rotateView(0.0f, 0.0f, rot * 4.0);
        update();
    }

    if (changeFlags & QPinchGesture::ScaleFactorChanged) {
        // LOG_DPRINTLN("** Pinch gesture scale %f", gesture->scaleFactor());
        // LOG_DPRINTLN("** Pinch gesture total scale %f", gesture->totalScaleFactor());

        double delta = gesture->scaleFactor();  // / gesture->lastScaleFactor();

        double vw = m_pView->getZoom();
        m_pView->setZoom(vw / delta);
        // m_pView->setUpProjMat(-1, -1);
        // m_pView->setProjChange();
        // m_pView->setUpdateFlag();
        
        LOG_DPRINTLN("New zoom: %f", m_pView->getZoom());
        update();
    }

    if (gesture->state() == Qt::GestureFinished) {
        // scaleFactor *= currentStepScaleFactor;
        // currentStepScaleFactor = 1;
        MB_DPRINTLN("** Pinch gesture finished");
    }

}

void QtMolWidget2::panTriggered(QPanGesture *gesture)
{
    MB_DPRINTLN("* PanGesture!!");

#ifndef QT_NO_CURSOR
    switch (gesture->state()) {
        case Qt::GestureStarted:
        case Qt::GestureUpdated:
            setCursor(Qt::SizeAllCursor);
            break;
        default:
            setCursor(Qt::ArrowCursor);
    }
#endif

    QPointF delta = gesture->delta();
    MB_DPRINTLN("  delta=%f, %f", delta.x(), delta.y());
}

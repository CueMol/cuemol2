//
// Mol view widget implementation using QT5 QOpenGLWidget
//

#pragma once

#include <QtWidgets/QOpenGLWidget>
//#include <QtGui/QOpenGLWindow>
#include <QtWidgets/QGestureEvent>
// #include <QGLWidget>
// #include <QGestureEvent>
// #include <qlib/qlib.hpp>

#include "qt5_gui.hpp"

namespace qt5_gui {
class QtGlView2;
}

namespace qsys {
class InDevEvent;
}

namespace sysdep {
class MouseEventHandler;
}

class QtMolWidget2 : public QOpenGLWidget
{
    Q_OBJECT;

    using super_t = QOpenGLWidget;

public:
    QtMolWidget2(QWidget *parent = 0);
    // QtMolWidget2(QWindow *parent = nullptr);
    // QtMolWidget2(const QGLFormat &format, QWidget *parent = 0);
    ~QtMolWidget2();

private:
    int m_nSceneID;
    int m_nViewID;

    qt5_gui::QtGlView2 *m_pView;

public:
    void bind(int scid, int vwid);

    // void createSceneAndView();
    // void loadFile(const QString &fileName);

    inline int getSceneID() const
    {
        return m_nSceneID;
    }
    inline int getViewID() const
    {
        return m_nViewID;
    }

    // static void setupTextRender();

public slots:

signals:

protected:
    void initializeGL() Q_DECL_OVERRIDE;
    void paintGL() Q_DECL_OVERRIDE;
    void resizeGL(int width, int height) Q_DECL_OVERRIDE;

    void mousePressEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
    void mouseReleaseEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
    void mouseMoveEvent(QMouseEvent *event) Q_DECL_OVERRIDE;

    void wheelEvent(QWheelEvent *event) Q_DECL_OVERRIDE;

    bool event(QEvent *event) Q_DECL_OVERRIDE;

private slots:

private:
    void setupMouseEvent(QMouseEvent *event, qsys::InDevEvent &ev);
    void setupWheelEvent(QWheelEvent *event, qsys::InDevEvent &ev);
    sysdep::MouseEventHandler *m_pMeh;

    bool gestureEvent(QGestureEvent *event);
    void pinchTriggered(QPinchGesture *gesture);
    void panTriggered(QPanGesture *gesture);
};

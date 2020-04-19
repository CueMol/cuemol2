//
// Mol view widget implementation using QT5 QGLWidget
//

#pragma once

#include <QtOpenGL/QGLWidget>
#include <QtWidgets/QGestureEvent>

#include "qt5_gui.hpp"

namespace qt5_gui {
class QtGlView;
}

namespace qsys {
class InDevEvent;
}

namespace sysdep {
class MouseEventHandler;
}

class QtMolWidget : public QGLWidget
{
    Q_OBJECT;

public:
    QtMolWidget(QWidget *parent = 0);
    QtMolWidget(const QGLFormat &format, QWidget *parent = 0);
    ~QtMolWidget();

private:
    int m_nSceneID;
    int m_nViewID;

    qt5_gui::QtGlView *m_pView;

public:
    void createSceneAndView();

    void bind(int scid, int vwid);

    void loadFile(const QString &fileName);

    inline qlib::uid_t getSceneID() const { return m_nSceneID; }
    inline qlib::uid_t getViewID() const { return m_nViewID; }

    static void setupTextRender();

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

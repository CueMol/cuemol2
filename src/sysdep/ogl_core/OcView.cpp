#include <common.h>

#include "OcView.hpp"

namespace sysdep {

OcView::OcView() {}

OcView::OcView(const OcView &r) {}

OcView::~OcView() {}

/// Setup the projection matrix for stereo (View interface)
void OcView::setUpModelMat(int nid)
{
    qlib::Matrix4D mat;

    mat.matprod(qlib::Matrix4D::makeTransMat(qlib::Vector4D(0, 0, -getViewDist())));
    mat.matprod(getRotQuat().toRotMatrix());
    mat.matprod(qlib::Matrix4D::makeTransMat(-getViewCenter()));

    constexpr size_t buf_size = 4 * 4;
    for (size_t i = 1; i <= buf_size; i++) m_modelMat.ai(i) = float(mat.ai(i));
}

/// Setup projection matrix (View interface)
void OcView::setUpProjMat(int cx, int cy)
{
    if (cx < 0 || cy < 0) {
        cx = getWidth();
        cy = getHeight();
    }

    float zoom = (float)getZoom(), dist = (float)getViewDist();
    float slabdepth = (float)getSlabDepth();
    if (slabdepth <= 0.1f) slabdepth = 0.1f;

    float slabnear = dist - slabdepth / 2.0f;
    float slabfar = dist + slabdepth;
    // truncate near slab by camera distance
    if (slabnear < 0.1f) slabnear = 0.1f;

    // MB_DPRINTLN("Zoom=%f", zoom);
    float vw = zoom / 2.0f;
    m_bcx = convToBackingX(cx);
    m_bcy = convToBackingY(cy);

    float fasp = float(m_bcx) / float(m_bcy);

    MB_DPRINTLN("OcView.setUpProjMat> CX=%d, CY=%d, Vw=%f, Fasp=%f", cx, cy, vw, fasp);
    MB_DPRINTLN("OcView.setUpProjMat> BCX=%d, BCY=%d", m_bcx, m_bcy);

    {
        const float left = -vw * fasp;
        const float right = vw * fasp;
        const float bottom = -vw;
        const float top = vw;
        const float near = slabnear;
        const float far = slabfar;

        const float a = 2.0f / (right - left);
        const float b = 2.0f / (top - bottom);
        const float c = -2.0f / (far - near);

        const float tx = -(right + left) / (right - left);
        const float ty = -(top + bottom) / (top - bottom);
        const float tz = -(far + near) / (far - near);

        m_projMat.aij(1, 1) = a;
        m_projMat.aij(2, 1) = 0;
        m_projMat.aij(3, 1) = 0;
        m_projMat.aij(4, 1) = 0;

        m_projMat.aij(1, 2) = 0;
        m_projMat.aij(2, 2) = b;
        m_projMat.aij(3, 2) = 0;
        m_projMat.aij(4, 2) = 0;

        m_projMat.aij(1, 3) = 0;
        m_projMat.aij(2, 3) = 0;
        m_projMat.aij(3, 3) = c;
        m_projMat.aij(4, 3) = 0;

        m_projMat.aij(1, 4) = tx;
        m_projMat.aij(2, 4) = ty;
        m_projMat.aij(3, 4) = tz;
        m_projMat.aij(4, 4) = 1;
    }
}

void OcView::onMouseDown(double clientX, double clientY, double screenX, double screenY,
                         int modif)
{
    // printf("onMouseDown (%f, %f) (%f, %f) %x\n", clientX, clientY, screenX, screenY,
    //        modif);
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_DOWN, ev);
}

void OcView::onMouseUp(double clientX, double clientY, double screenX, double screenY,
                       int modif)
{
    // printf("onMouseUp (%f, %f) (%f, %f) %x\n", clientX, clientY, screenX, screenY,
    //        modif);
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_UP, ev);
}

void OcView::onMouseMove(double clientX, double clientY, double screenX, double screenY,
                         int modif)
{
    // printf("onMouseMove (%f, %f) (%f, %f) %x\n", clientX, clientY, screenX, screenY,
    //        modif);
    InDevEvent ev;
    setupInDevEvent(clientX, clientY, screenX, screenY, modif, ev);
    dispatchMouseEvent(DME_MOUSE_MOVE, ev);
}

void OcView::setupInDevEvent(double clientX, double clientY, double screenX,
                             double screenY, int amodif, InDevEvent &ev)
{
    ev.setX(int(clientX));
    ev.setY(int(clientY));

    ev.setRootX(int(screenX));
    ev.setRootY(int(screenY));

    int modif = 0;

    if (amodif & 32) modif |= InDevEvent::INDEV_CTRL;
    if (amodif & 64) modif |= InDevEvent::INDEV_SHIFT;
    if (amodif & 1) modif |= InDevEvent::INDEV_LBTN;
    if (amodif & 2) modif |= InDevEvent::INDEV_RBTN;
    if (amodif & 4) modif |= InDevEvent::INDEV_MBTN;

    ev.setModifier(modif);
}

void OcView::dispatchMouseEvent(int nType, InDevEvent &ev)
{
    switch (nType) {
            // mouse down event
        case DME_MOUSE_DOWN:
            m_meh.buttonDown(ev);
            break;

            // mouse move/dragging event
        case DME_MOUSE_MOVE:
            if (!m_meh.move(ev)) return;  // skip event invokation
            break;

            // mouse up event
        case DME_MOUSE_UP:
            if (!m_meh.buttonUp(ev)) {
                return;  // skip event invokation
            }
            break;

        case DME_WHEEL:
            // wheel events
            break;

            // should not be happen
        default:
            MB_DPRINTLN("unknown nType %d", nType);
            return;
    }

    fireInDevEvent(ev);
}

}  // namespace qsys

//
// OcView.hpp
// View class for OpenGL core profile
//

#pragma once

#include "sysdep.hpp"

#include <qsys/qsys.hpp>
#include <qsys/View.hpp>
#include <qlib/MatrixND.hpp>
#include <qsys/MouseEventHandler.hpp>

namespace sysdep {

using Matrix4F = qlib::MatrixND<4, float>;
class OcDisplayContext;

class OcView : public View
{
protected:
    /// Model matrix
    Matrix4F m_modelMat;

    /// Projection matrix
    Matrix4F m_projMat;

    /// Viewport size
    int m_bcx, m_bcy;

public:
    OcView();

    OcView(const OcView &r);

    virtual ~OcView();

    //////////

public:
    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid);

    /// Setup projection matrix (View interface)
    virtual void setUpProjMat(int w, int h);

    void onMouseDown(double clientX, double clientY, double screenX, double screenY,
                     int modif);
    void onMouseUp(double clientX, double clientY, double screenX, double screenY,
                   int modif);
    void onMouseMove(double clientX, double clientY, double screenX, double screenY,
                     int modif);

    //////////

protected:
    static const int DME_MOUSE_DOWN = 0;
    static const int DME_MOUSE_MOVE = 1;
    static const int DME_MOUSE_UP = 2;
    static const int DME_WHEEL = 3;
    static const int DME_DBCHK_TIMEUP = 4;

    MouseEventHandler m_meh;

    void setupInDevEvent(double clientX, double clientY, double screenX, double screenY,
                         int modif, InDevEvent &ev);
    void dispatchMouseEvent(int nType, InDevEvent &ev);
};

}  // namespace sysdep

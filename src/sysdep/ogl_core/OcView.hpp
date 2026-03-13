// -*-Mode: C++;-*-
//
// OcView.hpp
// View class for OpenGL core profile
//

#pragma once

#include <sysdep/sysdep.hpp>

#include <qsys/qsys.hpp>
#include <qsys/View.hpp>
#include <gfx/Hittest.hpp>

namespace sysdep {

class SYSDEP_API OcView : public qsys::View
{
protected:
    bool m_bInitOK;

public:
    using super_t = qsys::View;

    OcView();

    OcView(const OcView &r);

    virtual ~OcView();

    //////////

public:
    virtual LString toString() const;

    void setup();

    ///////////////////////////////

    /// Setup the light source color
    void setUpLightColor();

    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid);

    /// Setup projection matrix (View interface)
    virtual void setUpProjMat(int w, int h);

    /// Draw current scene
    virtual void drawScene();

    /// Clean-up the drawing display with the current bg color
    virtual void clear();

    virtual void setCenterMark(int nMode);

    ////////////////////////////////////////////////
    // implementation

    void setUseGlShader(bool f)
    {
    }

protected:
    void setFogColorImpl(gfx::DisplayContext *pdc = nullptr);
};

}  // namespace sysdep

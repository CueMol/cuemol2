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

    ////////////////////////////////////////////////
    // Hit test operations

private:
    gfx::HitData m_hitdata;

    /// Hit-test implementation
    /// @param pdc display context attached to the hittest buffer
    /// @parm 4D vector containing: (screen X, screen Y, X-hit precision, Y-hit
    /// precision)
    /// @fGetAll If true, all of the hit elements are returned.
    ///   Otherwise, only the nearest hit is returned.
    /// @far_factor factor of far slab limitation (1.0 for the same as display)
    bool hitTestImpl(gfx::DisplayContext *pdc, const Vector4D &parm, bool fGetAll,
                     double far_factor);

public:
    virtual LString hitTest(int x, int y);

    virtual LString hitTestRect(int x, int y, int w, int h, bool bNr);

    ////////////////////////////////////////////////
    // Framebuffer operations

    /// Create a new off-screen view compatible with this view
    virtual View *createOffScreenView(int w, int h, int aa_depth);

    virtual void readPixels(int x, int y, int width, int height, char *pbuf,
                            int nbufsize, int ncomp);

    ////////////////////////////////////////////////
    // implementation

    /// set GL Shader flag (only valid before calling setup())
    void setUseGlShader(bool f)
    {
        // m_bUseGlShader = f;
    }

protected:
    void setFogColorImpl(gfx::DisplayContext *pdc = nullptr);
};

}  // namespace sysdep

// -*-Mode: C++;-*-
//
// GUIView.hpp
// View class for GUI system
//

#pragma once

#include "qsys.hpp"
#include "View.hpp"
#include "MouseEventHandler.hpp"
#include "InDevEvent.hpp"
#include <gfx/Hittest.hpp>

namespace qsys {

class QSYS_API GUIView : public qsys::View
{
    using super_t = qsys::View;

public:
    GUIView();
    virtual ~GUIView();

    /// Mouse event dispatch types (platform-agnostic abstraction over native events)
    enum {
        DME_MOUSE_DOWN   = 0,
        DME_MOUSE_MOVE   = 1,
        DME_MOUSE_UP     = 2,
        DME_WHEEL        = 3,
        DME_DBCHK_TIMEUP = 4
    };

    /// Dispatch a native mouse event through the MouseEventHandler state machine
    /// and fire the resulting InDevEvent to listeners.
    void dispatchMouseEvent(int nType, InDevEvent &ev);


    virtual void setCenterMark(int nMode) override;

    /// Setup the projection matrix
    virtual void setUpProjMat(int cx, int cy) override;

    /// Setup the light source color
    void setUpLightColor();

    /// Setup the projection matrix for stereo (View interface)
    virtual void setUpModelMat(int nid) override;

    virtual void drawScene() override;

    /// Clean-up the drawing display with the current bg color
    virtual void clear();

    ////////////////////////////////////////////////
    // Hit test operations

public:
    virtual LString hitTest(int x, int y) override;

    virtual LString hitTestRect(int x, int y, int w, int h, bool bNr) override;

protected:
    MouseEventHandler m_meh;

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
    
    ////////////////////////////////////////////////
    // Framebuffer operations

public:
    /// Create a new off-screen view compatible with this view
    virtual View *createOffScreenView(int w, int h, int aa_depth) override;

    virtual void readPixels(int x, int y, int width, int height, char *pbuf,
                            int nbufsize, int ncomp) override;

    void setFogColorImpl(DisplayContext *pdc);
};
    
} // namespace qsys

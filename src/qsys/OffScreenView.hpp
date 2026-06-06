// -*-Mode: C++;-*-
//
// OffScreenView.hpp
// View that renders into a framebuffer object for off-screen capture
//

#pragma once

#include "qsys.hpp"
#include "GUIView.hpp"

namespace gfx {
class DisplayContext;
class RenderTarget;
}  // namespace gfx

namespace qsys {

/// Off-screen view backed by a framebuffer object (gfx::RenderTarget).
///
/// Borrows the parent view's DisplayContext (and therefore its GL context)
/// and redirects rendering into an FBO so the scene can be captured (e.g. for
/// PNG export) and its color attachment read back to the CPU. Created by
/// GUIView::createOffScreenView and used by render::ImgSceneExporter.
class QSYS_API OffScreenView : public GUIView
{
    using super_t = GUIView;

private:
    /// Borrowed parent display context (NOT owned).
    gfx::DisplayContext *m_pParentCtxt;

    /// Owned off-screen render target.
    gfx::RenderTarget *m_pRT;

public:
    /// Construct an off-screen view of (w,h) sharing pParentCtxt. Allocates
    /// the render target with the given gfx::RTFlags; isValid() reports success.
    OffScreenView(gfx::DisplayContext *pParentCtxt, int w, int h, int flags);
    virtual ~OffScreenView();

    /// True if the render target was allocated successfully.
    bool isValid() const
    {
        return m_pRT != nullptr;
    }

    /// Return the borrowed parent display context.
    virtual gfx::DisplayContext *getDisplayContext() override
    {
        return m_pParentCtxt;
    }

    /// No window to present to.
    virtual void swapBuffers() override {}

    /// Render the scene into the off-screen render target.
    virtual void drawScene() override;

    /// Read back a sub-rectangle of the color attachment (ncomp 3=RGB / 4=RGBA).
    virtual void readPixels(int x, int y, int width, int height, char *pbuf,
                            int nbufsize, int ncomp) override;
};

}  // namespace qsys

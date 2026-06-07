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
class PostProcGpuPrim;
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

    /// Owned off-screen render target (scene color + depth).
    gfx::RenderTarget *m_pRT;

    /// Owned color-only target for the depth visualization pass (depth mode).
    gfx::RenderTarget *m_pDepthVisRT;

    /// Owned fullscreen depth-visualization primitive (depth mode).
    gfx::PostProcGpuPrim *m_pPostProc;

    /// Target last rendered into; readPixels reads from this one.
    gfx::RenderTarget *m_pReadRT;

    /// Owned float accumulation target for jitter supersampling (RGBA16F).
    gfx::RenderTarget *m_pAccumRT;

    /// When true, clear the background transparent (alpha = 0).
    bool m_bBgTransparent;

    /// When true, capture a depth visualization instead of the scene color.
    bool m_bDepthMode;

    /// Jitter supersampling level for export (0 = off, 1..5 = 2/4/8/16/32
    /// samples). Defaults to 5 (32 samples) for high-quality stills.
    int m_nSuperSample;

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

    /// Select transparent (alpha=0) vs opaque background-color clear.
    virtual void setBgTransparent(bool b) override
    {
        m_bBgTransparent = b;
    }

    /// Capture a depth visualization (grayscale) instead of the scene color.
    virtual void setDepthMode(bool b) override
    {
        m_bDepthMode = b;
    }

    /// Set the jitter supersampling level for export (0 = off, 1..5).
    virtual void setSuperSampleLevel(int n) override
    {
        m_nSuperSample = n;
    }

    /// Render the scene into the off-screen render target.
    virtual void drawScene() override;

    /// Read back a sub-rectangle of the color attachment (ncomp 3=RGB / 4=RGBA).
    virtual void readPixels(int x, int y, int width, int height, char *pbuf,
                            int nbufsize, int ncomp) override;

private:
    /// Run the fullscreen depth-visualization pass into m_pDepthVisRT and point
    /// read-back at it. Called from drawScene when depth mode is enabled.
    void drawDepthVis(gfx::DisplayContext *pdc);
};

}  // namespace qsys

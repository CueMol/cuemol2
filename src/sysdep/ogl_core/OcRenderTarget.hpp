// -*-Mode: C++;-*-
//
//  OpenGL off-screen render target (framebuffer object)
//

#pragma once

#include "sysdep.hpp"

#include <gfx/RenderTarget.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

/// OpenGL (core profile) implementation of gfx::RenderTarget.
/// Owns a framebuffer object with a color texture (RGBA8), a depth texture
/// (DEPTH_COMPONENT24, sampleable) and an optional MRT normal texture (RGB16F).
class OcRenderTarget : public gfx::RenderTarget
{
private:
    /// Parent view ID (for context lookup at destruction).
    qlib::uid_t m_nViewID;

    quint32 m_nFBO;
    quint32 m_nColorTex;
    quint32 m_nDepthTex;
    quint32 m_nNormalTex;

    int m_nWidth;
    int m_nHeight;
    int m_nFlags;

    /// Viewport saved by bind(), restored by unbind().
    int m_savedVp[4];

public:
    OcRenderTarget();
    virtual ~OcRenderTarget();

    /// Allocate the FBO and attachments. Records the parent view ID for
    /// cleanup. Returns false if the framebuffer is incomplete.
    bool init(gfx::DisplayContext *pdc, int w, int h, int flags);

    void bind() override;
    void unbind() override;
    void resize(int w, int h) override;
    void bindColorTex(int idx, int texUnit) override;
    void bindDepthTex(int texUnit) override;
    void unbindTextures() override;
    void readColor(int idx, int x, int y, int w, int h, int ncomp,
                   void *pbuf) override;

    bool hasNormal() const override
    {
        return (m_nFlags & gfx::RT_NORMAL_RGB16F) != 0;
    }
    int getWidth() const override
    {
        return m_nWidth;
    }
    int getHeight() const override
    {
        return m_nHeight;
    }

private:
    /// (Re-)allocate attachment textures at the given size.
    void allocAttachments(int w, int h);
};

}  // namespace sysdep

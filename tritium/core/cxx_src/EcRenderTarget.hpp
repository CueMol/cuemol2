// -*-Mode: C++;-*-
//
// React/WebGL off-screen render target (framebuffer object)
//

#pragma once

#include <napi.h>

#include <gfx/RenderTarget.hpp>
#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace node_jsbr {

class ElecView;

/// WebGL implementation of gfx::RenderTarget. Forwards all operations to the
/// JS-side GfxManager peer (createFramebuffer / bindFramebuffer / readPixels
/// ...). Mirrors the OpenGL OcRenderTarget so the portable off-screen view and
/// image exporter work unchanged on the WebGL backend.
class EcRenderTarget : public gfx::RenderTarget
{
private:
    qlib::uid_t m_nViewID;
    qlib::LString m_fboName;
    int m_nWidth;
    int m_nHeight;
    int m_nFlags;

public:
    EcRenderTarget();
    virtual ~EcRenderTarget();

    /// Allocate the FBO via the peer. Returns false if creation failed.
    bool init(gfx::DisplayContext *pdc, int w, int h, int flags);

    void bind() override;
    void unbind() override;
    void clear(float r, float g, float b, float a) override;
    void resize(int w, int h) override;
    void bindColorTex(int idx, int texUnit) override;
    void bindDepthTex(int texUnit) override;
    void blitDepthToDefault() override;
    void unbindTextures() override;
    void readColor(int idx, int x, int y, int w, int h, int ncomp,
                   void *pbuf) override;

    bool hasNormal() const override
    {
        return (m_nFlags & gfx::RT_NORMAL_RGBA16F) != 0;
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
    /// Resolve the owning ElecView (and its peer) by view id. May be null.
    ElecView *getView() const;
};

}  // namespace node_jsbr

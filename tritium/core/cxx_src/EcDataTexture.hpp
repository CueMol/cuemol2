// -*-Mode: C++;-*-
//
// React/WebGL immutable data texture (CPU bytes -> sampler2D).
// Backs the SMAA AreaTex / SearchTex lookup textures.
//

#pragma once

#include <napi.h>

#include <gfx/DataTexture.hpp>
#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace node_jsbr {

class ElecView;

class EcDataTexture : public gfx::DataTexture
{
public:
    EcDataTexture() : m_nViewID(0), m_nWidth(0), m_nHeight(0) {}
    virtual ~EcDataTexture();

    /// Upload w*h*ncomp bytes (ncomp 1 -> R8, 2 -> RG8) as an immutable
    /// texture. linear selects LINEAR vs NEAREST filtering. Returns false on
    /// failure.
    bool create(gfx::DisplayContext *pdc, int w, int h, int ncomp, bool linear,
                const void *data);

    void bind(int texUnit) override;
    void unbind() override;
    int getWidth() const override { return m_nWidth; }
    int getHeight() const override { return m_nHeight; }

private:
    qlib::uid_t m_nViewID;
    qlib::LString m_texName;
    int m_nWidth, m_nHeight;
};

}  // namespace node_jsbr

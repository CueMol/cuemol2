// -*-Mode: C++;-*-
//
//  OpenGL immutable data texture (CPU bytes -> sampler2D)
//

#pragma once

#include "sysdep.hpp"

#include <gfx/DataTexture.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

/// OpenGL (core profile) implementation of gfx::DataTexture. Owns a single
/// GL_TEXTURE_2D uploaded once from CPU data (R8 or RG8, LINEAR or NEAREST,
/// CLAMP_TO_EDGE). Used for the SMAA AreaTex / SearchTex lookup textures.
class OcDataTexture : public gfx::DataTexture
{
private:
    /// Parent view ID (for context lookup at destruction).
    qlib::uid_t m_nViewID;

    quint32 m_nTex;
    int m_nWidth;
    int m_nHeight;

public:
    OcDataTexture();
    virtual ~OcDataTexture();

    /// Allocate and upload the texture. ncomp: 1 = R8, 2 = RG8. linear selects
    /// LINEAR vs NEAREST filtering. Returns false on failure.
    bool init(gfx::DisplayContext *pdc, int w, int h, int ncomp, bool linear,
              const void *data);

    void bind(int texUnit) override;
    void unbind() override;

    int getWidth() const override
    {
        return m_nWidth;
    }
    int getHeight() const override
    {
        return m_nHeight;
    }
};

}  // namespace sysdep

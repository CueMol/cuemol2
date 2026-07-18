// -*-Mode: C++;-*-
//
//  OpenGL mutable float data texture (CPU floats -> sampler2D)
//

#pragma once

#include "sysdep.hpp"

#include <gfx/FloatDataTexture.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

/// OpenGL (core profile) implementation of gfx::FloatDataTexture. Owns a single
/// GL_TEXTURE_2D (RGB32F, NEAREST, CLAMP_TO_EDGE) whose contents can be replaced
/// via update(). Holds per-atom coordinates for vertex-shader position lookup.
class OcFloatDataTexture : public gfx::FloatDataTexture
{
private:
    /// Parent display context (non-owning; used to resolve the view ID).
    gfx::DisplayContext *m_pdc;

    /// Parent view ID (for context lookup at destruction).
    qlib::uid_t m_nViewID;

    quint32 m_nTex;
    int m_nWidth;
    int m_nHeight;
    int m_nComp;

public:
    explicit OcFloatDataTexture(gfx::DisplayContext *pdc);
    ~OcFloatDataTexture() override;

    /// Allocate the GL texture (RGB32F, ncomp must be 3). Returns false on
    /// failure.
    bool create(int w, int h, int ncomp) override;

    /// Replace the whole texture contents with w*h*ncomp floats.
    void update(const void *data) override;

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

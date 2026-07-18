// -*-Mode: C++;-*-
//
// React/WebGL mutable float data texture (CPU floats -> sampler2D).
// Holds per-atom coordinates for vertex-shader position lookup.
//

#pragma once

#include <napi.h>

#include <gfx/FloatDataTexture.hpp>
#include <qlib/LString.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace node_jsbr {

class ElecView;

class EcFloatDataTexture : public gfx::FloatDataTexture
{
public:
    /// pdc is retained only for the create() call (to resolve the target view)
    /// and is not owned.
    explicit EcFloatDataTexture(gfx::DisplayContext *pdc)
        : m_pdc(pdc), m_nViewID(0), m_nWidth(0), m_nHeight(0), m_nComp(0)
    {
    }
    virtual ~EcFloatDataTexture();

    /// Allocate the GL texture (RGB32F, ncomp must be 3). Returns false on
    /// failure.
    bool create(int w, int h, int ncomp) override;

    /// Replace the whole texture contents with w*h*ncomp floats.
    void update(const void *data) override;

    void bind(int texUnit) override;
    void unbind() override;
    int getWidth() const override { return m_nWidth; }
    int getHeight() const override { return m_nHeight; }

private:
    gfx::DisplayContext *m_pdc;   ///< non-owning; used only during create()
    qlib::uid_t m_nViewID;
    qlib::LString m_texName;
    int m_nWidth, m_nHeight, m_nComp;
};

}  // namespace node_jsbr

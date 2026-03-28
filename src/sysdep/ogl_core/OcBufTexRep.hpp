#pragma once

#include "sysdep.hpp"

#include <gfx/PixelBuffer.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

/// OpenGL implementation of gfx::BufTexRep using GL_TEXTURE_BUFFER.
/// Manages a GL buffer object paired with a texture buffer object.
class OcBufTexRep : public gfx::BufTexRep
{
public:
    qlib::uid_t m_nViewID;
    quint32 m_nBufID;  // GL buffer object
    quint32 m_nTexID;  // GL texture buffer object

    OcBufTexRep() : m_nViewID(0), m_nBufID(0), m_nTexID(0) {}
    virtual ~OcBufTexRep();

    /// Allocate GL objects and record view ID for cleanup.
    void init(gfx::DisplayContext *pdc);

    void create(size_t sz, const void *data) override;
    void update(size_t sz, const void *data) override;
    void bind(int texUnit) override;
    void unbind() override;
};

}  // namespace sysdep

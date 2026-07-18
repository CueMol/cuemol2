#pragma once

#include "sysdep.hpp"

#include <gfx/PixelBuffer.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

class OcTexRep : public gfx::PixRep
{
public:
    qlib::uid_t m_nViewID;
    quint32 m_nBufID;

    OcTexRep() : m_nViewID(0), m_nBufID(0) {}
    ~OcTexRep() override;

    void create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf);

    void bind(int texUnit) override;
    void unbind() override;
};

}  // namespace sysdep

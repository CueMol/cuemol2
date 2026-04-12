#pragma once

#include <napi.h>

#include <gfx/PixelBuffer.hpp>
#include <qlib/LTypes.hpp>

namespace gfx {
class DisplayContext;
}

namespace node_jsbr {

class ElecView;

class EcTexRep : public gfx::PixRep
{
public:
    qlib::uid_t m_nViewID;
    quint32 m_nBufID;
    qlib::LString m_texName;
    Napi::ObjectReference m_pixBufRef;

    EcTexRep() : m_nViewID(0), m_nBufID(0) {}
    virtual ~EcTexRep();

    void create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf);

    void bind(int texUnit) override;
    void unbind() override;

private:
    void deleteTexture(ElecView *pView);
};

}  // namespace node_jsbr

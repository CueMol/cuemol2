#pragma once

#include "sysdep.hpp"

#include <gfx/DrawAttrArray.hpp>
#include <gfx/PixelBuffer.hpp>
#include <gfx/ShaderObject.hpp>

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
    virtual ~OcTexRep();
    void create(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf);
};

class SYSDEP_API OcPixDraw
{
private:
    struct Elem
    {
        qfloat32 x, y;
        qfloat32 tx, ty;
    };

    using QuadArray = gfx::DrawAttrArray<Elem>;

    quint32 m_nVertexLoc;
    quint32 m_nTexCoordLoc;

    gfx::ShaderObject *m_pPO;

    QuadArray *m_pDrawAry;

    bool m_bInitialized;

public:
    OcPixDraw() : m_pPO(NULL), m_pDrawAry(NULL), m_bInitialized(false) {}

    ~OcPixDraw()
    {
        invalidate();
    }

    bool initShader(gfx::DisplayContext *pdc);

    bool createDrawElem(gfx::DisplayContext *pdc, const gfx::PixelBuffer &pixbuf);

    void draw(gfx::DisplayContext *pdc, const qlib::Vector4D &pos,
              const gfx::PixelBuffer &data, const gfx::ColorPtr &pcol);

    void invalidate();

private:
    void setupAttrs();
    void alloc();
};

}  // namespace sysdep

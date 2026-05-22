// -*-Mode: C++;-*-
//
// PixGpuPrim: pixel buffer drawing using a texture-mapped quad
//

#pragma once

#include "gfx.hpp"
#include "GpuPrim.hpp"
#include "DrawAttrArray.hpp"
#include "PixelBuffer.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

/// Pixel buffer draw primitive.
/// Renders a PixelBuffer as a screen-space billboard quad.
/// The caller (sysdep) is responsible for creating the PixRep on the PixelBuffer
/// before calling draw().
class GFX_API PixGpuPrim : public GpuPrim
{
private:
    struct Elem
    {
        qfloat32 x, y;   // quad vertex position (0-1 range)
        qfloat32 tx, ty; // texture coordinate
    };

    using QuadArray = DrawAttrArray<Elem>;

    // Predefined attribute locations (must match layout(location=N) in pixdraw_vert.glsl)
    static constexpr int ATTRLOC_VERTEX   = 0;
    static constexpr int ATTRLOC_TEXCOORD = 1;

    ShaderObject *m_pPO = nullptr;
    QuadArray *m_pDrawElem = nullptr;

public:
    PixGpuPrim() = default;
    ~PixGpuPrim() override { invalidate(); }

    bool init(DisplayContext *pDC) override;
    void draw(DisplayContext *pDC) override {}
    void invalidate() override;
    bool isValid() const override { return m_pPO != nullptr && m_pDrawElem != nullptr; }

    /// Draw the pixel buffer as a quad at the given 3D position.
    /// The PixelBuffer must have its PixRep set before this is called.
    void draw(DisplayContext *pDC, const qlib::Vector4D &pos,
              const PixelBuffer &pixbuf, const ColorPtr &pcol);

private:
    void alloc(DisplayContext *pDC);
};

}  // namespace gfx

// -*-Mode: C++;-*-
//
// Elements for qsys::DrawObj
//

#pragma once

#include "gfx.hpp"

#include "DrawAttrArray.hpp"

namespace gfx {

///////////
// 3D Draw Object

struct DrawObjAttr3D
{
    qfloat32 x, y, z;
    qbyte r, g, b, a;
};

class GFX_API DrawObjElems3D : public DrawAttrElems<quint32, DrawObjAttr3D>
{
public:
    using super_t = DrawAttrElems<quint32, DrawObjAttr3D>;

    DrawObjElems3D() : super_t() {}
};

///////////
// 2D Draw Object

struct DrawObjAttr2D
{
    qfloat32 x, y;
    qbyte r, g, b, a;
};

class GFX_API DrawObjElems2D : public DrawAttrElems<quint32, DrawObjAttr2D>
{
public:
    using super_t = DrawAttrElems<quint32, DrawObjAttr2D>;

    DrawObjElems2D() : super_t() {}
};

}  // namespace gfx

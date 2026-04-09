// -*-Mode: C++;-*-
//
// DrawElem implementation
//

#include <common.h>

#include "DrawElem.hpp"

namespace gfx {

DrawElem::DrawElem()
    : super_t(), m_fLineWidth(1.0f), m_nDefColor(0xFFFFFFFF)  // default color: white
{
}

DrawElem::~DrawElem() {}

void DrawElem::setDefColor(const ColorPtr &col)
{
    m_nDefColor = col->getCode();
}

bool DrawElem::normal(int ind, const Vector4D &v)
{
    return false;
}

bool DrawElem::color(int ind, quint32 c)
{
    return false;
}

}  // namespace gfx

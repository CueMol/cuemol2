// -*-Mode: C++;-*-
//
//  Draw object set
//

#include <common.h>

#include "DrawObjElems.hpp"

namespace gfx {

DrawObjSet::~DrawObjSet() {}

void DrawObjSet::allocLines(int nlines) {}

void DrawObjSet::setLineWidth(float width) {}

void DrawObjSet::setNoDepth(bool bNoDepth) {}

void DrawObjSet::setStipple(bool bStipple) {}

void DrawObjSet::setLine(int idx, const qlib::Vector4D &v1, qlib::quint32 cc1,
                         const qlib::Vector4D &v2, qlib::quint32 cc2)
{
}

void DrawObjSet::setLine(int idx, const qlib::Vector4D &v1, const ColorPtr &col1,
                         const qlib::Vector4D &v2, const ColorPtr &col2)
{
    auto nSceneID = getSceneID();
    auto cc1 = col1->getDevCode(nSceneID);
    auto cc2 = col1->getDevCode(nSceneID);
    setLine(idx, v1, cc1, v2, cc2);
}

}  // namespace gfx

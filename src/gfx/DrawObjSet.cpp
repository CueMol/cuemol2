// -*-Mode: C++;-*-
//
//  Draw object set
//

#include <common.h>

#include "DrawObjSet.hpp"

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

void DrawObjSet::setLineUpdated(bool bUpdated) {}

void DrawObjSet::allocTrigMesh(int nverts, int nfaces) {}
void DrawObjSet::setTrigMeshVertex(int idx, const qlib::Vector4D &v) {}
void DrawObjSet::setTrigMeshNormal(int idx, const qlib::Vector4D &n) {}
void DrawObjSet::setTrigMeshColor(int idx, qlib::quint32 cc) {}
void DrawObjSet::setTrigMeshFace(int idx, int v1, int v2, int v3) {}
void DrawObjSet::setTrigMeshUpdated(bool bUpdated) {}

void DrawObjSet::setTrigMeshColor(int idx, const ColorPtr &col)
{
    auto nSceneID = getSceneID();
    auto cc = col->getDevCode(nSceneID);
    setTrigMeshColor(idx, cc);
}

}  // namespace gfx

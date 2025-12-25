// -*-Mode: C++;-*-
//
// OpenGL implementation of DrawObjSet
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <gfx/DrawObjSet.hpp>

namespace sysdep {

class GLSLLineHelper;
class GLSLTrigHelper;

class SYSDEP_API OcDrawObjSet : public gfx::DrawObjSet
{
private:
    using super_t = gfx::DrawObjSet;

    GLSLLineHelper *m_pGlslLine;

    GLSLTrigHelper *m_pGlslTrigMesh;

public:
    OcDrawObjSet();
    virtual ~OcDrawObjSet();

    ////////////////////
    // lines

    virtual void allocLines(int nlines);

    virtual void setLineWidth(float width);

    virtual void setNoDepth(bool bNoDepth);

    virtual void setStipple(bool bStipple);

    virtual void setLine(int idx, const qlib::Vector4D &v1, qlib::quint32 cc1,
                         const qlib::Vector4D &v2, qlib::quint32 cc2);

    virtual void setLineUpdated(bool bUpdated);

    ////////////////////
    // Triangle mesh

    virtual void allocTrigMesh(int nverts, int nfaces);

    virtual void setTrigMeshVertex(int idx, const qlib::Vector4D &v);
    virtual void setTrigMeshNormal(int idx, const qlib::Vector4D &n);
    virtual void setTrigMeshColor(int idx, qlib::quint32 cc);
    virtual void setTrigMeshFace(int idx, int v1, int v2, int v3);

    virtual void setTrigMeshUpdated(bool bUpdated);

    void draw(gfx::DisplayContext *pdl) const;
};

}  // namespace sysdep

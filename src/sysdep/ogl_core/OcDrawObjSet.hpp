// -*-Mode: C++;-*-
//
// OpenGL implementation of DrawObjSet
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <gfx/DrawObjSet.hpp>

namespace sysdep {

class SYSDEP_API OcDrawObjSet : public gfx::DrawObjSet
{
private:
    using super_t = gfx::DrawObjSet;

    GLSLLineHelper *m_pGlslLine;
    // float m_lineWidth;
    // bool m_bStipple;
    // bool m_bNoDepth;


public:
    OcDrawObjSet();
    virtual ~OcDrawObjSet();

    virtual void allocLines(int nlines);

    virtual void setLineWidth(float width);

    virtual void setNoDepth(bool bNoDepth);

    virtual void setStipple(bool bStipple);

    virtual void setLine(int idx, const qlib::Vector4D &v1, qlib::quint32 cc1,
                         const qlib::Vector4D &v2, qlib::quint32 cc2);

    virtual void setLineUpdated(bool bUpdated);

    void draw(gfx::DisplayContext *pdl) const;

};

}  // namespace sysdep

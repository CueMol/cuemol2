//
//  GLSL line rendering helper class
//

#pragma once

#include <gfx/DrawAttrArray.hpp>

namespace qsys {
class Renderer;
}
namespace gfx {
class DisplayContext;
}

namespace sysdep {

class OglProgramObject;

class GLSLLineHelper
{
private:
    struct LineElem
    {
        qfloat32 x1, y1, z1;
        qfloat32 x2, y2, z2;
        qbyte r1, g1, b1, a1;
        qbyte r2, g2, b2, a2;
        qfloat32 ind;  // index number
    };

    using LineArray = gfx::DrawAttrArray<LineElem>;

    quint32 m_nVertex1Loc;
    quint32 m_nCol1Loc;
    quint32 m_nVertex2Loc;
    quint32 m_nCol2Loc;
    quint32 m_nIndLoc;

    sysdep::OglProgramObject *m_pPO;

    LineArray *m_pDrawAry;

    bool m_bInitialized;

    float m_linew;
    float m_stippleLen;

public:
    GLSLLineHelper()
        : m_pPO(NULL),
          m_pDrawAry(NULL),
          m_bInitialized(false),
          m_linew(1.0),
          m_stippleLen(0.0)
    {
    }

    ~GLSLLineHelper()
    {
        invalidate();
    }

    bool initShader(qsys::Renderer *pRend);

    void alloc(int nverts);

    void setLineWidth(double lw)
    {
        m_linew = lw;
    }
    double getLineWidth() const
    {
        return m_linew;
    }
    void setStippleLength(double sl)
    {
        m_stippleLen = sl;
    }
    double getStippleLength() const
    {
        return m_stippleLen;
    }

    void color(int ind, quint32 devcode);

    void vertex(int ind, const qlib::Vector4D &v);

    gfx::AbstDrawElem *getDrawElem() const
    {
        return m_pDrawAry;
    }

    void draw(gfx::DisplayContext *pdc);

    void invalidate();

    bool isValid() const
    {
        return m_bInitialized && m_pDrawAry != NULL;
    }
};

}  // namespace sysdep

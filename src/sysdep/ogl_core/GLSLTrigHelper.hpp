// -*-Mode: C++;-*-
//
//  GLSL triangle rendering helper class
//

#pragma once

#include <sysdep/sysdep.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/DisplayContext.hpp>
#include <gfx/ShaderObject.hpp>

namespace gfx {
class DisplayContext;
}

namespace sysdep {

class SYSDEP_API GLSLTrigHelper
{
private:
    struct TrigVertAttr
    {
        qfloat32 x, y, z;
        qfloat32 nx, ny, nz;
        qbyte r, g, b, a;
    };

    using TrigMesh = gfx::DrawAttrElems<qlib::quint32, TrigVertAttr>;
    TrigMesh *m_pDrawElems;

    // Triangle shader
    gfx::ShaderObject *m_pPO;
    quint32 m_nVertexLoc;
    quint32 m_nColLoc;
    quint32 m_nNormLoc;

    // Triangle edge shader
    gfx::ShaderObject *m_pEdgePO;
    quint32 m_nEVertLoc;
    quint32 m_nEColLoc;
    quint32 m_nENormLoc;

    bool m_bInitialized;
    bool m_bNoDepth;

    int m_nEdgeLineType;

public:
    GLSLTrigHelper()
        : m_pDrawElems(NULL),
          m_pPO(NULL),
          m_pEdgePO(NULL),
          m_bInitialized(false),
          m_bNoDepth(false),
          m_nEdgeLineType(gfx::DisplayContext::ELT_NONE)
    {
    }

    ~GLSLTrigHelper()
    {
        invalidate();
    }

    bool initShader(gfx::DisplayContext *pdc);

    void alloc(int nverts, int nfaces);

    void setNoDepth(bool f)
    {
        m_bNoDepth = f;
    }
    bool isNoDepth() const
    {
        return m_bNoDepth;
    }

    int getEdgeLineType() const
    {
        return m_nEdgeLineType;
    }
    void setEdgeLineType(int n)
    {
        m_nEdgeLineType = n;
    }

    //

    void color(int ind, quint32 devcode);

    void vertex(int ind, const qlib::Vector4D &v);

    void normal(int ind, const qlib::Vector4D &n);

    void face(int ind, int v1, int v2, int v3);

    /// Set update flag
    void setUpdated(bool b)
    {
        if (m_pDrawElems != NULL) {
            m_pDrawElems->setUpdated(b);
        }
    }

    gfx::AbstDrawElem *getDrawElem() const
    {
        return m_pDrawElems;
    }

    void draw(gfx::DisplayContext *pdc);

    void invalidate();

    bool isValid() const
    {
        return m_bInitialized && m_pDrawElems != NULL;
    }

private:
    void setupAttrs();
    void drawEdges(gfx::DisplayContext *pdc);
};

}  // namespace sysdep

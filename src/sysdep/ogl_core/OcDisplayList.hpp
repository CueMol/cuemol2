//
// OcDisplayList.hpp (class OcDisplayList)
// OpenGL Core Profile Display List emulation
//

#pragma once

#include "sysdep.hpp"

#include <gfx/DisplayContext.hpp>
#include <gfx/DrawAttrArray.hpp>
#include <gfx/GrowMesh.hpp>

namespace sysdep {

class OglDisplayContext;
class OglProgramObject;
class GLSLLineHelper;

class SYSDEP_API OcDisplayList : public gfx::DisplayContext
{
private:
    using super_t = gfx::DisplayContext;

    bool m_fPrevPosValid;

    //////////
    // lines

    struct LineDrawAttr
    {
        qlib::Vector4D pos;
        quint32 cc;
    };

    GLSLLineHelper *m_pGlslLine;

    using LineDrawBuf = std::deque<LineDrawAttr>;
    LineDrawBuf m_lineBuf;
    float m_vertLineWidth;
    bool m_bVertStipple;

    //////////
    // triangles

    struct TrigVertAttr
    {
        qfloat32 x, y, z;
        qfloat32 nx, ny, nz;
        qbyte r, g, b, a;
    };

    int m_nPolyMode;

    //////////
    // trigs (vert only)

    using TrigVertArray = gfx::DrawAttrArray<TrigVertAttr>;
    TrigVertArray *m_pTrigArray;

    using TrigVertBuf = std::deque<TrigVertAttr>;
    TrigVertBuf m_trigBuf;

    //////////
    // trig mesh (vert + indices)

    gfx::GrowMesh m_mesh;

    using TrigMesh = gfx::DrawAttrElems<qlib::quint32, TrigVertAttr>;
    TrigMesh *m_pTrigMesh;

    // Triangle shader
    OglProgramObject *m_pTrigPO;
    quint32 m_nVertexLoc;
    quint32 m_nColLoc;
    quint32 m_nNormLoc;
    
    // Triangle edge shader
    OglProgramObject *m_pTrigEdgePO;
    quint32 m_nEVertLoc;
    quint32 m_nEColLoc;
    quint32 m_nENormLoc;

    /////

    bool m_fValid;

    /// current color
    gfx::ColorPtr m_pColor;

    bool m_bSetColor;

    /// current normal vec
    qlib::Vector4D m_norm;

    /// current drawing mode
    int m_nDrawMode;

    Vector4D m_prevPos;
    qlib::quint32 m_prevCol;
    Vector4D m_prevNorm;

    static const int DRAWMODE_NONE = 0;
    static const int DRAWMODE_POINTS = 1;
    // static const int DRAWMODE_POLYGON = 2;
    static const int DRAWMODE_LINES = 3;
    static const int DRAWMODE_LINESTRIP = 4;
    static const int DRAWMODE_TRIGS = 5;
    static const int DRAWMODE_TRIGSTRIP = 6;
    static const int DRAWMODE_TRIGFAN = 7;

    /// Draw a single line segment from v1 to v2 to the output
    /// v1 and v2 should be transformed by matrix stack
    void drawLine(const Vector4D &v1, qlib::quint32 c1, const Vector4D &v2,
                  qlib::quint32 c2);

    qlib::uid_t getSceneID() const;

    void endLines();

    void addTrigVert(const Vector4D &v, const Vector4D &n, qlib::quint32 c);

    void createLineArray();
    void createTrigArray();
    void createTrigMesh();

    void initShader(gfx::DisplayContext *pdc);
    void setupTrigArrayAttrs();
    void setupTrigMeshAttrs();

    void setupTrigEdgeMeshAttrs();

public:
    // Attribute location ID
    // These values should coincide with the location layout qualifiers in the shader
    // static const int DSLOC_VERT_POS = 0;
    // static const int DSLOC_VERT_COLOR = 1;
    // static const int DSLOC_VERT_NORMAL = 2;

    OcDisplayList();
    virtual ~OcDisplayList();

    virtual bool setCurrent()
    {
        return true;
    }
    virtual bool isCurrent() const
    {
        return true;
    }
    virtual bool isFile() const
    {
        return false;
    }

    virtual void vertex(const qlib::Vector4D &);
    virtual void normal(const qlib::Vector4D &);
    virtual void color(const gfx::ColorPtr &c);

    // virtual void pushMatrix();
    // virtual void popMatrix();
    // virtual void multMatrix(const qlib::Matrix4D &mat);
    // virtual void loadMatrix(const qlib::Matrix4D &mat);

    virtual void startPoints();
    virtual void startLines();
    virtual void startLineStrip();
    virtual void startTriangles();
    virtual void startTriangleStrip();
    virtual void startTriangleFan();
    virtual void end();

    // not implemented
    virtual void setPolygonMode(int id);
    virtual void startPolygon();
    virtual void startQuadStrip() {}
    virtual void startQuads() {}

    virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const;
    virtual bool isValid() const
    {
        return m_fValid;
    }
    virtual bool isDisplayList() const;
    virtual bool recordStart();
    virtual void recordEnd();

    virtual void drawMesh(const gfx::Mesh &mesh);

    void callDisplayListImpl(OglDisplayContext *pdc);

private:
    void drawTrigArray(gfx::DisplayContext *pdc);
    void drawTrigMesh(gfx::DisplayContext *pdc);
    void drawTrigEdges(gfx::DisplayContext *pdc, const gfx::AbstDrawElem &de);
};

}  // namespace sysdep

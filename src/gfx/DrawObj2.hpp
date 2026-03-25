// -*-Mode: C++;-*-
//
// DrawObj2: OpenGL-independent draw object classes
//

#pragma once

#include "gfx.hpp"
#include "DrawAttrArray.hpp"
#include "DisplayContext.hpp"

#include <qlib/Vector4D.hpp>

namespace gfx {

class ShaderObject;

/// Base interface for all DrawObj2 classes.
class GFX_API BaseDrawObj2
{
public:
    BaseDrawObj2() = default;
    virtual ~BaseDrawObj2() = default;

    /// Initialize shaders. Must be called before alloc()/draw().
    virtual bool init(DisplayContext *pDC) = 0;

    /// Draw using the given display context.
    virtual void draw(DisplayContext *pDC) = 0;

    /// Release all GPU resources (draw elements).
    virtual void invalidate() = 0;

    /// Returns true if init() and alloc() have been called successfully.
    virtual bool isValid() const = 0;
};

//////////////////////////////////////////////////////////////////////////

/// Sphere impostor draw object.
/// Uses instanced rendering: each SphElem describes one sphere.
class GFX_API SphereDrawObj2 : public BaseDrawObj2
{
public:
    struct SphElem
    {
        qfloat32 cenx, ceny, cenz;
        qfloat32 dspx, dspy;
        qfloat32 rad;
        qbyte r, g, b, a;
    };

    using SphElemAry32 = gfx::DrawAttrElems<quint32, SphElem>;

private:
    // Predefined attribute locations (must match layout(location=N) in sphere2_vertex.glsl)
    static constexpr int ATTRLOC_VERTEX = 0;
    static constexpr int ATTRLOC_IMPOS  = 1;
    static constexpr int ATTRLOC_RAD    = 2;
    static constexpr int ATTRLOC_COLOR  = 3;

    gfx::ShaderObject *m_pPO;
    SphElemAry32 *m_pDrawElem;

    // Billboard corner displacements
    qfloat32 m_dsps[4][2];

public:
    SphereDrawObj2();
    virtual ~SphereDrawObj2();

    bool init(DisplayContext *pDC) override;

    /// Allocate storage for nsph spheres. Must call init() first.
    void alloc(int nsph);

    /// Set sphere data. devcode is a pre-resolved RGBA color code.
    void setData(int idx, const qlib::Vector4D &pos, float rad, quint32 devcode);

    void draw(DisplayContext *pDC) override;
    void invalidate() override;

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    int getSize() const
    {
        return (m_pDrawElem != nullptr) ? (m_pDrawElem->getSize() / 4) : 0;
    }
};

//////////////////////////////////////////////////////////////////////////

/// Cylinder impostor draw object.
/// Uses instanced rendering: each CylElem describes one cylinder.
class GFX_API CylinderDrawObj2 : public BaseDrawObj2
{
public:
    struct CylElem
    {
        qfloat32 cenx, ceny, cenz;
        qfloat32 dirx, diry, dirz;
        qfloat32 dspx, dspy;
        qfloat32 rad;
        qbyte r, g, b, a;
    };

    using CylElemAry32 = gfx::DrawAttrElems<quint32, CylElem>;

private:
    int m_nVertexLoc;
    int m_nDirLoc;
    int m_nImposLoc;
    int m_nRadLoc;
    int m_nColLoc;

    gfx::ShaderObject *m_pPO;
    CylElemAry32 *m_pDrawElem;

    qfloat32 m_dsps[4][2];

public:
    CylinderDrawObj2();
    virtual ~CylinderDrawObj2();

    bool init(DisplayContext *pDC) override;

    /// Allocate storage for ncyl cylinders.
    void alloc(int ncyl);

    /// Set cylinder data. pos1/pos2 are endpoints. devcode is pre-resolved RGBA.
    void setData(int idx, const qlib::Vector4D &pos1, const qlib::Vector4D &pos2,
                 float rad, quint32 devcode);

    void draw(DisplayContext *pDC) override;
    void invalidate() override;

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElem != nullptr;
    }

    int getSize() const
    {
        return (m_pDrawElem != nullptr) ? (m_pDrawElem->getSize() / 4) : 0;
    }
};

//////////////////////////////////////////////////////////////////////////

/// Triangle mesh draw object with optional edge/silhouette rendering.
class GFX_API TrigDrawObj2 : public BaseDrawObj2
{
public:
    struct TrigVertAttr
    {
        qfloat32 x, y, z;
        qfloat32 nx, ny, nz;
        qbyte r, g, b, a;
    };

    using TrigMesh = gfx::DrawAttrElems<quint32, TrigVertAttr>;

private:
    // Main triangle shader attributes
    int m_nVertexLoc;
    int m_nNormLoc;
    int m_nColLoc;

    // Edge shader attributes
    int m_nEVertLoc;
    int m_nENormLoc;

    gfx::ShaderObject *m_pPO;
    gfx::ShaderObject *m_pEdgePO;
    TrigMesh *m_pDrawElems;
    int m_nEdgeLineType;

public:
    TrigDrawObj2();
    virtual ~TrigDrawObj2();

    bool init(DisplayContext *pDC) override;

    /// Allocate storage for nverts vertices and nfaces triangles.
    void alloc(int nverts, int nfaces);

    void setVertex(int idx, const qlib::Vector4D &v);
    void setNormal(int idx, const qlib::Vector4D &n);
    void setColor(int idx, quint32 devcode);
    void setFace(int idx, int v1, int v2, int v3);

    void setEdgeLineType(int n)
    {
        m_nEdgeLineType = n;
    }
    int getEdgeLineType() const
    {
        return m_nEdgeLineType;
    }

    /// Set update flag
    void setUpdated(bool b)
    {
        if (m_pDrawElems != nullptr) m_pDrawElems->setUpdated(b);
    }

    void draw(DisplayContext *pDC) override;
    void invalidate() override;

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawElems != nullptr;
    }

    int getVertexSize() const
    {
        return (m_pDrawElems != nullptr) ? m_pDrawElems->getSize() : 0;
    }

    int getFaceSize() const
    {
        return (m_pDrawElems != nullptr) ? (m_pDrawElems->getIndSize() / 3) : 0;
    }

private:
    void setupAttrs();
    void drawEdges(DisplayContext *pDC);
};


//////////////////////////////////////////////////////////////////////////

/// Wide-line draw object using instanced impostor quads.
class GFX_API LineDrawObj2 : public BaseDrawObj2
{
public:
    struct LineElem
    {
        qfloat32 x1, y1, z1;
        qfloat32 x2, y2, z2;
        qbyte r1, g1, b1, a1;
        qbyte r2, g2, b2, a2;
    };

    using LineArray = gfx::DrawAttrElems<quint32, LineElem>;

private:
    int m_nVertex1Loc;
    int m_nVertex2Loc;
    int m_nCol1Loc;
    int m_nCol2Loc;

    gfx::ShaderObject *m_pPO;
    LineArray *m_pDrawAry;

    float m_linew;
    bool m_bStipple;
    bool m_bNoDepth;

public:
    LineDrawObj2();
    virtual ~LineDrawObj2();

    bool init(DisplayContext *pDC) override;

    /// Allocate storage for nlines line segments.
    void alloc(int nlines);

    /// Set line segment data. devcode1/devcode2 are pre-resolved RGBA color codes.
    void setLine(int idx, const qlib::Vector4D &v1, quint32 devcode1,
                 const qlib::Vector4D &v2, quint32 devcode2);

    void setLineWidth(float lw)
    {
        m_linew = lw;
    }
    float getLineWidth() const
    {
        return m_linew;
    }

    void setStipple(bool f)
    {
        m_bStipple = f;
    }
    bool isStipple() const
    {
        return m_bStipple;
    }

    void setNoDepth(bool f)
    {
        m_bNoDepth = f;
    }
    bool isNoDepth() const
    {
        return m_bNoDepth;
    }

    void setUpdated(bool b)
    {
        if (m_pDrawAry != nullptr) m_pDrawAry->setUpdated(b);
    }

    void draw(DisplayContext *pDC) override;
    void invalidate() override;

    bool isValid() const override
    {
        return m_pPO != nullptr && m_pDrawAry != nullptr;
    }

    int getSize() const
    {
        return (m_pDrawAry != nullptr) ? m_pDrawAry->getSize() : 0;
    }

private:
    void setupAttrs();
};

}  // namespace gfx

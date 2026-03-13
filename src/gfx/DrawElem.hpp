// -*-Mode: C++;-*-
//
// Draw element object
//

#pragma once

#include "gfx.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/LTypes.hpp>
#include "SolidColor.hpp"

namespace gfx {

using qlib::Vector4D;

class GFX_API VBORep
{
public:
    virtual ~VBORep() {}
};

/// Common abstract class for both
///   fixed pipeline verteces and glsl attributes
class GFX_API AbstDrawElem
{
private:
    /// size of vertices
    int m_nSize;

public:
    AbstDrawElem();
    virtual ~AbstDrawElem();

    // virtual void alloc(int nsize) =0;

    virtual int getType() const = 0;

    /// clear cached data (--> delete VBO)
    virtual void invalidateCache() const;

    int getSize() const
    {
        return m_nSize;
    }
    void setSize(int n)
    {
        m_nSize = n;
    }

private:
    /// buffer ID (for GL VBO impl)
    mutable VBORep *m_pVBORep;

public:
    VBORep *getVBO() const
    {
        return m_pVBORep;
    }
    void setVBO(VBORep *p) const
    {
        m_pVBORep = p;
    }

private:
    /// buffer ID (for GL VBO impl)
    mutable VBORep *m_pIndVBO;

public:
    /// index VBO object access
    VBORep *getIndexVBO() const
    {
        return m_pIndVBO;
    }
    void setIndexVBO(VBORep *p) const
    {
        m_pIndVBO = p;
    }

private:
    /// update flag
    mutable bool m_bUpdate;

public:
    bool isUpdated() const
    {
        return m_bUpdate;
    }
    void setUpdated(bool b) const
    {
        m_bUpdate = b;
    }

    //////////////////////////////////////////////////
    // Type ID definitions

    /// vertex, normal, color
    static constexpr int VA_VNC = 1;
    /// vertex, color
    static constexpr int VA_VC = 2;
    /// vertex, normal (color is supplied separatedly)
    static constexpr int VA_VN = 3;
    /// vertex only (color is supplied separatedly)
    static constexpr int VA_V = 4;
    /// vertex, normal, color, and index
    static constexpr int VA_VNCI = 5;

    /// pixel data (UI label, etc)
    static constexpr int VA_PIXEL = 6;

    /// texture map ( to be implemented )
    static constexpr int VA_TEXTURE = 7;

    /// vertex, normal, color, and 32-bit index
    static constexpr int VA_VNCI32 = 8;

    /// arbitary attribute array (for shader impl)
    static constexpr int VA_ATTRS = 9;

    /// arbitary attribute array with indices (for shader impl)
    static constexpr int VA_ATTR_INDS = 10;

    //////////////////////////////////////////////////

private:
    /// drawing mode
    int m_nDrawMode;

public:
    // drawing mode IDs
    static constexpr int DRAW_POINTS = 1;
    static constexpr int DRAW_LINE_STRIP = 2;
    static constexpr int DRAW_LINE_LOOP = 3;
    static constexpr int DRAW_LINES = 4;
    static constexpr int DRAW_TRIANGLE_STRIP = 5;
    static constexpr int DRAW_TRIANGLE_FAN = 6;
    static constexpr int DRAW_TRIANGLES = 7;
    static constexpr int DRAW_QUAD_STRIP = 8;
    static constexpr int DRAW_QUADS = 9;
    static constexpr int DRAW_POLYGON = 10;

    int getDrawMode() const
    {
        return m_nDrawMode;
    }
    void setDrawMode(int n)
    {
        m_nDrawMode = n;
    }
};

/// Draw element class
/// abstraction of VA/VBO implementation of OpenGL
class GFX_API DrawElem : public AbstDrawElem
{
    typedef AbstDrawElem super_t;

public:
    DrawElem();
    virtual ~DrawElem();

    virtual bool vertex(int ind, const Vector4D &v) = 0;

    // bool color(int ind, const ColorPtr &c) {
    // return color(ind, c->getCode());
    // }
    virtual bool color(int ind, quint32 cc);

    virtual bool normal(int ind, const Vector4D &v);

    // void startPoints(int nsize);
    // void startLines(int nsize);
    // void startTriangles(int nsize);

    float getLineWidth() const
    {
        return m_fLineWidth;
    }
    void setLineWidth(float f)
    {
        m_fLineWidth = f;
    }

    quint32 getDefColor() const
    {
        return m_nDefColor;
    }
    void setDefColor(quint32 cc)
    {
        m_nDefColor = cc;
    }
    void setDefColor(const ColorPtr &col);

private:
    /// line width/point size
    float m_fLineWidth;

    /// default color
    quint32 m_nDefColor;
};

}  // namespace gfx


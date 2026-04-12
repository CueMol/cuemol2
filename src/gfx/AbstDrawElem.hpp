// -*-Mode: C++;-*-
//
// Abstract draw element base class
//

#pragma once

#include "gfx.hpp"
#include "VBORep.hpp"

namespace gfx {

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

}  // namespace gfx

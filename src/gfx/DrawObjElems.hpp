// -*-Mode: C++;-*-
//
// Elements for qsys::DrawObj
//

#pragma once

#include "gfx.hpp"

#include "DrawAttrArray.hpp"

namespace gfx {

///////////
// 3D Draw Object

class GFX_API DrawObjSet
{
private:
    /// Associated scene ID
    qlib::uid_t m_nSceneID;

public:
    DrawObjSet() : m_nSceneID(qlib::invalid_uid) {}
    virtual ~DrawObjSet();

    /// Get associated scene ID
    /// @return scene ID
    qlib::uid_t getSceneID() const
    {
        return m_nSceneID;
    }

    /// Set associated scene ID
    /// @param id scene ID
    void setSceneID(qlib::uid_t id)
    {
        m_nSceneID = id;
    }

    //////////
    // lines

    /// Allocate line storage
    /// @param nlines number of lines to allocate
    virtual void allocLines(int nlines);

    /// Set line width
    /// @param width line width
    virtual void setLineWidth(float width);

    /// Set no-depth flag
    /// @param bNoDepth if true, disable depth test
    virtual void setNoDepth(bool bNoDepth);

    virtual void setStipple(bool bStipple);

    /// Set line data
    /// @param idx line index
    /// @param v1 first vertex
    /// @param cc1 color code of first vertex
    /// @param v2 second vertex
    /// @param cc2 color code of second vertex
    virtual void setLine(int idx, const qlib::Vector4D &v1, qlib::quint32 cc1,
                         const qlib::Vector4D &v2, qlib::quint32 cc2);

    /// Set line data (color by ColorPtr)
    void setLine(int idx, const qlib::Vector4D &v1, const ColorPtr &col1,
                 const qlib::Vector4D &v2, const ColorPtr &col2);
};

}  // namespace gfx

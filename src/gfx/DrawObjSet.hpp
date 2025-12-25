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

    ////////////////////
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

    virtual void setLineUpdated(bool bUpdated);

    ////////////////////
    // Triangle mesh

    virtual void allocTrigMesh(int nverts, int nfaces);
    
    virtual void setTrigMeshVertex(int idx, const qlib::Vector4D &v);
    virtual void setTrigMeshNormal(int idx, const qlib::Vector4D &n);
    virtual void setTrigMeshColor(int idx, qlib::quint32 cc);
    virtual void setTrigMeshFace(int idx, int v1, int v2, int v3);

    void setTrigMeshColor(int idx, const ColorPtr &col);

    virtual void setTrigMeshUpdated(bool bUpdated);

private:
    bool m_bInvertColor;

public:
    void setInvertColor(bool bInv)
    {
        m_bInvertColor = bInv;
    }

    bool isInvertColor() const
    {
        return m_bInvertColor;
    }
};

}  // namespace gfx

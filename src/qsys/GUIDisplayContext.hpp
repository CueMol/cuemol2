// -*-Mode: C++;-*-
//
//  GUI display context interface
//

#pragma once

#include "qsys.hpp"
#include <gfx/DisplayContext.hpp>

namespace gfx {
class DrawElemPix;
class AbstDrawAttrs;
}  // namespace gfx

namespace qsys {

using gfx::AbstractColor;
using gfx::ColorPtr;

class QSYS_API GUIDisplayContext : public gfx::DisplayContext
{
private:
    typedef gfx::DisplayContext super_t;

public:
    GUIDisplayContext();
    virtual ~GUIDisplayContext();

public:
    //////////

    void init() {}

    virtual void setTargetView(qsys::View *pView);

    bool useShaderAlpha() const
    {
        return true;
    }
    void setUseShaderAlpha(bool) {}

    virtual bool isFile() const
    {
        return false;
    }

    virtual bool isDrawElemSupported() const
    {
        return true;
    }

    ////////////////

    virtual void setPolygonMode(int id) {}

    virtual void startPoints()
    {
        MB_ASSERT(false);
    }
    virtual void startPolygon()
    {
        MB_ASSERT(false);
    }
    virtual void startLines()
    {
        MB_ASSERT(false);
    }
    virtual void startLineStrip()
    {
        MB_ASSERT(false);
    }
    virtual void startTriangles()
    {
        MB_ASSERT(false);
    }
    virtual void startTriangleStrip()
    {
        MB_ASSERT(false);
    }
    virtual void startTriangleFan()
    {
        MB_ASSERT(false);
    }
    virtual void startQuadStrip()
    {
        MB_ASSERT(false);
    }
    virtual void startQuads()
    {
        MB_ASSERT(false);
    }
    virtual void end()
    {
        MB_ASSERT(false);
    }

    virtual void vertex(const Vector4D &)
    {
        MB_ASSERT(false);
    }
    virtual void normal(const Vector4D &)
    {
        MB_ASSERT(false);
    }

    virtual void drawMesh(const gfx::Mesh &l)
    {
        MB_ASSERT(false);
    }

    ////////////////
    // image/text drawing

    virtual void drawString(const Vector4D &pos, const qlib::LString &str);

    ///////////////////////////////
    // Display List support

    // virtual gfx::DisplayContext *createDisplayList();
    virtual bool canCreateDL() const
    {
        return true;
    }

    // virtual void callDisplayList(DisplayContext *pdl);
    // virtual bool isCompatibleDL(DisplayContext *pdl) const;

    virtual bool isDisplayList() const
    {
        return false;
    }

    virtual bool recordStart()
    {
        return false;
    }

    virtual void recordEnd() {}

    ///////////////////////////////

    virtual gfx::DrawObjSet *createDrawObjSet() const = 0;

    virtual void drawObjSet(const gfx::DrawObjSet &dos) = 0;

    ///////////////////////////////
    // Shader object support: check cache, then delegate creation to subclass

    virtual gfx::ShaderObject *loadShaderObject(const LString &name,
                                                const LString &vert_path,
                                                const LString &frag_path) override;
};

}  // namespace qsys

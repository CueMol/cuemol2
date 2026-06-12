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

    virtual void setTargetView(qsys::View *pView) override;

    bool useShaderAlpha() const
    {
        return true;
    }
    void setUseShaderAlpha(bool) {}

    virtual bool isFile() const override
    {
        return false;
    }

    virtual bool isDrawElemSupported() const override
    {
        return true;
    }

    ////////////////

    virtual void setPolygonMode(int id) override
    {
        m_nPolygonMode = id;
    }

    virtual void startPoints() override
    {
        MB_ASSERT(false);
    }
    virtual void startPolygon() override
    {
        MB_ASSERT(false);
    }
    virtual void startLines() override
    {
        MB_ASSERT(false);
    }
    virtual void startLineStrip() override
    {
        MB_ASSERT(false);
    }
    virtual void startTriangles() override
    {
        MB_ASSERT(false);
    }
    virtual void startTriangleStrip() override
    {
        MB_ASSERT(false);
    }
    virtual void startTriangleFan() override
    {
        MB_ASSERT(false);
    }
    virtual void startQuadStrip() override
    {
        MB_ASSERT(false);
    }
    virtual void startQuads() override
    {
        MB_ASSERT(false);
    }
    virtual void end() override
    {
        MB_ASSERT(false);
    }

    virtual void vertex(const Vector4D &) override
    {
        MB_ASSERT(false);
    }
    virtual void normal(const Vector4D &) override
    {
        MB_ASSERT(false);
    }

    virtual void drawMesh(const gfx::Mesh &l) override
    {
        MB_ASSERT(false);
    }

    ////////////////
    // image/text drawing

    virtual void drawString(const Vector4D &pos, const qlib::LString &str) override;

    ///////////////////////////////
    // Display List support

    virtual gfx::DisplayContext *createDisplayList() override;
    virtual bool canCreateDL() const override
    {
        return true;
    }

    virtual void callDisplayList(DisplayContext *pdl) override;
    virtual bool isCompatibleDL(DisplayContext *pdl) const override;

    virtual bool isDisplayList() const override
    {
        return false;
    }

    virtual bool recordStart() override
    {
        return false;
    }

    virtual void recordEnd() override {}

    ///////////////////////////////
    // Shader object support: check cache, then delegate creation to subclass

    virtual gfx::ShaderObject *loadShaderObject(const LString &name,
                                                const LString &vert_path,
                                                const LString &frag_path) override;
};

}  // namespace qsys

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
    ~GUIDisplayContext() override;

public:
    //////////

    void init() {}

    void setTargetView(qsys::View *pView) override;

    bool useShaderAlpha() const
    {
        return true;
    }
    void setUseShaderAlpha(bool) {}

    bool isFile() const override
    {
        return false;
    }

    bool isDrawElemSupported() const override
    {
        return true;
    }

    ////////////////

    void setPolygonMode(int id) override
    {
        m_nPolygonMode = id;
    }

    void startPoints() override
    {
        MB_ASSERT(false);
    }
    void startPolygon() override
    {
        MB_ASSERT(false);
    }
    void startLines() override
    {
        MB_ASSERT(false);
    }
    void startLineStrip() override
    {
        MB_ASSERT(false);
    }
    void startTriangles() override
    {
        MB_ASSERT(false);
    }
    void startTriangleStrip() override
    {
        MB_ASSERT(false);
    }
    void startTriangleFan() override
    {
        MB_ASSERT(false);
    }
    void startQuadStrip() override
    {
        MB_ASSERT(false);
    }
    void startQuads() override
    {
        MB_ASSERT(false);
    }
    void end() override
    {
        MB_ASSERT(false);
    }

    void vertex(const Vector4D &) override
    {
        MB_ASSERT(false);
    }
    void normal(const Vector4D &) override
    {
        MB_ASSERT(false);
    }

    void drawMesh(const gfx::Mesh &l) override
    {
        MB_ASSERT(false);
    }

    ////////////////
    // image/text drawing

    void drawString(const Vector4D &pos, const qlib::LString &str) override;

    ///////////////////////////////
    // Display List support

    gfx::DisplayContext *createDisplayList() override;
    bool canCreateDL() const override
    {
        return true;
    }

    void callDisplayList(DisplayContext *pdl) override;
    bool isCompatibleDL(DisplayContext *pdl) const override;

    bool isDisplayList() const override
    {
        return false;
    }

    bool recordStart() override
    {
        return false;
    }

    void recordEnd() override {}

    ///////////////////////////////
    // Shader object support: check cache, then delegate creation to subclass

    gfx::ShaderObject *loadShaderObject(const LString &name,
                                                const LString &vert_path,
                                                const LString &frag_path) override;
};

}  // namespace qsys

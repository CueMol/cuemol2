// -*-Mode: C++;-*-
//
// Display context and shader mocks for GL-free tests of the GPU primitives.
//
// loadShaderObject() hands back a shader object whose every method is a
// no-op, so a gfx::*GpuPrim can init(), alloc() and draw() with no OpenGL
// context, and a test can then inspect what it uploaded (colours, hit names).
//

#ifndef TESTS_GFX_MOCK_DISPLAY_CONTEXT_HPP
#define TESTS_GFX_MOCK_DISPLAY_CONTEXT_HPP

#include <common.h>

#include "gfx/DisplayContext.hpp"
#include "gfx/ShaderObject.hpp"
#include "gfx/AbstDrawAttrs.hpp"
#include <qlib/LString.hpp>
#include <qlib/MapTable.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/Vector4D.hpp>

using qlib::LString;
using qlib::Vector4D;

// ---- MockShaderObject ----

class MockShaderObject : public gfx::ShaderObject
{
public:
    bool loadShaders(const qlib::MapTable<qlib::LString> &) override { return true; }
    void enable() override {}
    void disable() override {}
    void setUniform(const LString &, int) override {}
    void setUniform(const LString &, int, int) override {}
    void setUniform(const LString &, int, int, int) override {}
    void setUniform(const LString &, int, int, int, int) override {}
    void setUniformF(const LString &, float) override {}
    void setUniformF(const LString &, float, float) override {}
    void setUniformF(const LString &, float, float, float) override {}
    void setUniformF(const LString &, float, float, float, float) override {}
    void setMatrix(const LString &, const qlib::Matrix4D &) override {}
    void setMatrix(const LString &, const qlib::Matrix3D &) override {}
    int getAttribLocation(const char *) override { return 0; }
    void setupFog(gfx::DisplayContext *) override {}
    void setupMat(gfx::DisplayContext *) override {}
};

// ---- MockDisplayContext ----

class MockDisplayContext : public gfx::DisplayContext
{
public:
    MockShaderObject *m_pMockPO;

    MockDisplayContext() : m_pMockPO(new MockShaderObject()) {}
    ~MockDisplayContext() override { delete m_pMockPO; }

    // Pure virtual implementations (all no-ops)
    bool setCurrent() override { return true; }
    bool isCurrent() const override { return true; }
    bool isFile() const override { return false; }
    void vertex(const Vector4D &) override {}
    void normal(const Vector4D &) override {}
    void setPolygonMode(int) override {}
    void startPoints() override {}
    void startPolygon() override {}
    void startLines() override {}
    void startLineStrip() override {}
    void startTriangles() override {}
    void startTriangleStrip() override {}
    void startTriangleFan() override {}
    void startQuadStrip() override {}
    void startQuads() override {}
    void end() override {}

    // loadShaderObject returns the same mock for any shader name
    gfx::ShaderObject *loadShaderObject(const LString &, const LString &,
                                        const LString &) override
    {
        return m_pMockPO;
    }

    // drawElem is a no-op
    void drawElem(const gfx::AbstDrawElem &) override {}
};

#endif  // TESTS_GFX_MOCK_DISPLAY_CONTEXT_HPP

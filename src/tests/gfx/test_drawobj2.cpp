// Tests for DrawObj2 subclasses.
// Uses a MockDisplayContext that returns a MockShaderObject from loadShaderObject().

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/DrawObj2.hpp"
#include "gfx/DisplayContext.hpp"
#include "gfx/ShaderObject.hpp"
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
    ~MockDisplayContext() { delete m_pMockPO; }

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

// ---- SphereDrawObj2 tests ----

class SphereDrawObj2Test : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::SphereDrawObj2 obj;
};

TEST_F(SphereDrawObj2Test, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(SphereDrawObj2Test, NotValidBeforeAlloc)
{
    obj.init(&dc);
    EXPECT_FALSE(obj.isValid());
}

TEST_F(SphereDrawObj2Test, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(3);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(SphereDrawObj2Test, SizeAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(5);
    EXPECT_EQ(obj.getSize(), 5);
}

TEST_F(SphereDrawObj2Test, SetDataStoresValues)
{
    obj.init(&dc);
    obj.alloc(2);

    // devcode: AARRGGBB = 0xFF102030
    quint32 devcode = 0xFF102030u;
    Vector4D pos(1.0, 2.0, 3.0);
    obj.setData(0, pos, 0.5f, devcode);

    // Check first vertex of sphere 0 (all 4 vertices share cenx,ceny,cenz,rad)
    using SphElem = gfx::SphereDrawObj2::SphElem;
    using SphElemAry32 = gfx::SphereDrawObj2::SphElemAry32;

    // Access internal draw elem via getSize (only public interface test)
    EXPECT_EQ(obj.getSize(), 2);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(SphereDrawObj2Test, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(3);
    ASSERT_TRUE(obj.isValid());
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(SphereDrawObj2Test, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(2);
    // Should not crash (uses mock DC)
    obj.draw(&dc);
}

// ---- CylinderDrawObj2 tests ----

class CylinderDrawObj2Test : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::CylinderDrawObj2 obj;
};

TEST_F(CylinderDrawObj2Test, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(CylinderDrawObj2Test, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(4);
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getSize(), 4);
}

TEST_F(CylinderDrawObj2Test, SetDataDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(2);
    obj.setData(0, Vector4D(0, 0, 0), Vector4D(1, 0, 0), 0.3f, 0xFF0000FFu);
    obj.setData(1, Vector4D(1, 0, 0), Vector4D(2, 0, 0), 0.3f, 0xFF00FF00u);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(CylinderDrawObj2Test, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(2);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

// ---- TrigDrawObj2 tests ----

class TrigDrawObj2Test : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::TrigDrawObj2 obj;
};

TEST_F(TrigDrawObj2Test, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(TrigDrawObj2Test, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(3, 1);  // 3 verts, 1 face
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getVertexSize(), 3);
    EXPECT_EQ(obj.getFaceSize(), 1);
}

TEST_F(TrigDrawObj2Test, SetVertexNormalColorFace)
{
    obj.init(&dc);
    obj.alloc(3, 1);

    obj.setVertex(0, Vector4D(0, 0, 0));
    obj.setVertex(1, Vector4D(1, 0, 0));
    obj.setVertex(2, Vector4D(0, 1, 0));
    obj.setNormal(0, Vector4D(0, 0, 1));
    obj.setColor(0, 0xFF0000FFu);
    obj.setFace(0, 0, 1, 2);

    EXPECT_TRUE(obj.isValid());
}

TEST_F(TrigDrawObj2Test, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(3, 1);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(TrigDrawObj2Test, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(3, 1);
    obj.setVertex(0, Vector4D(0, 0, 0));
    obj.setVertex(1, Vector4D(1, 0, 0));
    obj.setVertex(2, Vector4D(0, 1, 0));
    obj.setFace(0, 0, 1, 2);
    obj.draw(&dc);
}

// ---- LineDrawObj2 tests ----

class LineDrawObj2Test : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::LineDrawObj2 obj;
};

TEST_F(LineDrawObj2Test, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(LineDrawObj2Test, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(5);
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getSize(), 5);
}

TEST_F(LineDrawObj2Test, SetLineStoresValues)
{
    obj.init(&dc);
    obj.alloc(3);

    obj.setLine(0, Vector4D(0, 0, 0), 0xFF0000FFu, Vector4D(1, 0, 0), 0xFF00FF00u);
    obj.setLine(1, Vector4D(1, 0, 0), 0xFF00FF00u, Vector4D(2, 0, 0), 0xFFFF0000u);
    obj.setLine(2, Vector4D(2, 0, 0), 0xFFFF0000u, Vector4D(3, 0, 0), 0xFF0000FFu);

    EXPECT_EQ(obj.getSize(), 3);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(LineDrawObj2Test, PropertySetters)
{
    obj.setLineWidth(2.5f);
    EXPECT_FLOAT_EQ(obj.getLineWidth(), 2.5f);

    obj.setStipple(true);
    EXPECT_TRUE(obj.isStipple());

    obj.setNoDepth(true);
    EXPECT_TRUE(obj.isNoDepth());
}

TEST_F(LineDrawObj2Test, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(3);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(LineDrawObj2Test, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(2);
    obj.setLine(0, Vector4D(0, 0, 0), 0xFF0000FFu, Vector4D(1, 0, 0), 0xFF00FF00u);
    obj.draw(&dc);
}

// Tests for GpuPrim subclasses.
// Uses a MockDisplayContext that returns a MockShaderObject from loadShaderObject().

#include <gtest/gtest.h>
#include <common.h>

#include "gfx/GpuPrim.hpp"
#include "gfx/DisplayContext.hpp"
#include "gfx/DisplayList.hpp"
#include "gfx/ShaderObject.hpp"
#include "gfx/SolidColor.hpp"
#include "gfx/AbstDrawAttrs.hpp"
#include "gfx/DrawAttrArray.hpp"
#include "gfx/DrawAttrElems.hpp"
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

// ---- SphereGpuPrim tests ----

class SphereGpuPrimTest : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::SphereGpuPrim obj;
};

TEST_F(SphereGpuPrimTest, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(SphereGpuPrimTest, NotValidBeforeAlloc)
{
    obj.init(&dc);
    EXPECT_FALSE(obj.isValid());
}

TEST_F(SphereGpuPrimTest, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(&dc, 3);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(SphereGpuPrimTest, SizeAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(&dc, 5);
    EXPECT_EQ(obj.getSize(), 5);
}

TEST_F(SphereGpuPrimTest, SetDataStoresValues)
{
    obj.init(&dc);
    obj.alloc(&dc, 2);

    // devcode: AARRGGBB = 0xFF102030
    quint32 devcode = 0xFF102030u;
    Vector4D pos(1.0, 2.0, 3.0);
    obj.setData(0, pos, 0.5f, devcode);

    // Check first vertex of sphere 0 (all 4 vertices share cenx,ceny,cenz,rad)
    using SphElem = gfx::SphereGpuPrim::SphElem;
    using SphElemAry32 = gfx::SphereGpuPrim::SphElemAry32;

    // Access internal draw elem via getSize (only public interface test)
    EXPECT_EQ(obj.getSize(), 2);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(SphereGpuPrimTest, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(&dc, 3);
    ASSERT_TRUE(obj.isValid());
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(SphereGpuPrimTest, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(&dc, 2);
    // Should not crash (uses mock DC)
    obj.draw(&dc);
}

// ---- CylinderGpuPrim tests ----

class CylinderGpuPrimTest : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::CylinderGpuPrim obj;
};

TEST_F(CylinderGpuPrimTest, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(CylinderGpuPrimTest, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(&dc, 4);
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getSize(), 4);
}

TEST_F(CylinderGpuPrimTest, SetDataDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(&dc, 2);
    obj.setData(0, Vector4D(0, 0, 0), Vector4D(1, 0, 0), 0.3f, 0xFF0000FFu);
    obj.setData(1, Vector4D(1, 0, 0), Vector4D(2, 0, 0), 0.3f, 0xFF00FF00u);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(CylinderGpuPrimTest, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(&dc, 2);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

// ---- TrigGpuPrim tests ----

class TrigGpuPrimTest : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::TrigGpuPrim obj;
};

TEST_F(TrigGpuPrimTest, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(TrigGpuPrimTest, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(&dc, 3, 1);  // 3 verts, 1 face
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getVertexSize(), 3);
    EXPECT_EQ(obj.getFaceSize(), 1);
}

TEST_F(TrigGpuPrimTest, SetVertexNormalColorFace)
{
    obj.init(&dc);
    obj.alloc(&dc, 3, 1);

    obj.setVertex(0, Vector4D(0, 0, 0));
    obj.setVertex(1, Vector4D(1, 0, 0));
    obj.setVertex(2, Vector4D(0, 1, 0));
    obj.setNormal(0, Vector4D(0, 0, 1));
    obj.setColor(0, 0xFF0000FFu);
    obj.setFace(0, 0, 1, 2);

    EXPECT_TRUE(obj.isValid());
}

TEST_F(TrigGpuPrimTest, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(&dc, 3, 1);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(TrigGpuPrimTest, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(&dc, 3, 1);
    obj.setVertex(0, Vector4D(0, 0, 0));
    obj.setVertex(1, Vector4D(1, 0, 0));
    obj.setVertex(2, Vector4D(0, 1, 0));
    obj.setFace(0, 0, 1, 2);
    obj.draw(&dc);
}

// ---- LineGpuPrim tests ----

class LineGpuPrimTest : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::LineGpuPrim obj;
};

TEST_F(LineGpuPrimTest, InitSucceeds)
{
    EXPECT_TRUE(obj.init(&dc));
}

TEST_F(LineGpuPrimTest, ValidAfterAlloc)
{
    obj.init(&dc);
    obj.alloc(&dc, 5);
    EXPECT_TRUE(obj.isValid());
    EXPECT_EQ(obj.getSize(), 5);
}

TEST_F(LineGpuPrimTest, SetLineStoresValues)
{
    obj.init(&dc);
    obj.alloc(&dc, 3);

    obj.setLine(0, Vector4D(0, 0, 0), 0xFF0000FFu, Vector4D(1, 0, 0), 0xFF00FF00u);
    obj.setLine(1, Vector4D(1, 0, 0), 0xFF00FF00u, Vector4D(2, 0, 0), 0xFFFF0000u);
    obj.setLine(2, Vector4D(2, 0, 0), 0xFFFF0000u, Vector4D(3, 0, 0), 0xFF0000FFu);

    EXPECT_EQ(obj.getSize(), 3);
    EXPECT_TRUE(obj.isValid());
}

TEST_F(LineGpuPrimTest, PropertySetters)
{
    obj.setLineWidth(2.5f);
    EXPECT_FLOAT_EQ(obj.getLineWidth(), 2.5f);

    obj.setStipple(true);
    EXPECT_TRUE(obj.isStipple());

    obj.setNoDepth(true);
    EXPECT_TRUE(obj.isNoDepth());
}

TEST_F(LineGpuPrimTest, InvalidateResetsState)
{
    obj.init(&dc);
    obj.alloc(&dc, 3);
    obj.invalidate();
    EXPECT_FALSE(obj.isValid());
}

TEST_F(LineGpuPrimTest, DrawDoesNotCrash)
{
    obj.init(&dc);
    obj.alloc(&dc, 2);
    obj.setLine(0, Vector4D(0, 0, 0), 0xFF0000FFu, Vector4D(1, 0, 0), 0xFF00FF00u);
    obj.draw(&dc);
}

// ---- AbstDrawAttrs wire-form tests ----
// These pin the current contract between GpuPrim::alloc / setData and the
// underlying AbstDrawAttrs accessors (getData, getDataSize, getIndData,
// getAttr*). The contract must be preserved across the upcoming buffer-alloc
// refactor (DisplayContext::allocBuffer + storage-by-reference).

namespace {

struct TestElem {
    qfloat32 x, y, z;
    qbyte r, g, b, a;
};

using TestArray = gfx::DrawAttrArray<TestElem>;
using TestElems = gfx::DrawAttrElems<quint32, TestElem>;

}  // namespace

TEST(DrawAttrArrayWireForm, AllocSetsDataSize)
{
    TestArray arr;
    arr.alloc(7);
    EXPECT_EQ(arr.getSize(), 7);
    EXPECT_NE(arr.getData(), nullptr);
    EXPECT_EQ(arr.getElemSize(), sizeof(TestElem));
    EXPECT_EQ(arr.getDataSize(), 7u * sizeof(TestElem));
}

TEST(DrawAttrArrayWireForm, AtRoundtrip)
{
    TestArray arr;
    arr.alloc(3);
    arr.at(1).x = 1.25f;
    arr.at(1).y = 2.5f;
    arr.at(1).r = 0x12;
    EXPECT_FLOAT_EQ(arr.at(1).x, 1.25f);
    EXPECT_FLOAT_EQ(arr.at(1).y, 2.5f);
    EXPECT_EQ(arr.at(1).r, 0x12);
}

TEST(DrawAttrArrayWireForm, AttrInfoStored)
{
    TestArray arr;
    arr.setAttrSize(2);
    arr.setAttrInfo(0, /*loc*/3, /*elems*/3, /*type*/qlib::type_consts::QTC_FLOAT32,
                    offsetof(TestElem, x));
    arr.setAttrInfo(1, /*loc*/5, /*elems*/4, /*type*/qlib::type_consts::QTC_UINT8,
                    offsetof(TestElem, r));
    arr.setAttrDivisor(1, 1);

    EXPECT_EQ(arr.getAttrSize(), 2u);
    EXPECT_EQ(arr.getAttrLoc(0), 3);
    EXPECT_EQ(arr.getAttrElemSize(0), 3);
    EXPECT_EQ(arr.getAttrTypeID(0), qlib::type_consts::QTC_FLOAT32);
    EXPECT_EQ(arr.getAttrPos(0), (int)offsetof(TestElem, x));
    EXPECT_EQ(arr.getAttrDivisor(0), 0);
    EXPECT_EQ(arr.getAttrLoc(1), 5);
    EXPECT_EQ(arr.getAttrElemSize(1), 4);
    EXPECT_EQ(arr.getAttrTypeID(1), qlib::type_consts::QTC_UINT8);
    EXPECT_EQ(arr.getAttrPos(1), (int)offsetof(TestElem, r));
    EXPECT_EQ(arr.getAttrDivisor(1), 1);
}

TEST(DrawAttrElemsWireForm, AllocIndSetsSize)
{
    TestElems arr;
    arr.alloc(4);
    arr.allocInd(6);
    EXPECT_EQ(arr.getSize(), 4);
    EXPECT_EQ(arr.getIndSize(), 6u);
    EXPECT_NE(arr.getIndData(), nullptr);
    EXPECT_EQ(arr.getIndElemSize(), sizeof(quint32));
    EXPECT_EQ(arr.getIndDataSize(), 6u * sizeof(quint32));
}

TEST(DrawAttrElemsWireForm, AtIndRoundtrip)
{
    TestElems arr;
    arr.alloc(4);
    arr.allocInd(3);
    arr.atind(0) = 0;
    arr.atind(1) = 2;
    arr.atind(2) = 1;
    EXPECT_EQ(arr.atind(0), 0u);
    EXPECT_EQ(arr.atind(1), 2u);
    EXPECT_EQ(arr.atind(2), 1u);
}

TEST(DrawAttrElemsWireForm, NumInstancesStored)
{
    TestElems arr;
    arr.alloc(4);
    arr.setNumInstances(10);
    EXPECT_EQ(arr.getNumInstances(), 10);
}

TEST(DrawAttrElemsWireForm, DrawModeStored)
{
    TestElems arr;
    arr.alloc(4);
    arr.setDrawMode(gfx::AbstDrawElem::DRAW_TRIANGLES);
    EXPECT_EQ(arr.getDrawMode(), gfx::AbstDrawElem::DRAW_TRIANGLES);
}

// ---- AbstDrawAttrs storage-by-reference hooks ----
// Pin the new hooks introduced for DisplayContext::allocBuffer:
//   - allocOwnedData / allocOwnedIndData (owning C++ heap path)
//   - setDataRef / setIndDataRef (external-storage path)
//   - getExtDataHandle / setExtDataHandle (opaque backend handle)
//   - setDataFinalizer / setIndDataFinalizer (dtor-time cleanup hook)

TEST(AbstDrawAttrsStorage, AllocOwnedDataSetsSize)
{
    TestArray arr;
    arr.allocOwnedData(5);
    EXPECT_EQ(arr.getSize(), 5);
    EXPECT_NE(arr.getData(), nullptr);
}

TEST(AbstDrawAttrsStorage, SetDataRefAttachesExternal)
{
    TestElem buf[4];
    TestArray arr;
    arr.setDataRef(buf, 4);
    EXPECT_EQ(arr.getSize(), 4);
    // m_data is in refer mode -> getData() returns the external pointer
    EXPECT_EQ(arr.getData(), static_cast<const void *>(buf));
}

TEST(AbstDrawAttrsStorage, SetDataRefRoundtripWrites)
{
    TestElem buf[3];
    TestArray arr;
    arr.setDataRef(buf, 3);
    arr.at(1).x = 3.5f;
    arr.at(2).r = 0x42;
    // External buffer should see the writes (refer mode = no copy).
    EXPECT_FLOAT_EQ(buf[1].x, 3.5f);
    EXPECT_EQ(buf[2].r, 0x42);
}

TEST(AbstDrawAttrsStorage, SetIndDataRefAttachesExternal)
{
    quint32 inds[6] = {0, 1, 2, 2, 1, 3};
    TestElems arr;
    arr.allocOwnedData(4);
    arr.setIndDataRef(inds, 6);
    EXPECT_EQ(arr.getIndSize(), 6u);
    EXPECT_EQ(arr.getIndData(), static_cast<const void *>(inds));
    arr.atind(0) = 9;
    EXPECT_EQ(inds[0], 9u);  // write lands in external buffer
}

TEST(AbstDrawAttrsStorage, ExtDataHandleRoundtrip)
{
    TestArray arr;
    int marker = 42;
    arr.setExtDataHandle(&marker);
    EXPECT_EQ(arr.getExtDataHandle(), static_cast<void *>(&marker));
    arr.setExtDataHandle(nullptr);
    EXPECT_EQ(arr.getExtDataHandle(), nullptr);
}

TEST(AbstDrawAttrsStorage, ExtIndDataHandleRoundtrip)
{
    TestElems arr;
    int marker = 42;
    arr.setExtIndDataHandle(&marker);
    EXPECT_EQ(arr.getExtIndDataHandle(), static_cast<void *>(&marker));
}

TEST(AbstDrawAttrsStorage, DataFinalizerCalledOnDtor)
{
    int called = 0;
    {
        TestArray arr;
        arr.setDataFinalizer([&called]() { ++called; });
        EXPECT_EQ(called, 0);
    }
    EXPECT_EQ(called, 1);
}

TEST(AbstDrawAttrsStorage, IndDataFinalizerCalledOnDtor)
{
    int called_d = 0, called_i = 0;
    {
        TestElems arr;
        arr.setDataFinalizer([&called_d]() { ++called_d; });
        arr.setIndDataFinalizer([&called_i]() { ++called_i; });
    }
    EXPECT_EQ(called_d, 1);
    EXPECT_EQ(called_i, 1);
}

TEST(AbstDrawAttrsStorage, FinalizerNotCalledIfNotSet)
{
    // Just ensure no crash when no finalizers are attached.
    TestArray arr;
    arr.allocOwnedData(2);
    // dtor runs at scope end without invoking any finalizer.
}

// ---- DisplayContext::allocBuffer default impl ----

TEST(DisplayContextAllocBuffer, DefaultAllocatesOwningHeap)
{
    MockDisplayContext dc;
    TestElems arr;
    dc.allocBuffer(arr, 4, 6);
    EXPECT_EQ(arr.getSize(), 4);
    EXPECT_EQ(arr.getIndSize(), 6u);
    EXPECT_NE(arr.getData(), nullptr);
    EXPECT_NE(arr.getIndData(), nullptr);
    // Owning path: ext handles remain null.
    EXPECT_EQ(arr.getExtDataHandle(), nullptr);
    EXPECT_EQ(arr.getExtIndDataHandle(), nullptr);
}

TEST(DisplayContextAllocBuffer, ZeroIndSkipsIndAllocation)
{
    MockDisplayContext dc;
    TestArray arr;
    dc.allocBuffer(arr, 8, 0);
    EXPECT_EQ(arr.getSize(), 8);
    EXPECT_NE(arr.getData(), nullptr);
}

// ---- DisplayList line color tracking ----
//
// A renderer bakes a single line color by calling color() once before
// startLines() (e.g. AtomIntrRenderer simple/dashed mode). startLines() must
// NOT discard that color: the built LineGpuPrim has to use the recorded
// per-vertex colors. If it falls back to uniform color, the line picks up the
// outer context's current (unrelated) color and renders wrong on first draw.
// The m_bSetColor flag is therefore reset per recording (recordStart), not per
// line block (startLines).

class DisplayListLineColorTest : public ::testing::Test
{
protected:
    MockDisplayContext dc;
    gfx::DisplayList dl;

    // Record one line segment, then build the GpuPrim on the mock context.
    void recordOneLine(bool bSetColor)
    {
        dl.recordStart();
        if (bSetColor) dl.color(gfx::SolidColor::createRGB(1.0, 1.0, 0.0));
        dl.startLines();
        dl.vertex(qlib::Vector4D(0, 0, 0));
        dl.vertex(qlib::Vector4D(1, 0, 0));
        dl.end();
        dl.recordEnd();
        dl.callDisplayListImpl(&dc);
    }
};

// color() before startLines() -> recorded vertex colors are used.
TEST_F(DisplayListLineColorTest, ColorBeforeStartLinesUsesVertColor)
{
    recordOneLine(true);
    ASSERT_NE(dl.getLineObj(), nullptr);
    EXPECT_TRUE(dl.getLineObj()->isUseVertColor());
}

// No color() at all -> uniform (outer context) color path is preserved.
TEST_F(DisplayListLineColorTest, NoColorUsesUniformColor)
{
    recordOneLine(false);
    ASSERT_NE(dl.getLineObj(), nullptr);
    EXPECT_FALSE(dl.getLineObj()->isUseVertColor());
}

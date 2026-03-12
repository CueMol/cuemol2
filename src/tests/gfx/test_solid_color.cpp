#include <gtest/gtest.h>
#include <common.h>
#include "qlib/qlib.hpp"
#include "gfx/gfx.hpp"
#include "gfx/SolidColor.hpp"
#include "qlib/Vector4D.hpp"

using gfx::SolidColor;

// Initialize qlib and gfx scripting infrastructure for all tests in this binary.
class GfxEnvironment : public ::testing::Environment {
public:
    void SetUp() override {
        qlib::init();
        gfx::init();
    }
    void TearDown() override {
        gfx::fini();
        qlib::fini();
    }
};

int main(int argc, char **argv) {
    ::testing::InitGoogleTest(&argc, argv);
    ::testing::AddGlobalTestEnvironment(new GfxEnvironment());
    return RUN_ALL_TESTS();
}

// ---- Constructors ----

TEST(SolidColorTest, DefaultConstructor)
{
    SolidColor c;
    EXPECT_EQ(c.r(), 0);
    EXPECT_EQ(c.g(), 0);
    EXPECT_EQ(c.b(), 0);
    EXPECT_EQ(c.a(), 0);
    EXPECT_EQ(c.getCode(), 0u);
}

TEST(SolidColorTest, ConstructorUInt)
{
    // code = AARRGGBB
    SolidColor c(0xFF804020u);
    EXPECT_EQ(c.r(), 0x80);
    EXPECT_EQ(c.g(), 0x40);
    EXPECT_EQ(c.b(), 0x20);
    EXPECT_EQ(c.a(), 0xFF);
}

TEST(SolidColorTest, ConstructorIntRGB)
{
    SolidColor c(100, 150, 200);
    EXPECT_EQ(c.r(), 100);
    EXPECT_EQ(c.g(), 150);
    EXPECT_EQ(c.b(), 200);
    EXPECT_EQ(c.a(), 255);
}

TEST(SolidColorTest, ConstructorIntRGBA)
{
    SolidColor c(10, 20, 30, 128);
    EXPECT_EQ(c.r(), 10);
    EXPECT_EQ(c.g(), 20);
    EXPECT_EQ(c.b(), 30);
    EXPECT_EQ(c.a(), 128);
}

TEST(SolidColorTest, ConstructorDoubleRGB)
{
    SolidColor c(1.0, 0.5, 0.0);
    EXPECT_EQ(c.r(), 255);
    EXPECT_EQ(c.g(), 128); // int(0.5*255+0.5) = 128
    EXPECT_EQ(c.b(), 0);
    EXPECT_EQ(c.a(), 255);
}

TEST(SolidColorTest, ConstructorDoubleRGBA)
{
    SolidColor c(1.0, 1.0, 1.0, 0.0);
    EXPECT_EQ(c.r(), 255);
    EXPECT_EQ(c.g(), 255);
    EXPECT_EQ(c.b(), 255);
    EXPECT_EQ(c.a(), 0);
}

TEST(SolidColorTest, ConstructorDoubleClamp)
{
    // values outside [0,1] must be clamped
    SolidColor c(-0.5, 0.5, 2.0);
    EXPECT_EQ(c.r(), 0);
    EXPECT_EQ(c.b(), 255);
}

TEST(SolidColorTest, ConstructorVector4D)
{
    qlib::Vector4D v(1.0, 0.0, 0.5, 1.0);
    SolidColor c(v);
    EXPECT_EQ(c.r(), 255);
    EXPECT_EQ(c.g(), 0);
    EXPECT_EQ(c.b(), 128);
    EXPECT_EQ(c.a(), 255);
}

TEST(SolidColorTest, CopyConstructor)
{
    SolidColor orig(100, 150, 200, 50);
    SolidColor copy(orig);
    EXPECT_EQ(copy.r(), 100);
    EXPECT_EQ(copy.g(), 150);
    EXPECT_EQ(copy.b(), 200);
    EXPECT_EQ(copy.a(), 50);
    EXPECT_EQ(copy.getCode(), orig.getCode());
}

TEST(SolidColorTest, AssignmentOperator)
{
    SolidColor a(10, 20, 30, 40);
    SolidColor b;
    b = a;
    EXPECT_EQ(b.r(), 10);
    EXPECT_EQ(b.g(), 20);
    EXPECT_EQ(b.b(), 30);
    EXPECT_EQ(b.a(), 40);
}

// ---- Setters ----

TEST(SolidColorTest, SetRGBChannels)
{
    SolidColor c(0, 0, 0, 255);
    c.setR(10);
    c.setG(20);
    c.setB(30);
    EXPECT_EQ(c.r(), 10);
    EXPECT_EQ(c.g(), 20);
    EXPECT_EQ(c.b(), 30);
    EXPECT_EQ(c.a(), 255); // alpha unchanged
}

TEST(SolidColorTest, SetA)
{
    SolidColor c(100, 100, 100, 255);
    c.setA(128);
    EXPECT_EQ(c.a(), 128);
    EXPECT_EQ(c.r(), 100); // rgb unchanged
}

TEST(SolidColorTest, SetCode)
{
    SolidColor c;
    c.setCode(0xFF112233u);
    EXPECT_EQ(c.getCode(), 0xFF112233u);
    EXPECT_EQ(c.r(), 0x11);
    EXPECT_EQ(c.g(), 0x22);
    EXPECT_EQ(c.b(), 0x33);
    EXPECT_EQ(c.a(), 0xFF);
}

TEST(SolidColorTest, SetRGBA)
{
    SolidColor c;
    c.setRGBA(0.0, 1.0, 0.5, 1.0);
    EXPECT_EQ(c.r(), 0);
    EXPECT_EQ(c.g(), 255);
    EXPECT_EQ(c.b(), 128);
    EXPECT_EQ(c.a(), 255);
}

TEST(SolidColorTest, SetRGBAClamp)
{
    SolidColor c;
    c.setRGBA(-1.0, 2.0, 0.5, -0.1);
    EXPECT_EQ(c.r(), 0);
    EXPECT_EQ(c.g(), 255);
    EXPECT_EQ(c.a(), 0);
}

TEST(SolidColorTest, SetAlphaGetAlpha)
{
    SolidColor c(255, 255, 255, 0);
    c.setAlpha(1.0);
    EXPECT_NEAR(c.getAlpha(), 1.0, 1.0 / 255.0);
    c.setAlpha(0.0);
    EXPECT_NEAR(c.getAlpha(), 0.0, 1.0 / 255.0);
}

// ---- HSB ----

TEST(SolidColorTest, SetHSBARoundtrip)
{
    // Red: H=0, S=1, B=1
    SolidColor c;
    c.setHSBA(0.0, 1.0, 1.0, 1.0);
    EXPECT_NEAR(c.fr(), 1.0, 2.0 / 255.0);
    EXPECT_NEAR(c.fg(), 0.0, 2.0 / 255.0);
    EXPECT_NEAR(c.fb(), 0.0, 2.0 / 255.0);
}

TEST(SolidColorTest, CreateHSB)
{
    // Green: H=120/360, S=1, B=1
    auto sp = SolidColor::createHSB(120.0 / 360.0, 1.0, 1.0, 1.0);
    EXPECT_NEAR(sp->fr(), 0.0, 2.0 / 255.0);
    EXPECT_NEAR(sp->fg(), 1.0, 2.0 / 255.0);
    EXPECT_NEAR(sp->fb(), 0.0, 2.0 / 255.0);
}

// ---- equals ----

TEST(SolidColorTest, EqualsTrue)
{
    SolidColor a(100, 150, 200, 255);
    SolidColor b(100, 150, 200, 255);
    EXPECT_TRUE(a.equals(b));
}

TEST(SolidColorTest, EqualsFalse)
{
    SolidColor a(100, 150, 200, 255);
    SolidColor b(100, 150, 201, 255);
    EXPECT_FALSE(a.equals(b));
}

// ---- Material ----

TEST(SolidColorTest, MaterialDefaultEmpty)
{
    SolidColor c;
    EXPECT_TRUE(c.getMaterial().isEmpty());
}

TEST(SolidColorTest, SetMaterial)
{
    SolidColor c;
    c.setMaterial("glossy");
    EXPECT_EQ(c.getMaterial(), "glossy");
}

// ---- toString ----

TEST(SolidColorTest, ToStringRGB)
{
    // Opaque pure red => #FF0000
    SolidColor c(255, 0, 0, 255);
    LString s = c.toString();
    EXPECT_EQ(s, "#FF0000");
}

TEST(SolidColorTest, ToStringRGBA)
{
    // Semi-transparent: should produce rgba(...)
    SolidColor c(255, 0, 0, 128);
    LString s = c.toString();
    EXPECT_TRUE(s.startsWith("rgba("));
}

TEST(SolidColorTest, ToStringHSB)
{
    // HSB opaque => hsb(...)
    auto sp = SolidColor::createRawHSB(0.0, 1.0, 1.0, 1.0);
    LString s = sp->toString();
    EXPECT_TRUE(s.startsWith("hsb("));
    delete sp;
}

TEST(SolidColorTest, ToStringHSBA)
{
    // HSB semi-transparent => hsba(...)
    auto sp = SolidColor::createRawHSB(0.0, 1.0, 1.0, 0.5);
    LString s = sp->toString();
    EXPECT_TRUE(s.startsWith("hsba("));
    delete sp;
}

// ---- createRGB factory ----

TEST(SolidColorTest, CreateRGB)
{
    auto sp = SolidColor::createRGB(0.0, 1.0, 0.0, 1.0);
    EXPECT_EQ(sp->r(), 0);
    EXPECT_EQ(sp->g(), 255);
    EXPECT_EQ(sp->b(), 0);
    EXPECT_EQ(sp->a(), 255);
}

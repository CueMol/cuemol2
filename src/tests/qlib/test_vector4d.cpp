#include <gtest/gtest.h>
#include <common.h>
#include "qlib/Vector4D.hpp"
#include "qlib/LExceptions.hpp"
#include <cmath>

using qlib::Vector4D;

TEST(Vector4DTest, DefaultConstructor)
{
    Vector4D v;
    EXPECT_DOUBLE_EQ(v.x(), 0.0);
    EXPECT_DOUBLE_EQ(v.y(), 0.0);
    EXPECT_DOUBLE_EQ(v.z(), 0.0);
    EXPECT_DOUBLE_EQ(v.w(), 0.0);
}

TEST(Vector4DTest, ConstructorXYZW)
{
    Vector4D v(1.0, 2.0, 3.0, 4.0);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
    EXPECT_DOUBLE_EQ(v.w(), 4.0);
}

TEST(Vector4DTest, ConstructorXYZ)
{
    Vector4D v(1.0, 2.0, 3.0);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
    EXPECT_DOUBLE_EQ(v.w(), 0.0);
}

TEST(Vector4DTest, Set3D)
{
    Vector4D v;
    v.set(1.0, 2.0, 3.0);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
}

TEST(Vector4DTest, Set4D)
{
    Vector4D v;
    v.set(1.0, 2.0, 3.0, 4.0);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
    EXPECT_DOUBLE_EQ(v.w(), 4.0);
}

TEST(Vector4DTest, Cross)
{
    // (1,0,0) x (0,1,0) = (0,0,1)
    Vector4D a(1.0, 0.0, 0.0);
    Vector4D b(0.0, 1.0, 0.0);
    Vector4D c = a.cross(b);
    EXPECT_DOUBLE_EQ(c.x(), 0.0);
    EXPECT_DOUBLE_EQ(c.y(), 0.0);
    EXPECT_DOUBLE_EQ(c.z(), 1.0);
}

TEST(Vector4DTest, IsZero3D)
{
    EXPECT_TRUE(Vector4D().isZero3D());
    EXPECT_FALSE(Vector4D(1.0, 0.0, 0.0).isZero3D());
    // w != 0 but xyz == 0 => still zero3D
    EXPECT_TRUE(Vector4D(0.0, 0.0, 0.0, 5.0).isZero3D());
}

TEST(Vector4DTest, Length)
{
    Vector4D v(3.0, 4.0, 0.0);
    EXPECT_DOUBLE_EQ(v.length(), 5.0);
}

TEST(Vector4DTest, Normalize)
{
    Vector4D v(3.0, 0.0, 0.0);
    Vector4D n = v.normalize();
    EXPECT_DOUBLE_EQ(n.x(), 1.0);
    EXPECT_DOUBLE_EQ(n.y(), 0.0);
    EXPECT_DOUBLE_EQ(n.z(), 0.0);
}

TEST(Vector4DTest, Dot)
{
    // dot includes all 4 components; use w=0 for 3D dot product
    Vector4D a(1.0, 2.0, 3.0, 0.0);
    Vector4D b(4.0, 5.0, 6.0, 0.0);
    EXPECT_DOUBLE_EQ(a.dot(b), 32.0);
}

TEST(Vector4DTest, OperatorAdd)
{
    Vector4D a(1.0, 2.0, 3.0);
    Vector4D b(4.0, 5.0, 6.0);
    Vector4D c = a + b;
    EXPECT_DOUBLE_EQ(c.x(), 5.0);
    EXPECT_DOUBLE_EQ(c.y(), 7.0);
    EXPECT_DOUBLE_EQ(c.z(), 9.0);
}

TEST(Vector4DTest, OperatorSub)
{
    Vector4D a(4.0, 5.0, 6.0);
    Vector4D b(1.0, 2.0, 3.0);
    Vector4D c = a - b;
    EXPECT_DOUBLE_EQ(c.x(), 3.0);
    EXPECT_DOUBLE_EQ(c.y(), 3.0);
    EXPECT_DOUBLE_EQ(c.z(), 3.0);
}

TEST(Vector4DTest, AngleInstance)
{
    Vector4D a(1.0, 0.0, 0.0);
    Vector4D b(0.0, 1.0, 0.0);
    EXPECT_NEAR(a.angle(b), M_PI / 2.0, 1e-10);
}

TEST(Vector4DTest, AngleStatic)
{
    Vector4D a(1.0, 0.0, 0.0);
    EXPECT_NEAR(Vector4D::angle(a, a), 0.0, 1e-10);
}

TEST(Vector4DTest, TorsionZero)
{
    // Cis configuration: atoms on same side => torsion = 0
    // i=(-1,1,0), j=(0,0,0), k=(1,0,0), l=(2,1,0)
    Vector4D i(-1.0, 1.0, 0.0);
    Vector4D j(0.0, 0.0, 0.0);
    Vector4D k(1.0, 0.0, 0.0);
    Vector4D l(2.0, 1.0, 0.0);
    EXPECT_NEAR(Vector4D::torsion(i, j, k, l), 0.0, 1e-10);
}

TEST(Vector4DTest, TorsionPi)
{
    // Trans configuration: atoms on opposite sides => torsion = pi
    // i=(-1,1,0), j=(0,0,0), k=(1,0,0), l=(2,-1,0)
    Vector4D i(-1.0, 1.0, 0.0);
    Vector4D j(0.0, 0.0, 0.0);
    Vector4D k(1.0, 0.0, 0.0);
    Vector4D l(2.0, -1.0, 0.0);
    EXPECT_NEAR(std::abs(Vector4D::torsion(i, j, k, l)), M_PI, 1e-10);
}

TEST(Vector4DTest, TorsionDegenerateThrows)
{
    // Identical consecutive points => torsion throws
    Vector4D p(0.0, 0.0, 0.0);
    Vector4D q(1.0, 0.0, 0.0);
    EXPECT_THROW(Vector4D::torsion(p, p, q, q), qlib::RuntimeException);
}

#include <gtest/gtest.h>
#include <common.h>
#include "qlib/Matrix4D.hpp"
#include "qlib/LQuat.hpp"
#include <cmath>

using qlib::Matrix4D;
using qlib::Vector4D;
using qlib::LQuat;

TEST(Matrix4D, DefaultConstructor)
{
    Matrix4D m;
    for (int i = 1; i <= 4; ++i)
        for (int j = 1; j <= 4; ++j)
            EXPECT_DOUBLE_EQ(m.getAt(i, j), (i == j) ? 1.0 : 0.0);
}

TEST(Matrix4D, ElementAccess)
{
    Matrix4D m;
    m.setAt(2, 3, 3.14);
    EXPECT_DOUBLE_EQ(m.getAt(2, 3), 3.14);
    // Other elements unchanged
    EXPECT_DOUBLE_EQ(m.getAt(1, 1), 1.0);
    EXPECT_DOUBLE_EQ(m.getAt(2, 2), 1.0);
}

TEST(Matrix4D, MatrixMultiply)
{
    // I * I = I
    Matrix4D a, b;
    Matrix4D c = a * b;
    for (int i = 1; i <= 4; ++i)
        for (int j = 1; j <= 4; ++j)
            EXPECT_NEAR(c.getAt(i, j), (i == j) ? 1.0 : 0.0, 1e-10);
}

TEST(Matrix4D, MulVec)
{
    // Identity matrix: I * v = v
    Matrix4D m;
    Vector4D v(1.0, 2.0, 3.0, 1.0);
    Vector4D r = m.mulvec(v);
    EXPECT_DOUBLE_EQ(r.x(), 1.0);
    EXPECT_DOUBLE_EQ(r.y(), 2.0);
    EXPECT_DOUBLE_EQ(r.z(), 3.0);
    EXPECT_DOUBLE_EQ(r.w(), 1.0);
}

TEST(Matrix4D, Xform3D)
{
    // Translation by (1,2,3) applied to origin
    Matrix4D m = Matrix4D::makeTransMat(Vector4D(1.0, 2.0, 3.0));
    Vector4D v(0.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
}

TEST(Matrix4D, Xform4D)
{
    // Identity xform4D leaves vector unchanged
    Matrix4D m;
    Vector4D v(1.0, 2.0, 3.0, 1.0);
    m.xform4D(v);
    EXPECT_DOUBLE_EQ(v.x(), 1.0);
    EXPECT_DOUBLE_EQ(v.y(), 2.0);
    EXPECT_DOUBLE_EQ(v.z(), 3.0);
    EXPECT_DOUBLE_EQ(v.w(), 1.0);
}

TEST(Matrix4D, MakeRotMat_Quat)
{
    // 90-degree CW rotation around Z axis (code uses transpose convention)
    // LQuat(axis, pi/4) stored as sin*axis, cos -> CW by 90 deg
    // (1,0,0) -> (0,-1,0)
    LQuat q(Vector4D(0.0, 0.0, 1.0), M_PI / 4.0);
    Matrix4D m = Matrix4D::makeRotMat(q);
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), -1.0, 1e-10);
    EXPECT_NEAR(v.z(), 0.0, 1e-10);
}

TEST(Matrix4D, MakeRotMat_AxisAngle)
{
    // 90-degree CW rotation around Z axis: (1,0,0) -> (0,-1,0)
    Matrix4D m = Matrix4D::makeRotMat(Vector4D(0.0, 0.0, 1.0), M_PI / 2.0);
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), -1.0, 1e-10);
    EXPECT_NEAR(v.z(), 0.0, 1e-10);
}

TEST(Matrix4D, MakeTransMat)
{
    Matrix4D m = Matrix4D::makeTransMat(Vector4D(5.0, 6.0, 7.0));
    EXPECT_DOUBLE_EQ(m.getAt(1, 4), 5.0);
    EXPECT_DOUBLE_EQ(m.getAt(2, 4), 6.0);
    EXPECT_DOUBLE_EQ(m.getAt(3, 4), 7.0);
    // diagonal stays 1
    EXPECT_DOUBLE_EQ(m.getAt(1, 1), 1.0);
}

TEST(Matrix4D, MakeScaleMat)
{
    Matrix4D m = Matrix4D::makeScaleMat(Vector4D(2.0, 3.0, 4.0));
    EXPECT_DOUBLE_EQ(m.getAt(1, 1), 2.0);
    EXPECT_DOUBLE_EQ(m.getAt(2, 2), 3.0);
    EXPECT_DOUBLE_EQ(m.getAt(3, 3), 4.0);
    EXPECT_DOUBLE_EQ(m.getAt(4, 4), 1.0);
}

TEST(Matrix4D, Invert)
{
    // Translation matrix inverse cancels translation
    Matrix4D m = Matrix4D::makeTransMat(Vector4D(1.0, 2.0, 3.0));
    Matrix4D mi = m.invert();
    Matrix4D prod = m * mi;
    for (int i = 1; i <= 4; ++i)
        for (int j = 1; j <= 4; ++j)
            EXPECT_NEAR(prod.getAt(i, j), (i == j) ? 1.0 : 0.0, 1e-10);
}

TEST(Matrix4D, GetSetTransPart)
{
    Matrix4D m;
    m.setTransPart(Vector4D(3.0, 4.0, 5.0));
    Vector4D t = m.getTransPart();
    EXPECT_DOUBLE_EQ(t.x(), 3.0);
    EXPECT_DOUBLE_EQ(t.y(), 4.0);
    EXPECT_DOUBLE_EQ(t.z(), 5.0);
}

TEST(Matrix4D, IsIdentAffine)
{
    Matrix4D m;
    EXPECT_TRUE(m.isIdentAffine());

    // Off-diagonal element breaks affine identity
    m.setAt(1, 2, 1.0);
    EXPECT_FALSE(m.isIdentAffine());
}

TEST(Matrix4D, Translate)
{
    Matrix4D m;
    m.translate(Vector4D(1.0, 2.0, 3.0));
    // Translation stored in column 4
    EXPECT_DOUBLE_EQ(m.getAt(1, 4), 1.0);
    EXPECT_DOUBLE_EQ(m.getAt(2, 4), 2.0);
    EXPECT_DOUBLE_EQ(m.getAt(3, 4), 3.0);
}

TEST(Matrix4D, Rotate)
{
    // 90-degree CW rotation around Z applied in-place: (1,0,0) -> (0,-1,0)
    Matrix4D m;
    LQuat q(Vector4D(0.0, 0.0, 1.0), M_PI / 4.0);
    m.rotate(q);
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), -1.0, 1e-10);
    EXPECT_NEAR(v.z(), 0.0, 1e-10);
}

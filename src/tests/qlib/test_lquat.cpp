#include <gtest/gtest.h>
#include <common.h>
#include "qlib/LQuat.hpp"
#include "qlib/Matrix3D.hpp"
#include "qlib/Utils.hpp"
#include <cmath>

using qlib::LQuat;
using qlib::Vector4D;
using qlib::Matrix4D;
using qlib::Matrix3D;

TEST(LQuat, DefaultConstructor)
{
    LQuat q;
    EXPECT_DOUBLE_EQ(q.Vx(), 0.0);
    EXPECT_DOUBLE_EQ(q.Vy(), 0.0);
    EXPECT_DOUBLE_EQ(q.Vz(), 0.0);
    EXPECT_DOUBLE_EQ(q.a(), 0.0);
}

TEST(LQuat, AxisAngleConstructor)
{
    // 90-degree rotation around Z: phi = pi/4 (half angle)
    Vector4D axis(0.0, 0.0, 1.0);
    LQuat q(axis, M_PI / 4.0);
    EXPECT_NEAR(q.Vx(), 0.0, 1e-10);
    EXPECT_NEAR(q.Vy(), 0.0, 1e-10);
    EXPECT_NEAR(q.Vz(), std::sin(M_PI / 4.0), 1e-10);
    EXPECT_NEAR(q.a(), std::cos(M_PI / 4.0), 1e-10);
}

TEST(LQuat, ComponentConstructor)
{
    // LQuat(a, x, y, z)
    LQuat q(1.0, 0.5, 0.0, 0.0);
    EXPECT_DOUBLE_EQ(q.a(), 1.0);
    EXPECT_DOUBLE_EQ(q.Vx(), 0.5);
    EXPECT_DOUBLE_EQ(q.Vy(), 0.0);
    EXPECT_DOUBLE_EQ(q.Vz(), 0.0);
}

TEST(LQuat, Sqlen)
{
    // Identity-like quaternion (a=1, x=y=z=0): sqlen = 1
    LQuat q(1.0, 0.0, 0.0, 0.0);
    EXPECT_DOUBLE_EQ(q.sqlen(), 1.0);

    // (a=0, x=3, y=4, z=0): sqlen = 25
    LQuat q2(0.0, 3.0, 4.0, 0.0);
    EXPECT_DOUBLE_EQ(q2.sqlen(), 25.0);
}

TEST(LQuat, Normalize)
{
    LQuat q(0.0, 3.0, 4.0, 0.0);
    LQuat n = q.normalize();
    EXPECT_NEAR(n.sqlen(), 1.0, 1e-10);
    EXPECT_NEAR(n.Vx(), 0.6, 1e-10);
    EXPECT_NEAR(n.Vy(), 0.8, 1e-10);
}

TEST(LQuat, Scale)
{
    LQuat q(1.0, 0.0, 0.0, 0.0);
    LQuat s = q.scale(2.0);
    EXPECT_DOUBLE_EQ(s.a(), 2.0);
    EXPECT_DOUBLE_EQ(s.Vx(), 0.0);
}

TEST(LQuat, Divide)
{
    LQuat q(2.0, 4.0, 0.0, 0.0);
    LQuat d = q.divide(2.0);
    EXPECT_DOUBLE_EQ(d.a(), 1.0);
    EXPECT_DOUBLE_EQ(d.Vx(), 2.0);
}

TEST(LQuat, Conj)
{
    LQuat q(1.0, 2.0, 3.0, 4.0);
    LQuat c = q.conj();
    EXPECT_DOUBLE_EQ(c.a(), 1.0);
    EXPECT_DOUBLE_EQ(c.Vx(), -2.0);
    EXPECT_DOUBLE_EQ(c.Vy(), -3.0);
    EXPECT_DOUBLE_EQ(c.Vz(), -4.0);
}

TEST(LQuat, Inv)
{
    // For unit quaternion, inv == conj
    Vector4D axis(0.0, 0.0, 1.0);
    LQuat q(axis, M_PI / 4.0);
    LQuat qi = q.inv();
    // q * q.inv() should approach identity (a=1, Vxyz=0)
    LQuat prod = q.mul(qi);
    EXPECT_NEAR(prod.a(), 1.0, 1e-10);
    EXPECT_NEAR(prod.Vx(), 0.0, 1e-10);
    EXPECT_NEAR(prod.Vy(), 0.0, 1e-10);
    EXPECT_NEAR(prod.Vz(), 0.0, 1e-10);
}

TEST(LQuat, Mul)
{
    // Two 90-degree rotations around Z = 180-degree rotation
    Vector4D axis(0.0, 0.0, 1.0);
    LQuat q90(axis, M_PI / 4.0);
    LQuat q180 = q90.mul(q90);
    Matrix4D m = q180.toRotMatrix();
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), -1.0, 1e-10);
    EXPECT_NEAR(v.y(), 0.0, 1e-10);
    EXPECT_NEAR(v.z(), 0.0, 1e-10);
}

TEST(LQuat, RotateX)
{
    // Code uses CW rotation convention (transpose of standard).
    // 90-degree CW around X: (0,1,0) -> (0,0,-1)
    LQuat q(1.0, 0.0, 0.0, 0.0); // identity (a=1)
    LQuat qr = q.rotateX(90.0);
    Matrix4D m = qr.toRotMatrix();
    Vector4D v(0.0, 1.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), 0.0, 1e-10);
    EXPECT_NEAR(v.z(), -1.0, 1e-10);
}

TEST(LQuat, RotateY)
{
    // 90-degree CW around Y: (1,0,0) -> (0,0,1)
    LQuat q(1.0, 0.0, 0.0, 0.0);
    LQuat qr = q.rotateY(90.0);
    Matrix4D m = qr.toRotMatrix();
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), 0.0, 1e-10);
    EXPECT_NEAR(v.z(), 1.0, 1e-10);
}

TEST(LQuat, RotateZ)
{
    // 90-degree CW around Z: (1,0,0) -> (0,-1,0)
    LQuat q(1.0, 0.0, 0.0, 0.0);
    LQuat qr = q.rotateZ(90.0);
    Matrix4D m = qr.toRotMatrix();
    Vector4D v(1.0, 0.0, 0.0);
    m.xform3D(v);
    EXPECT_NEAR(v.x(), 0.0, 1e-10);
    EXPECT_NEAR(v.y(), -1.0, 1e-10);
    EXPECT_NEAR(v.z(), 0.0, 1e-10);
}

TEST(LQuat, ToRotMatrix)
{
    // Identity quaternion (a=1, xyz=0) -> identity rotation matrix
    LQuat q(1.0, 0.0, 0.0, 0.0);
    Matrix4D m = q.toRotMatrix();
    for (int i = 1; i <= 3; ++i)
        for (int j = 1; j <= 3; ++j)
            EXPECT_NEAR(m.getAt(i, j), (i == j) ? 1.0 : 0.0, 1e-10);
}

TEST(LQuat, MakeFromRotMat)
{
    // Identity 3x3 matrix -> quaternion with a~=1 (or -1), Vxyz~=0
    Matrix3D mat;
    LQuat q = LQuat::makeFromRotMat(mat);
    // normalize and check: should represent zero rotation
    EXPECT_NEAR(q.sqlen(), 1.0, 1e-10);
}

TEST(LQuat, Slerp)
{
    // slerp(q, q, t) = q for any t
    Vector4D axis(0.0, 0.0, 1.0);
    LQuat q(axis, M_PI / 4.0);
    LQuat r = LQuat::slerp(q, q, 0.5);
    EXPECT_NEAR(r.a(), q.a(), 1e-10);
    EXPECT_NEAR(r.Vx(), q.Vx(), 1e-10);
    EXPECT_NEAR(r.Vy(), q.Vy(), 1e-10);
    EXPECT_NEAR(r.Vz(), q.Vz(), 1e-10);
}

TEST(LQuat, SlerpInterpolates)
{
    // slerp at t=0 gives q, t=1 gives r (for non-antipodal quats)
    Vector4D axis(0.0, 0.0, 1.0);
    LQuat q(axis, 0.0);      // zero rotation: (0,0,0,1)
    LQuat r(axis, M_PI / 4.0); // 90-degree rotation
    LQuat mid = LQuat::slerp(q, r, 1.0);
    EXPECT_NEAR(mid.a(), r.a(), 1e-10);
    EXPECT_NEAR(mid.Vz(), r.Vz(), 1e-10);
}

TEST(LQuat, FromEuler)
{
    // Zero euler angles -> identity-like quaternion
    LQuat q = LQuat::makeFromEuler(0.0, 0.0, 0.0);
    EXPECT_NEAR(q.a(), 1.0, 1e-10);
    EXPECT_NEAR(q.Vx(), 0.0, 1e-10);
    EXPECT_NEAR(q.Vy(), 0.0, 1e-10);
    EXPECT_NEAR(q.Vz(), 0.0, 1e-10);
}

TEST(LQuat, ToEuler)
{
    // Identity quaternion -> zero euler angles
    LQuat q(1.0, 0.0, 0.0, 0.0);
    double roll, pitch, yaw;
    q.toEuler(roll, pitch, yaw);
    EXPECT_NEAR(roll, 0.0, 1e-10);
    EXPECT_NEAR(pitch, 0.0, 1e-10);
    EXPECT_NEAR(yaw, 0.0, 1e-10);
}

// CrystalInfo: the per-parameter setters must drop the cached matrices,
// and degenerate angles must not produce NaN.
#include <gtest/gtest.h>
#include <common.h>
#include <cmath>
#include "symm/CrystalInfo.hpp"

using symm::CrystalInfo;

TEST(CrystalInfoSetters, SetAInvalidatesCachedMatrices)
{
    CrystalInfo ci;
    ci.setCellDimension(10.0, 20.0, 30.0, 90.0, 90.0, 90.0);
    EXPECT_NEAR(ci.getOrthMat().aij(1, 1), 10.0, 1e-9);
    EXPECT_NEAR(ci.getFracMat().aij(1, 1), 1.0 / 10.0, 1e-12);

    ci.setA(50.0);
    EXPECT_NEAR(ci.getOrthMat().aij(1, 1), 50.0, 1e-9);
    EXPECT_NEAR(ci.getFracMat().aij(1, 1), 1.0 / 50.0, 1e-12);

    ci.setGamma(60.0);
    EXPECT_NEAR(ci.getOrthMat().aij(1, 2), 20.0 * std::cos(M_PI / 3.0), 1e-9);
}

TEST(CrystalInfoSetters, DegenerateAnglesStayFinite)
{
    CrystalInfo ci;
    ci.setCellDimension(10.0, 10.0, 10.0, 90.0, 180.0, 90.0);
    const qlib::Matrix3D &m = ci.getOrthMat();
    for (int i = 1; i <= 3; ++i)
        for (int j = 1; j <= 3; ++j)
            EXPECT_TRUE(std::isfinite(m.aij(i, j))) << "aij(" << i << "," << j << ")";
}

#include <gtest/gtest.h>
#include <common.h>
#include "molvis/smospl/SmoothSpline.hpp"

using molvis::SmoothSpline1D;

TEST(SmoothSpline1D, TwoPointsCannotBeInterpolated)
{
    // A helix truncated to two residues gives a two-point width spline.
    // generate() rejects it, and interpolate() must then fail instead of
    // reading the empty coefficient tables.
    SmoothSpline1D spl;
    spl.setSize(2);
    spl.setValue(0, 1.0);
    spl.setValue(1, 2.0);
    EXPECT_FALSE(spl.generate());
    EXPECT_EQ(spl.getPoints(), 2);

    double v = -1.0, dv = -1.0;
    EXPECT_FALSE(spl.interpolate(0.5, &v, &dv));
    EXPECT_DOUBLE_EQ(v, -1.0);
    EXPECT_DOUBLE_EQ(dv, -1.0);
}

TEST(SmoothSpline1D, InterpolateBeforeGenerateFails)
{
    SmoothSpline1D spl;
    EXPECT_EQ(spl.getPoints(), 0);
    double v = 0.0;
    EXPECT_FALSE(spl.interpolate(0.0, &v));
}

TEST(SmoothSpline1D, ThreePointsInterpolateThroughKnots)
{
    SmoothSpline1D spl;
    spl.setRho(3.0);
    spl.setSize(3);
    spl.setValue(0, 1.0);
    spl.setValue(1, 2.0);
    spl.setValue(2, 3.0);
    ASSERT_TRUE(spl.generate());

    double v = 0.0;
    ASSERT_TRUE(spl.interpolate(0.0, &v));
    EXPECT_NEAR(v, 1.0, 1e-6);
    ASSERT_TRUE(spl.interpolate(1.0, &v));
    EXPECT_NEAR(v, 2.0, 1e-6);
}

TEST(SmoothSpline1D, RegenerateWithTooFewPointsDropsOldCoefficients)
{
    SmoothSpline1D spl;
    spl.setSize(3);
    spl.setValue(0, 1.0);
    spl.setValue(1, 2.0);
    spl.setValue(2, 3.0);
    ASSERT_TRUE(spl.generate());

    spl.setSize(2);
    EXPECT_FALSE(spl.generate());
    double v = -1.0;
    EXPECT_FALSE(spl.interpolate(0.5, &v));
}

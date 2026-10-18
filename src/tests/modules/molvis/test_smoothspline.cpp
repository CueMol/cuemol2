#include <gtest/gtest.h>
#include <common.h>
#include "molvis/smospl/SmoothSpline.hpp"

#include <algorithm>
#include <cmath>

using molvis::SmoothSpline1D;
using molvis::SmoothSpline;
using qlib::Vector4D;

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

namespace {

  // Helix-like trace with an irregular perturbation (residue spacing ~3.8A)
  Vector4D tracePoint(int i)
  {
    const double th = i*1.75;
    return Vector4D(2.3*std::cos(th) + 0.4*std::sin(3.1*i),
                    2.3*std::sin(th) - 0.3*std::cos(1.7*i),
                    1.5*i + 0.2*std::sin(2.3*i));
  }

}

// generate() solves the penalized fit by the Reinsch algorithm instead of
// alglib's dense normal equations. The curve (and the derivatives the
// renderers read) must match the alglib fit, including the lambda
// normalization by rho, the weights and the linear extensions at both ends.
TEST(SmoothSpline, ReinschMatchesAlglibFit)
{
  const int nstart = 5;
  for (int n : {4, 15, 40}) {
    for (bool bwgt : {false, true}) {
      for (double rho : {-10.0, -1.0, 2.0, 3.0}) {
        SmoothSpline ref, spl;
        for (SmoothSpline *p : {&ref, &spl}) {
          p->setRho(rho);
          p->setUseWeight(bwgt);
          p->setStartId(nstart);
          p->setSize(n);
          for (int i=0; i<n; ++i) {
            Vector4D v = tracePoint(i);
            // anchor weights at both ends, as the coil junctions use
            v.w() = (i==0 || i==n-1) ? 10.0 : 1.0;
            p->setPoint(i+nstart, v);
          }
        }
        ASSERT_TRUE(ref.generateAlglib());
        ASSERT_TRUE(spl.generate());

        double dmax = 0.0;
        for (double t = nstart-0.5; t <= nstart+n-0.5; t += 0.05) {
          Vector4D r0, r1, r2, s0, s1, s2;
          ref.interpolate(t, &r0, &r1, &r2);
          spl.interpolate(t, &s0, &s1, &s2);
          dmax = std::max({dmax, (r0-s0).length(), (r1-s1).length(),
                           (r2-s2).length()});
        }
        EXPECT_LT(dmax, 1e-6) << "n=" << n << " wgt=" << bwgt << " rho=" << rho;
      }
    }
  }
}

TEST(SmoothSpline1D, ReinschMatchesAlglibFit)
{
  const int n = 12;
  SmoothSpline1D ref, spl;
  for (SmoothSpline1D *p : {&ref, &spl}) {
    p->setRho(1.0);
    p->setSize(n);
    for (int i=0; i<n; ++i)
      p->setValue(i, tracePoint(i).x());
  }
  ASSERT_TRUE(ref.generateAlglib());
  ASSERT_TRUE(spl.generate());

  for (double t = -0.5; t <= n-0.5; t += 0.05) {
    double r0, r1, s0, s1;
    ASSERT_TRUE(ref.interpolate(t, &r0, &r1));
    ASSERT_TRUE(spl.interpolate(t, &s0, &s1));
    EXPECT_NEAR(r0, s0, 1e-6);
    EXPECT_NEAR(r1, s1, 1e-6);
  }
}

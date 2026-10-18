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

// generate() solves the long segments by the Reinsch algorithm (O(n)). The
// curve (and the derivatives the renderers read) must match the dense
// penalized fit, including the lambda normalization by rho, the weights and
// the linear extensions at both ends.
TEST(SmoothSpline, ReinschMatchesDenseFit)
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
        ASSERT_TRUE(ref.generateDense());
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

TEST(SmoothSpline1D, ReinschMatchesDenseFit)
{
  const int n = 12;
  SmoothSpline1D ref, spl;
  for (SmoothSpline1D *p : {&ref, &spl}) {
    p->setRho(1.0);
    p->setSize(n);
    for (int i=0; i<n; ++i)
      p->setValue(i, tracePoint(i).x());
  }
  ASSERT_TRUE(ref.generateDense());
  ASSERT_TRUE(spl.generate());

  for (double t = -0.5; t <= n-0.5; t += 0.05) {
    double r0, r1, s0, s1;
    ASSERT_TRUE(ref.interpolate(t, &r0, &r1));
    ASSERT_TRUE(spl.interpolate(t, &s0, &s1));
    EXPECT_NEAR(r0, s0, 1e-6);
    EXPECT_NEAR(r1, s1, 1e-6);
  }
}

// Short segments use more basis knots than points (the dense fit). Values
// pinned from the ALGLIB spline1dfitpenalizedw() fit the dense fit replaced:
// a coil of three points with anchor weights at both ends (rho = -1).
TEST(SmoothSpline, ShortSegmentKeepsAlglibFit)
{
  SmoothSpline spl;
  spl.setRho(-1.0);
  spl.setUseWeight(true);
  spl.setStartId(3);
  spl.setSize(3);
  for (int i=0; i<3; ++i) {
    Vector4D v = tracePoint(i);
    v.w() = (i==1) ? 1.0 : 10.0;
    spl.setPoint(i+3, v);
  }
  ASSERT_TRUE(spl.generate());

  // t, position, first derivative
  static const double pin[][7] = {
    {2.5, 3.541691643962, -0.968385135221, -0.766571533894, -2.486315486859, 1.354438162091, 1.534763113180},
    {3, 2.298533900532, -0.291166054175, 0.000810022696, -2.486315486859, 1.354438162091, 1.534763113180},
    {3.5, 1.066756114098, 0.317483379447, 0.761904131776, -2.418035744884, 0.943020277547, 1.497038428121},
    {4.25, -0.649619580211, 0.439366967930, 1.831006780607, -2.152503414981, -0.656938162349, 1.350331319558},
    {5, -2.188552241364, -0.507928020087, 2.802071821969, -2.000770655037, -1.571200128004, 1.266498686093},
    {5.5, -3.188937568882, -1.293528084089, 3.435321165016, -2.000770655037, -1.571200128004, 1.266498686093},
  };
  for (const auto &p : pin) {
    Vector4D v, dv;
    ASSERT_TRUE(spl.interpolate(p[0], &v, &dv));
    EXPECT_NEAR(v.x(), p[1], 1e-8);
    EXPECT_NEAR(v.y(), p[2], 1e-8);
    EXPECT_NEAR(v.z(), p[3], 1e-8);
    EXPECT_NEAR(dv.x(), p[4], 1e-8);
    EXPECT_NEAR(dv.y(), p[5], 1e-8);
    EXPECT_NEAR(dv.z(), p[6], 1e-8);
  }
}

// The same for a short helix width spline (five points, rho = 1).
TEST(SmoothSpline1D, ShortSegmentKeepsAlglibFit)
{
  SmoothSpline1D spl;
  spl.setRho(1.0);
  spl.setSize(5);
  for (int i=0; i<5; ++i)
    spl.setValue(i, tracePoint(i).x());
  ASSERT_TRUE(spl.generate());

  static const double pin[][3] = {
    {-0.5, 3.702158856348, -2.974275797931},
    {0, 2.215020957383, -2.974275797931},
    {1.5, -1.420572379436, -1.151769889504},
    {2.25, -1.154731598805, 1.875166140477},
    {4, 1.827008713507, 0.789470004353},
    {4.5, 2.221743715683, 0.789470004353},
  };
  for (const auto &p : pin) {
    double v, dv;
    ASSERT_TRUE(spl.interpolate(p[0], &v, &dv));
    EXPECT_NEAR(v, p[1], 1e-8);
    EXPECT_NEAR(dv, p[2], 1e-8);
  }
}

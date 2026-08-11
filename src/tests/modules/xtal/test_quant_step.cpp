// -*-Mode: C++;-*-
//
// Tests for ScalarObject::getQuantStep().
//
// DensityMap stores its samples 8-bit quantized, so its histogram can
// only resolve (max-min)/256 -- getQuantStep() must report that lattice
// spacing. ElePotMap stores floats: its getLevelStep() is merely the
// atByte() conversion scale, so getQuantStep() must stay 0 there.
// Histogram clients use this to clamp their display bin width; getting
// it wrong either brings back the empty-comb artifact (DensityMap) or
// needlessly coarsens float maps (ElePotMap).
//

#include <gtest/gtest.h>
#include <common.h>
#include <qlib/Vector4D.hpp>
#include <vector>
#include "surface/ElePotMap.hpp"
#include "xtal/DensityMap.hpp"

namespace {

std::vector<float> rampData()
{
    // 4x4x4 ramp covering [0, 63]
    std::vector<float> data(64);
    for (int i = 0; i < 64; ++i) data[i] = float(i);
    return data;
}

}  // namespace

TEST(QuantStepTest, DensityMapReportsByteLatticeSpacing)
{
    const std::vector<float> data = rampData();
    xtal::DensityMap map;
    map.setMapFloatArray(data.data(), 4, 4, 4, 0, 1, 2);

    EXPECT_DOUBLE_EQ(map.getQuantStep(), 63.0 / 256.0);
    EXPECT_DOUBLE_EQ(map.getQuantStep(), map.getLevelStep());
}

TEST(QuantStepTest, ElePotMapIsNotQuantized)
{
    const std::vector<float> data = rampData();
    surface::ElePotMap map;
    map.setMapFloatArray(data.data(), 4, 4, 4, 1.0,
                         qlib::Vector4D(0, 0, 0));

    // The byte-conversion scale exists, but the stored data is float.
    EXPECT_GT(map.getLevelStep(), 0.0);
    EXPECT_DOUBLE_EQ(map.getQuantStep(), 0.0);
}

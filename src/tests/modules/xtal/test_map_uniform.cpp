// A uniform map (min == max, sigma == 0) must quantize and report a
// histogram without dividing by zero.
#include <gtest/gtest.h>
#include <common.h>
#include <string>
#include <vector>
#include "xtal/DensityMap.hpp"
#include <qsys/Object.hpp>

using xtal::DensityMap;

TEST(UniformMap, QuantizationAndHistogramStayFinite)
{
    DensityMap *pMap = MB_NEW DensityMap();
    qsys::ObjectPtr pObj(pMap);

    const int nc = 4, nr = 4, ns = 4;
    std::vector<float> data(size_t(nc) * nr * ns, 1.5f);
    pMap->setMapFloatArray(data.data(), nc, nr, ns, 0, 1, 2);

    EXPECT_NEAR(pMap->getMinDensity(), 1.5, 1e-6);
    EXPECT_NEAR(pMap->getMaxDensity(), 1.5, 1e-6);
    EXPECT_NEAR(pMap->getRmsdDensity(), 0.0, 1e-6);

    // (rho - base) / step with step 0 gave NaN -> undefined byte value
    EXPECT_NEAR(pMap->atFloat(1, 1, 1), 1.5, 1e-6);

    const std::string js = pMap->getHistogramJSON(pMap->getMinDensity(),
                                                  pMap->getMaxDensity(), 10).c_str();
    EXPECT_EQ(js.find("nan"), std::string::npos) << js;
    EXPECT_EQ(js.find("inf"), std::string::npos) << js;
}

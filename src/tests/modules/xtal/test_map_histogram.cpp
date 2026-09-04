// -*-Mode: C++;-*-
//
// Tests for the DensityMap histogram: the 256-bin byte histogram is a
// lossless base histogram, getHistogramJSON() must agree with a direct
// rebinning of the samples, the cache must be dropped on reload, and
// getLevelAtTopFraction() must follow the histogram definition.
//

#include <gtest/gtest.h>
#include <common.h>
#include <cmath>
#include <cstdlib>
#include <string>
#include <vector>
#include "xtal/DensityMap.hpp"

using xtal::DensityMap;

namespace {

/// Parse the "histo":[...] array of getHistogramJSON()
std::vector<double> parseHisto(const std::string &json)
{
    std::vector<double> out;
    const size_t p = json.find("\"histo\":[");
    if (p == std::string::npos)
        return out;
    size_t i = p + 9;
    while (i < json.size() && json[i] != ']') {
        char *end = NULL;
        const double v = std::strtod(json.c_str() + i, &end);
        out.push_back(v);
        i = size_t(end - json.c_str());
        if (json[i] == ',')
            ++i;
    }
    return out;
}

/// Direct rebinning of the quantized samples into nbins over [min, max),
/// spreading each sample's quantization interval like the base
/// histogram rebinning does
std::vector<double> directHisto(const DensityMap &m, double min, double max, int nbins)
{
    std::vector<double> h(nbins, 0.0);
    const double w = (max - min) / nbins;
    const double base = m.getLevelBase();
    const double step = m.getLevelStep();
    for (int k = 0; k < m.getSecNo(); ++k)
        for (int j = 0; j < m.getRowNo(); ++j)
            for (int i = 0; i < m.getColNo(); ++i) {
                const int b = m.atByte(i, j, k);
                const double xlo = base + b * step;
                const double xhi = xlo + step;
                // overlap of [xlo, xhi) with every new bin
                for (int n = 0; n < nbins; ++n) {
                    const double blo = min + n * w;
                    const double bhi = blo + w;
                    const double ov = std::min(xhi, bhi) - std::max(xlo, blo);
                    if (ov > 0.0)
                        h[n] += ov / step;
                }
            }
    return h;
}

DensityMap *makeMap(int n, float scale)
{
    DensityMap *pMap = MB_NEW DensityMap();
    std::vector<float> data((size_t)n * n * n);
    for (size_t i = 0; i < data.size(); ++i)
        data[i] = scale * float((i * 37) % 101) - 10.0f;
    pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
    pMap->setMapParams(0, 0, 0, n, n, n);
    pMap->setXtalParams(double(n), double(n), double(n), 90.0, 90.0, 90.0);
    return pMap;
}

}  // namespace

TEST(MapHistogram, JsonMatchesDirectRebinning)
{
    qsys::ObjectPtr pObj(makeMap(12, 0.5f));
    DensityMap *pMap = static_cast<DensityMap *>(pObj.get());

    const double vmin = pMap->getMinDensity();
    const double vmax = pMap->getMaxDensity();
    const int nbins = 20;
    const std::vector<double> got =
        parseHisto(std::string(pMap->getHistogramJSON(vmin, vmax, nbins).c_str()));
    const std::vector<double> want = directHisto(*pMap, vmin, vmax, nbins);

    ASSERT_EQ(got.size(), size_t(nbins));
    double total = 0.0;
    for (int i = 0; i < nbins; ++i) {
        EXPECT_NEAR(got[i], want[i], 1e-3) << "bin " << i;
        total += got[i];
    }
    // the samples at the top quantization level spill past max; the rest
    // of the mass is accounted for
    EXPECT_GT(total, 0.9 * 12 * 12 * 12);
}

TEST(MapHistogram, ReloadDropsCache)
{
    qsys::ObjectPtr pObj(makeMap(8, 0.5f));
    DensityMap *pMap = static_cast<DensityMap *>(pObj.get());
    const std::string j1(pMap->getHistogramJSON(-10.0, 40.0, 10).c_str());

    // replace the samples with a constant field: the histogram must not
    // be the stale one
    std::vector<float> flat((size_t)8 * 8 * 8, 3.0f);
    flat[0] = 4.0f;
    pMap->setMapFloatArray(flat.data(), 8, 8, 8, 0, 1, 2);
    const std::string j2(pMap->getHistogramJSON(-10.0, 40.0, 10).c_str());
    EXPECT_NE(j1, j2);
    const std::vector<double> h2 = parseHisto(j2);
    ASSERT_EQ(h2.size(), size_t(10));
    // everything sits in the bin of value 3..4 (bin index 2 of [-10,40)/10)
    EXPECT_NEAR(h2[2], 512.0, 1e-6);
}

TEST(MapHistogram, LevelAtTopFraction)
{
    qsys::ObjectPtr pObj(makeMap(10, 0.5f));
    DensityMap *pMap = static_cast<DensityMap *>(pObj.get());

    const double lv = pMap->getLevelAtTopFraction(0.01);
    // count the samples at or above the level directly
    size_t nabove = 0, ntotal = 0;
    for (int k = 0; k < 10; ++k)
        for (int j = 0; j < 10; ++j)
            for (int i = 0; i < 10; ++i) {
                ++ntotal;
                if (pMap->atFloat(i, j, k) >= lv - 1e-9)
                    ++nabove;
            }
    EXPECT_GE(nabove, size_t(std::ceil(0.01 * ntotal)));
    // one quantization step higher encloses fewer than the fraction
    size_t nabove2 = 0;
    for (int k = 0; k < 10; ++k)
        for (int j = 0; j < 10; ++j)
            for (int i = 0; i < 10; ++i)
                if (pMap->atFloat(i, j, k) >= lv + pMap->getLevelStep() - 1e-9)
                    ++nabove2;
    EXPECT_LT(nabove2, size_t(std::ceil(0.01 * ntotal)));

    EXPECT_NEAR(pMap->getLevelAtTopFraction(0.0), pMap->getMaxDensity(), 1e-9);
    EXPECT_NEAR(pMap->getLevelAtTopFraction(1.0), pMap->getMinDensity(), 1e-9);
}

// getTopFractionAtLevel() is the inverse at bin resolution: a level produced
// by getLevelAtTopFraction() maps back to a fraction that reproduces the
// same level, and out-of-range levels clamp to 0 / 1.
TEST(MapHistogram, TopFractionAtLevel)
{
    qsys::ObjectPtr pObj(makeMap(10, 0.5f));
    DensityMap *pMap = static_cast<DensityMap *>(pObj.get());

    const double lv = pMap->getLevelAtTopFraction(0.01);
    const double frac = pMap->getTopFractionAtLevel(lv);
    EXPECT_GE(frac, 0.01);
    EXPECT_NEAR(pMap->getLevelAtTopFraction(frac), lv, 1e-9);

    // the fraction is the direct count of samples at or above the level
    size_t nabove = 0, ntotal = 0;
    for (int k = 0; k < 10; ++k)
        for (int j = 0; j < 10; ++j)
            for (int i = 0; i < 10; ++i) {
                ++ntotal;
                if (pMap->atFloat(i, j, k) >= lv - 1e-9)
                    ++nabove;
            }
    EXPECT_NEAR(frac, double(nabove) / double(ntotal), 1e-12);

    EXPECT_NEAR(pMap->getTopFractionAtLevel(pMap->getMaxDensity() + 1.0), 0.0, 1e-12);
    EXPECT_NEAR(pMap->getTopFractionAtLevel(pMap->getMinDensity() - 1.0), 1.0, 1e-12);
}

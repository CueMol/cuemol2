// -*-Mode: C++;-*-
//
// Tests for the strided sub-block extraction of ScalarObject / DensityMap:
// the fast row-wise DensityMap implementation must agree with a direct
// atFloat / atByte walk (which is also the ScalarObject default) for
// periodic wrap and clipped-with-fill boundaries, any stride, and blocks
// that start before or run past the map.
//

#include <gtest/gtest.h>
#include <common.h>
#include <vector>
#include "xtal/DensityMap.hpp"

using qsys::ScalarObject;
using xtal::DensityMap;

namespace {

DensityMap *makeMap(qsys::ObjectPtr &rpObj, int nc, int nr, int ns)
{
    std::vector<float> data(size_t(nc) * nr * ns);
    for (int k = 0; k < ns; ++k)
        for (int j = 0; j < nr; ++j)
            for (int i = 0; i < nc; ++i)
                data[size_t(i) + (size_t(j) + size_t(k) * nr) * nc] =
                    float((i * 5 + j * 11 + k * 17) % 41) - 20.0f;
    DensityMap *pMap = MB_NEW DensityMap();
    rpObj = qsys::ObjectPtr(pMap);
    pMap->setMapFloatArray(data.data(), nc, nr, ns, 0, 1, 2);
    pMap->setMapParams(0, 0, 0, nc, nr, ns);
    pMap->setXtalParams(double(nc), double(nr), double(ns), 90.0, 90.0, 90.0);
    return pMap;
}

inline int wrap(int x, int n)
{
    const int r = x % n;
    return (r < 0) ? r + n : r;
}

/// Direct reference walk
void reference(const DensityMap &m, const ScalarObject::MapBlockSpec &sp, bool pbc,
               float fill, std::vector<float> &fout, std::vector<unsigned char> &bout)
{
    const int nc = m.getColNo(), nr = m.getRowNo(), ns = m.getSecNo();
    fout.assign(size_t(sp.size[0]) * sp.size[1] * sp.size[2], 0.0f);
    bout.assign(fout.size(), 0);
    size_t o = 0;
    for (int ko = 0; ko < sp.size[2]; ++ko)
        for (int jo = 0; jo < sp.size[1]; ++jo)
            for (int io = 0; io < sp.size[0]; ++io, ++o) {
                const int i = sp.start[0] + io * sp.step;
                const int j = sp.start[1] + jo * sp.step;
                const int k = sp.start[2] + ko * sp.step;
                if (pbc) {
                    fout[o] = float(m.atFloat(wrap(i, nc), wrap(j, nr), wrap(k, ns)));
                    bout[o] = m.atByte(wrap(i, nc), wrap(j, nr), wrap(k, ns));
                }
                else if (m.isInBoundary(i, j, k)) {
                    fout[o] = float(m.atFloat(i, j, k));
                    bout[o] = m.atByte(i, j, k);
                }
                else {
                    fout[o] = fill;
                    bout[o] = 0;
                }
            }
}

void check(const DensityMap &m, const ScalarObject::MapBlockSpec &sp, bool pbc)
{
    std::vector<float> fref, fgot;
    std::vector<unsigned char> bref, bgot;
    reference(m, sp, pbc, -99.0f, fref, bref);
    fgot.assign(fref.size(), 0.0f);
    bgot.assign(bref.size(), 7);
    m.extractBlock(sp, pbc, -99.0f, fgot.data());
    m.extractBlockBytes(sp, pbc, 0, bgot.data());
    for (size_t o = 0; o < fref.size(); ++o) {
        ASSERT_EQ(fgot[o], fref[o]) << "float at " << o;
        ASSERT_EQ(bgot[o], bref[o]) << "byte at " << o;
    }
}

ScalarObject::MapBlockSpec spec(int s0, int s1, int s2, int n0, int n1, int n2, int step)
{
    ScalarObject::MapBlockSpec sp;
    sp.start[0] = s0; sp.start[1] = s1; sp.start[2] = s2;
    sp.size[0] = n0; sp.size[1] = n1; sp.size[2] = n2;
    sp.step = step;
    return sp;
}

}  // namespace

TEST(MapBlockExtract, InsideBlockAtEveryStride)
{
    qsys::ObjectPtr pObj;
    DensityMap *pMap = makeMap(pObj, 13, 9, 7);
    for (int step = 1; step <= 3; ++step) {
        check(*pMap, spec(1, 2, 0, 4, 3, 3, step), false);
        check(*pMap, spec(0, 0, 0, 13 / step, 9 / step, 7 / step, step), false);
    }
}

// Blocks that start before the map or run past it are filled outside.
TEST(MapBlockExtract, ClippedWithFill)
{
    qsys::ObjectPtr pObj;
    DensityMap *pMap = makeMap(pObj, 13, 9, 7);
    check(*pMap, spec(-2, -1, -3, 8, 6, 6, 1), false);
    check(*pMap, spec(9, 6, 4, 6, 5, 5, 1), false);
    check(*pMap, spec(-3, -3, -3, 9, 6, 5, 2), false);
    // entirely outside
    check(*pMap, spec(40, 40, 40, 3, 3, 3, 1), false);
}

// Periodic wrap by the map dimensions, including negative indices and
// strides that skip over the wrap point.
TEST(MapBlockExtract, PeriodicWrap)
{
    qsys::ObjectPtr pObj;
    DensityMap *pMap = makeMap(pObj, 13, 9, 7);
    check(*pMap, spec(-9, -5, -4, 30, 20, 16, 1), true);
    check(*pMap, spec(-9, -5, -4, 15, 10, 8, 2), true);
    check(*pMap, spec(10, 7, 5, 6, 6, 6, 3), true);
}

// The ScalarObject default (atFloat walk) and the DensityMap override
// agree; exercised through a plain-default subclass.
namespace {
class DefaultExtractMap : public DensityMap {
public:
    void extractBlock(const MapBlockSpec &spec, bool pbc, float fill,
                      float *out) const override
    {
        qsys::ScalarObject::extractBlock(spec, pbc, fill, out);
    }
    void extractBlockBytes(const MapBlockSpec &spec, bool pbc, unsigned char fill,
                           unsigned char *out) const override
    {
        qsys::ScalarObject::extractBlockBytes(spec, pbc, fill, out);
    }
};
}  // namespace

TEST(MapBlockExtract, DefaultImplementationAgrees)
{
    DefaultExtractMap *pMap = MB_NEW DefaultExtractMap();
    qsys::ObjectPtr pObj(pMap);
    std::vector<float> data(size_t(6) * 5 * 4);
    for (size_t i = 0; i < data.size(); ++i)
        data[i] = float(i % 13) - 6.0f;
    pMap->setMapFloatArray(data.data(), 6, 5, 4, 0, 1, 2);
    check(*pMap, spec(-2, -2, -2, 8, 7, 6, 1), false);
    check(*pMap, spec(-2, -2, -2, 8, 7, 6, 1), true);
    check(*pMap, spec(1, 1, 1, 3, 3, 3, 2), true);
}

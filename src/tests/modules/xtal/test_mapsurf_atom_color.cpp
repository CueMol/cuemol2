// -*-Mode: C++;-*-
//
// Molecule-mode colouring of the map isosurface: a vertex takes the colour of
// the target molecule's atom nearest to it, on both the display-list and the
// GPU path. Every vertex is compared with the nearest atom found by brute
// force (../surface/atom_color_test_util.hpp).
//

#include "../surface/atom_color_test_util.hpp"

#include <gfx/TrigGpuPrim.hpp>
#include "xtal/DensityMap.hpp"
#include "xtal/MapRenderer.hpp"
#include "xtal/MapSurfRenderer.hpp"

using namespace atomcoltest;

namespace {

/// Map isosurface (a ramp along x) coloured by molecule; the probe exposes
/// the GPU primitive the fill draw mode uploads.
class ProbeMapSurf : public xtal::MapSurfRenderer
{
public:
    using xtal::MapSurfRenderer::getTrigGpuPrim;
};

class MapSurfColorFixture : public SceneFixture
{
protected:
    ProbeMapSurf *m_pMSR = nullptr;

    void SetUp() override
    {
        SceneFixture::SetUp();
        xtal::DensityMap *pMap = MB_NEW xtal::DensityMap();
        // value = i + j over a 5 A cell: the iso-surface is a slanted plane
        const int n = 10;
        std::vector<float> data(n * n * n);
        for (int k = 0; k < n; ++k)
            for (int j = 0; j < n; ++j)
                for (int i = 0; i < n; ++i)
                    data[i + (j + k * n) * n] = float(i + j);
        pMap->setMapFloatArray(data.data(), n, n, n, 0, 1, 2);
        pMap->setMapParams(0, 0, 0, n, n, n);
        pMap->setXtalParams(5.0, 5.0, 5.0, 90.0, 90.0, 90.0);
        qsys::ObjectPtr pObj(pMap);
        pObj->setName("map");
        m_pScene->addObject(pObj);

        m_pMSR = MB_NEW ProbeMapSurf();
        qsys::RendererPtr pRend(m_pMSR);
        m_pMSR->resetAllProps();
        pObj->attachRenderer(pRend);
        m_pMSR->setUsePBC(false);
        m_pMSR->setTgtObjName("mol");
        m_pMSR->setColorMode(xtal::MapRenderer::MAPREND_MOLFANC);
        m_pMSR->setColSchm(molstr::ColoringSchemePtr(MB_NEW NameColoring()));
    }
};

}  // namespace

TEST_F(MapSurfColorFixture, DisplayListAndGpuTakeTheNearestAtomColor)
{
    RecordDC dl(true);
    m_pMSR->render(&dl);
    int nchecked = 0;
    EXPECT_EQ(countMismatches(dl.m_verts, nchecked), 0) << "display list";
    EXPECT_GT(nchecked, 10) << "display list";

    RecordDC gl(false);
    m_pMSR->display(&gl);
    const gfx::TrigGpuPrim &prim = m_pMSR->getTrigGpuPrim();
    const qlib::uid_t sid = m_pScene->getUID();
    std::vector<std::pair<Vector4D, quint32> > gpu;
    for (int i = 0; i < prim.getVertexSize(); ++i) {
        // vertices are uploaded in the map's grid frame
        Vector4D w = prim.getVertex(i);
        w.w() = 1.0;
        gl.m_gpuMat.xform4D(w);
        gpu.push_back(std::make_pair(w, prim.getColorRGBA(i)));
    }
    int nbad = 0, ngpu = 0;
    for (const auto &v : gpu) {
        const quint32 want = expectedCode(v.first);
        if (want == 0)
            continue;
        ++ngpu;
        const quint32 dev =
            (want == red()->getCode() ? red() : blue())->getDevCode(sid);
        // getColorRGBA() packs the uploaded bytes as R, G, B, A
        const quint32 wantRGBA = (quint32(gfx::getRCode(dev)) << 24) |
                                 (quint32(gfx::getGCode(dev)) << 16) |
                                 (quint32(gfx::getBCode(dev)) << 8) |
                                 quint32(gfx::getACode(dev));
        if (v.second != wantRGBA)
            ++nbad;
    }
    EXPECT_EQ(nbad, 0) << "gpu";
    EXPECT_GT(ngpu, 10) << "gpu";
}

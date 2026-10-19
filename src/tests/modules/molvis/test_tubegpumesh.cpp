// -*-Mode: C++;-*-
//
// GPU mesh of the tube-like renderers (TubeMeshBuilder / TubeGpuSupport):
// an "atomsMoved" event rewrites the mesh in the GPU primitive in place,
// keeping its topology, and the result equals a fresh build.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qsys/ObjectEvent.hpp>
#include <qlib/StringStream.hpp>
#include <qlib/LPropEvent.hpp>
#include <gfx/TrigGpuPrim.hpp>
#include "tests/gfx/mock_display_context.hpp"
#include "molvis/TubeGpuSupport.hpp"
#include "molvis/TubeMeshBuilder.hpp"
#include "molvis/NARenderer.hpp"
#include "molvis/RibbonRenderer.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/MolResidue.hpp"
#include "molstr/MainChainRenderer.hpp"
#include "molstr/ResidIndex.hpp"
#include "molstr/PDBFileReader.hpp"

#include <cmath>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

using molstr::MolCoord;
using molstr::MolCoordPtr;
using molvis::TubeGpuSupport;
using molvis::TubeMeshBuilder;
using qlib::Vector4D;

namespace {

/// Vertex data of a GPU primitive
struct PrimSnapshot
{
    std::vector<float> geom;             // position and normal
    std::vector<qlib::quint32> col, name;
    int nfaces = 0;

    explicit PrimSnapshot(const gfx::TrigGpuPrim &prim) : nfaces(prim.getFaceSize())
    {
        for (int i = 0; i < prim.getVertexSize(); ++i) {
            const Vector4D v = prim.getVertex(i), n = prim.getNormal(i);
            geom.insert(geom.end(), {float(v.x()), float(v.y()), float(v.z()), float(n.x()),
                                     float(n.y()), float(n.z())});
            col.push_back(prim.getColorRGBA(i));
            name.push_back(prim.getHitName(i));
        }
    }
};

/// The triangles of a GPU primitive as drawn: per face corner, the position,
/// normal, color and hit name of its vertex (independent of how the vertices
/// are shared)
std::vector<float> triangleSoup(const gfx::TrigGpuPrim &prim)
{
    std::vector<float> soup;
    for (int f = 0; f < prim.getFaceSize(); ++f) {
        int iv[3];
        prim.getFace(f, iv[0], iv[1], iv[2]);
        for (int i : iv) {
            const Vector4D v = prim.getVertex(i), n = prim.getNormal(i);
            soup.insert(soup.end(), {float(v.x()), float(v.y()), float(v.z()), float(n.x()),
                                     float(n.y()), float(n.z()), float(prim.getColorRGBA(i)),
                                     float(prim.getHitName(i))});
        }
    }
    return soup;
}

/// Ring sharing of TubeMeshBuilder switched for the lifetime of the object
struct RingSharing
{
    explicit RingSharing(bool b) { TubeMeshBuilder::setRingSharing(b); }
    ~RingSharing() { TubeMeshBuilder::setRingSharing(true); }
};

/// Mesh of a tube-like renderer, drawn (built or updated) into its primitive
PrimSnapshot drawnMesh(qsys::RendererPtr pR, MockDisplayContext &dc)
{
    pR->display(&dc);
    return PrimSnapshot(dynamic_cast<TubeGpuSupport *>(pR.get())->tubeGpuPrim());
}

int lastPass(qsys::RendererPtr pR)
{
    return dynamic_cast<TubeGpuSupport *>(pR.get())->tubeGpuLastPass();
}

MolCoordPtr loadPDB(const char *fname, qsys::ScenePtr pScene, const char *name)
{
    std::ifstream ifs(std::string(CUEMOL2_TEST_DATA_DIR) + "/" + fname);
    EXPECT_TRUE(ifs.good());
    std::stringstream ss;
    ss << ifs.rdbuf();
    const std::string pdb = ss.str();

    molstr::PDBFileReader reader;
    qlib::StrInStream ins(pdb.c_str(), static_cast<int>(pdb.size()));
    MolCoordPtr pMol(reader.load(ins));
    pMol->setName(name);
    pScene->addObject(pMol);
    return pMol;
}

/// Move every atom a little (different directions per atom)
void moveAtoms(MolCoordPtr pMol)
{
    for (auto it = pMol->beginAtom(); it != pMol->endAtom(); ++it) {
        const double a = double(it->first);
        it->second->setPos(it->second->getPos() +
                           Vector4D(0.3 * std::sin(a), 0.3 * std::cos(a), 0.1));
    }
    pMol->fireAtomsMoved();
}

class TubeGpuMeshTest : public ::testing::TestWithParam<const char *>
{
protected:
    qsys::ScenePtr m_scene;
    MolCoordPtr m_mol;
    MockDisplayContext m_dc;

    void SetUp() override
    {
        // 1CRN: helices and a sheet, so ribbon/cartoon draw junctions and arrows
        m_scene = qsys::SceneManager::getInstance()->createScene();
        m_mol = loadPDB("1CRN.pdb", m_scene, "crn");

        // The test environment has no topology files to link the residues:
        // link the chain (A1-A46) as one segment
        for (int i = 1; i < 46; ++i) {
            m_mol->getResidue("A", molstr::ResidIndex(i))
                ->setLinkNext(m_mol->getResidue("A", molstr::ResidIndex(i + 1)));
        }
    }

    void TearDown() override
    {
        const qlib::uid_t uid = m_scene->getUID();
        m_mol = MolCoordPtr();
        m_scene = qsys::ScenePtr();
        qsys::SceneManager::getInstance()->destroyScene(uid);
    }

    /// type: a renderer type name, or "cartoon-ribhelix" (cartoon with
    /// ribbon-shaped helices)
    qsys::RendererPtr newRenderer(const char *type)
    {
        const bool bRibHelix = std::string(type) == "cartoon-ribhelix";
        qsys::RendererPtr pR = m_mol->createRenderer(bRibHelix ? "cartoon" : type);
        // (the default style that sets the pivot is not loaded in the tests)
        dynamic_cast<molstr::MainChainRenderer *>(pR.get())->setPivAtomName("CA");
        if (bRibHelix) pR->setPropBool("helix_ribbon", true);
        return pR;
    }
};

}  // namespace

// An atom move rewrites the vertices in place, chunk by chunk (in parallel;
// a segment for tube and ribbon, a helix / sheet / coil element for cartoon),
// keeping the topology, hit names and colors, and gives the same mesh as a
// fresh build from the moved atoms (no stale position-derived cache such as
// the spline coeffs or the cartoon's element splines).
TEST_P(TubeGpuMeshTest, AtomsMovedUpdatesMeshInPlace)
{
    const std::string type = GetParam();
    qsys::RendererPtr pRend = newRenderer(type.c_str());
    const PrimSnapshot built = drawnMesh(pRend, m_dc);
    ASSERT_GT(built.geom.size(), 0u);

    moveAtoms(m_mol);
    const PrimSnapshot updated = drawnMesh(pRend, m_dc);
    EXPECT_EQ(lastPass(pRend), TubeGpuSupport::TG_PASS_CHUNKED);
    EXPECT_EQ(updated.nfaces, built.nfaces);
    EXPECT_EQ(updated.name, built.name);
    EXPECT_EQ(updated.col, built.col);
    EXPECT_NE(updated.geom, built.geom);

    const PrimSnapshot rebuilt = drawnMesh(newRenderer(type.c_str()), m_dc);
    EXPECT_EQ(rebuilt.geom, updated.geom);
    EXPECT_EQ(rebuilt.name, updated.name);
}

// Ring bands (tube and ribbon draw each ring of section vertices once and
// connect it to the previous one by index) give exactly the triangles of the
// strips that hold every ring twice, in a fresh build and after an in-place
// update, with fewer vertices.
TEST_P(TubeGpuMeshTest, RingBandsKeepTheTriangles)
{
    const std::string type = GetParam();
    auto build = [&](bool bShare) {
        RingSharing rs(bShare);
        qsys::RendererPtr pR = newRenderer(type.c_str());
        pR->display(&m_dc);
        return pR;
    };
    auto prim = [](qsys::RendererPtr pR) -> const gfx::TrigGpuPrim & {
        return dynamic_cast<TubeGpuSupport *>(pR.get())->tubeGpuPrim();
    };

    qsys::RendererPtr pShared = build(true);
    const int nShared = prim(pShared).getVertexSize();
    {
        qsys::RendererPtr pStrips = build(false);
        EXPECT_EQ(triangleSoup(prim(pShared)), triangleSoup(prim(pStrips)));
        const int nStrips = prim(pStrips).getVertexSize();
        if (type == "tube" || type == "ribbon")
            EXPECT_LT(nShared, nStrips * 3 / 4);
        else
            EXPECT_EQ(nShared, nStrips);  // cartoon draws no ring bands
    }

    moveAtoms(m_mol);
    pShared->display(&m_dc);
    EXPECT_EQ(lastPass(pShared), TubeGpuSupport::TG_PASS_CHUNKED);
    EXPECT_EQ(prim(pShared).getVertexSize(), nShared);
    EXPECT_EQ(triangleSoup(prim(pShared)), triangleSoup(prim(build(false))));
}

// The chunked update runs its chunks in parallel only for a mesh of at least
// TubeGpuSupport::getParallelMinVerts() vertices; a smaller one is updated on
// the calling thread, with the same result.
TEST_F(TubeGpuMeshTest, SmallMeshUpdatesSerially)
{
    struct MinVerts
    {
        explicit MinVerts(int n) { TubeGpuSupport::setParallelMinVerts(n); }
        ~MinVerts()
        {
            TubeGpuSupport::setParallelMinVerts(
                TubeGpuSupport::TG_DEFAULT_PARALLEL_MIN_VERTS);
        }
    };
    auto updated = [&](int nMinVerts, bool bParallel) {
        MinVerts mv(nMinVerts);
        qsys::RendererPtr pR = newRenderer("ribbon");
        drawnMesh(pR, m_dc);
        moveAtoms(m_mol);
        const PrimSnapshot snap = drawnMesh(pR, m_dc);
        EXPECT_EQ(lastPass(pR), TubeGpuSupport::TG_PASS_CHUNKED);
        EXPECT_EQ(dynamic_cast<TubeGpuSupport *>(pR.get())->tubeGpuLastParallel(), bParallel);
        return snap;
    };
    // 1CRN is far below the default threshold (the serial result is checked
    // against a fresh build in AtomsMovedUpdatesMeshInPlace)
    updated(TubeGpuSupport::TG_DEFAULT_PARALLEL_MIN_VERTS, false);
    const PrimSnapshot parallel = updated(0, true);
    EXPECT_EQ(parallel.geom, drawnMesh(newRenderer("ribbon"), m_dc).geom);
}

// A coloring change updates only the colors in place (no rebuild), also for
// a coloring property whose name could match the renderer's own properties.
TEST_P(TubeGpuMeshTest, ColoringChangeUpdatesColorsInPlace)
{
    qsys::RendererPtr pRend = newRenderer(GetParam());
    drawnMesh(pRend, m_dc);

    qlib::LPropEvent ev("helix");
    ev.setParentName("coloring");
    pRend->propChanged(ev);
    drawnMesh(pRend, m_dc);
    EXPECT_EQ(lastPass(pRend), TubeGpuSupport::TG_PASS_SERIAL);
}

// The pivot atom of each residue is cached: a pivot name change and a
// topology change drop the cache, an atom move does not need to.
TEST_F(TubeGpuMeshTest, PivotCacheFollowsNameAndTopology)
{
    qsys::RendererPtr pRend = m_mol->createRenderer("tube");
    auto *pMC = dynamic_cast<molstr::MainChainRenderer *>(pRend.get());
    ASSERT_NE(pMC, nullptr);
    molstr::MolResiduePtr pRes = m_mol->getResidue("A", molstr::ResidIndex(5));
    ASSERT_FALSE(pRes.isnull());

    pMC->setPivAtomName("CA");
    EXPECT_TRUE(pMC->getPivotAtom(pRes)->getName().equals("CA"));
    pMC->setPivAtomName("CB");
    molstr::MolAtomPtr pCB = pMC->getPivotAtom(pRes);
    ASSERT_TRUE(pCB->getName().equals("CB"));

    m_mol->removeAtom(pCB->getID());
    m_mol->fireTopologyChanged();
    molstr::MolAtomPtr pPiv = pMC->getPivotAtom(pRes);
    EXPECT_TRUE(pPiv.isnull() || !pPiv->getName().equals("CB"));
}

// The topology part of the spline coeffs (segments, per-residue smoothing
// weights and sheet atoms) is kept across atom moves, and rebuilt when the
// secondary structure or the smoothing changes.
TEST_F(TubeGpuMeshTest, SplineTopologyRebuiltOnSecondaryAndSmoothing)
{
    auto newRibbon = [this](double dHelixSmo) {
        qsys::RendererPtr pR = newRenderer("ribbon");
        dynamic_cast<molvis::RibbonRenderer *>(pR.get())->setHelixSmooth(dHelixSmo);
        return pR;
    };

    qsys::RendererPtr pRend = newRibbon(0.0);
    const PrimSnapshot before = drawnMesh(pRend, m_dc);

    // Secondary structure: residues 1-10 become a strand (binormal from C=O,
    // sheet smoothing weight)
    for (int i = 1; i <= 10; ++i)
        m_mol->getResidue("A", molstr::ResidIndex(i))->setPropStr("secondary", "sheet");
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(m_mol->getUID());
    obe.setDescr("secondary");
    m_mol->fireObjectEvent(obe);

    const PrimSnapshot afterSec = drawnMesh(pRend, m_dc);
    EXPECT_NE(afterSec.geom, before.geom);
    EXPECT_EQ(afterSec.geom, drawnMesh(newRibbon(0.0), m_dc).geom);

    // Smoothing
    dynamic_cast<molvis::RibbonRenderer *>(pRend.get())->setHelixSmooth(0.7);
    EXPECT_EQ(drawnMesh(pRend, m_dc).geom, drawnMesh(newRibbon(0.7), m_dc).geom);
}

// The cartoon keeps its helix / sheet / coil elements (control point sources,
// weights, sheet C/O atoms) across atom moves and rebuilds them when the
// secondary structure or a smoothing / anchor property changes: the chunked
// update after such a change gives the mesh of a fresh build.
TEST_F(TubeGpuMeshTest, CartoonElementsRebuiltOnSecondaryAndProps)
{
    auto newCartoon = [this](double dCoilSmo, double dAnchorWgt) {
        qsys::RendererPtr pR = newRenderer("cartoon");
        pR->setPropReal("coil_smooth", dCoilSmo);
        pR->setPropReal("anchor_weight", dAnchorWgt);
        return pR;
    };

    qsys::RendererPtr pRend = newCartoon(-1.0, 10.0);
    drawnMesh(pRend, m_dc);

    // Secondary structure: residues 1-10 become a strand
    for (int i = 1; i <= 10; ++i)
        m_mol->getResidue("A", molstr::ResidIndex(i))->setPropStr("secondary", "sheet");
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(m_mol->getUID());
    obe.setDescr("secondary");
    m_mol->fireObjectEvent(obe);
    drawnMesh(pRend, m_dc);

    moveAtoms(m_mol);
    PrimSnapshot updated = drawnMesh(pRend, m_dc);
    EXPECT_EQ(lastPass(pRend), TubeGpuSupport::TG_PASS_CHUNKED);
    EXPECT_EQ(updated.geom, drawnMesh(newCartoon(-1.0, 10.0), m_dc).geom);

    // Smoothing and anchor weight
    pRend->setPropReal("coil_smooth", 1.0);
    pRend->setPropReal("anchor_weight", 3.0);
    drawnMesh(pRend, m_dc);

    moveAtoms(m_mol);
    updated = drawnMesh(pRend, m_dc);
    EXPECT_EQ(lastPass(pRend), TubeGpuSupport::TG_PASS_CHUNKED);
    EXPECT_EQ(updated.geom, drawnMesh(newCartoon(1.0, 3.0), m_dc).geom);
}

INSTANTIATE_TEST_SUITE_P(TubeLike, TubeGpuMeshTest,
                         ::testing::Values("tube", "ribbon", "cartoon", "cartoon-ribhelix"));

// The nucleic-acid renderer records its base sticks in the same traversal:
// they are rewritten in place with the tube and ring mesh.
TEST(NARendererGpuMeshTest, AtomsMovedUpdatesSticksInPlace)
{
    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    MolCoordPtr pMol = loadPDB("1ehz_rna.pdb", pScene, "rna");

    // No topology files in the tests: link the consecutive residues and set
    // the base types by residue name
    for (int i = 1; i <= 76; ++i) {
        molstr::MolResiduePtr pRes = pMol->getResidue("A", molstr::ResidIndex(i));
        if (pRes.isnull()) continue;
        const qlib::LString rn = pRes->getName();
        pRes->setPropStr("basetype", (rn.equals("A") || rn.equals("G")) ? "pur" : "pyr");
        molstr::MolResiduePtr pNext = pMol->getResidue("A", molstr::ResidIndex(i + 1));
        if (!pNext.isnull()) pRes->setLinkNext(pNext);
    }

    MockDisplayContext dc;
    auto newNA = [&]() {
        qsys::RendererPtr pR = pMol->createRenderer("nucl");
        auto *pNA = dynamic_cast<molvis::NARenderer *>(pR.get());
        pNA->setPivAtomName("P");
        pNA->setBaseType(molvis::NARenderer::NAREND_DETAIL1);
        return pR;
    };
    auto sticks = [](qsys::RendererPtr pR) {
        auto *pNA = dynamic_cast<molvis::NARenderer *>(pR.get());
        std::vector<double> v;
        for (const auto &st : pNA->getSpheres())
            v.insert(v.end(), {st.pos1.x(), st.pos1.y(), st.pos1.z(), double(st.name)});
        for (const auto &st : pNA->getCylinders())
            v.insert(v.end(), {st.pos1.x(), st.pos1.y(), st.pos1.z(), st.pos2.x(),
                               st.pos2.y(), st.pos2.z(), double(st.name)});
        return v;
    };

    qsys::RendererPtr pRend = newNA();
    const PrimSnapshot built = drawnMesh(pRend, dc);
    const std::vector<double> builtSticks = sticks(pRend);
    ASSERT_GT(built.geom.size(), 0u);
    ASSERT_GT(builtSticks.size(), 0u);

    moveAtoms(pMol);
    const PrimSnapshot updated = drawnMesh(pRend, dc);
    EXPECT_EQ(lastPass(pRend), TubeGpuSupport::TG_PASS_SERIAL);
    EXPECT_EQ(updated.name, built.name);
    EXPECT_NE(sticks(pRend), builtSticks);

    // Same as a fresh build from the moved atoms
    qsys::RendererPtr pFresh = newNA();
    EXPECT_EQ(drawnMesh(pFresh, dc).geom, updated.geom);
    EXPECT_EQ(sticks(pFresh), sticks(pRend));

    const qlib::uid_t uid = pScene->getUID();
    pRend = qsys::RendererPtr();
    pFresh = qsys::RendererPtr();
    pMol = MolCoordPtr();
    pScene = qsys::ScenePtr();
    qsys::SceneManager::getInstance()->destroyScene(uid);
}

// Once the mesh is in the GPU primitive, an update writes only the flagged
// data straight into the primitive's vertex array (hit names kept), and
// reports a topology change.
TEST(TubeMeshBuilderTest, UpdateWritesIntoGpuPrim)
{
    auto drawStrip = [](TubeMeshBuilder &mb, int nverts, double dx, int name) {
        mb.loadName(name);
        mb.normal(Vector4D(0, 0, 2));
        mb.startTriangleStrip();
        for (int i = 0; i < nverts; ++i) mb.vertex(Vector4D(i + dx, i % 2, 0));
        mb.end();
    };
    auto drawFan = [](TubeMeshBuilder &mb, int name) {
        mb.loadName(name);
        mb.startTriangleFan();
        for (int i = 0; i < 4; ++i) mb.vertex(Vector4D(0, i, 1));
        mb.end();
    };

    MockDisplayContext dc;
    gfx::TrigGpuPrim prim;
    ASSERT_TRUE(prim.init(&dc));

    TubeMeshBuilder mb;
    mb.startBuild(qlib::invalid_uid);
    drawStrip(mb, 4, 0.0, 5);
    drawFan(mb, 7);
    ASSERT_TRUE(mb.finish());
    EXPECT_EQ(mb.getFaceSize(), 4);
    mb.toGpuPrim(&dc, prim);
    mb.releaseVertexData();
    EXPECT_EQ(prim.getVertexSize(), 8);
    EXPECT_EQ(prim.getHitName(0), gfx::encodeHitName(5));
    EXPECT_EQ(prim.getHitName(4), gfx::encodeHitName(7));
    // the mesh goes into the layout the update path writes
    EXPECT_EQ(prim.getLayout(), gfx::TrigGpuPrim::LAYOUT_PACKED);
    EXPECT_DOUBLE_EQ(prim.getNormal(0).z(), 1.0);  // normalized

    // Same topology: positions rewritten, hit names kept
    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM, prim.getPackedArrays());
    drawStrip(mb, 4, 10.0, 99);
    drawFan(mb, 99);
    EXPECT_TRUE(mb.finish());
    EXPECT_DOUBLE_EQ(prim.getVertex(0).x(), 10.0);
    EXPECT_DOUBLE_EQ(prim.getVertex(3).x(), 13.0);
    EXPECT_DOUBLE_EQ(prim.getNormal(0).z(), 1.0);
    EXPECT_EQ(prim.getHitName(4), gfx::encodeHitName(7));

    // A longer strip is a topology change
    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM, prim.getPackedArrays());
    drawStrip(mb, 6, 0.0, 5);
    EXPECT_FALSE(mb.finish());
}

// A ring band takes the new ring's vertices only and gives the triangles of
// the strip pairing them with the previous ring's (the leading vertices of
// the preceding ring strip or band). Only a ring strip or band starts a ring.
TEST(TubeMeshBuilderTest, RingBandConnectsToPreviousRing)
{
    // ring r (3 vertices) at x = r
    auto ringStrip = [](TubeMeshBuilder &mb) {
        mb.startRingStrip();
        for (int j = 0; j < 3; ++j) {
            mb.vertex(Vector4D(1, j, 0));  // new ring
            mb.vertex(Vector4D(0, j, 0));  // previous ring
        }
        mb.end();
    };
    auto band = [](TubeMeshBuilder &mb, double x) {
        mb.startRingBand();
        for (int j = 0; j < 3; ++j) mb.vertex(Vector4D(x, j, 0));
        mb.end();
    };

    MockDisplayContext dc;
    gfx::TrigGpuPrim prim;
    ASSERT_TRUE(prim.init(&dc));

    TubeMeshBuilder mb;
    mb.startBuild(qlib::invalid_uid);
    EXPECT_FALSE(mb.hasRing());
    ringStrip(mb);
    ASSERT_TRUE(mb.hasRing());
    band(mb, 2.0);
    band(mb, 3.0);
    ASSERT_TRUE(mb.finish());
    EXPECT_EQ(mb.getVertexSize(), 12);
    EXPECT_EQ(mb.getFaceSize(), 12);
    mb.toGpuPrim(&dc, prim);
    mb.releaseVertexData();

    // The first band is the strip new0, old0, new1, old1, ... with the old
    // ring at the strip's leading vertices 0, 2, 4
    int v1, v2, v3;
    prim.getFace(4, v1, v2, v3);
    EXPECT_EQ(std::vector<int>({v1, v2, v3}), std::vector<int>({6, 0, 7}));
    prim.getFace(5, v1, v2, v3);
    EXPECT_EQ(std::vector<int>({v1, v2, v3}), std::vector<int>({2, 7, 0}));
    // The second band connects to the first band's vertices
    prim.getFace(8, v1, v2, v3);
    EXPECT_EQ(std::vector<int>({v1, v2, v3}), std::vector<int>({9, 6, 10}));

    // The same traversal updates in place
    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM, prim.getPackedArrays());
    ringStrip(mb);
    band(mb, 5.0);
    band(mb, 6.0);
    EXPECT_TRUE(mb.finish());
    EXPECT_DOUBLE_EQ(prim.getVertex(9).x(), 6.0);

    // A plain strip or fan does not start a ring
    mb.startBuild(qlib::invalid_uid);
    ringStrip(mb);
    mb.startTriangleFan();
    for (int i = 0; i < 3; ++i) mb.vertex(Vector4D(0, i, 1));
    mb.end();
    EXPECT_FALSE(mb.hasRing());
    mb.finish();
}

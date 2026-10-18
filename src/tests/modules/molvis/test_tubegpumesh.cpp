// -*-Mode: C++;-*-
//
// GPU mesh of the tube-like renderers (TubeMeshBuilder / TubeGpuSupport):
// an "atomsMoved" event rewrites the recorded mesh in place, keeping its
// topology, and the result equals a fresh build.
//

#include <gtest/gtest.h>
#include <common.h>
#include <qsys/Scene.hpp>
#include <qsys/SceneManager.hpp>
#include <qlib/StringStream.hpp>
#include "molvis/TubeGpuSupport.hpp"
#include "molvis/TubeMeshBuilder.hpp"
#include "molvis/NARenderer.hpp"
#include "molvis/RibbonRenderer.hpp"
#include <qsys/ObjectEvent.hpp>
#include "tests/gfx/mock_display_context.hpp"
#include <gfx/TrigGpuPrim.hpp>
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

struct MeshSnapshot
{
    std::vector<Vector4D> pos, norm;
    std::vector<qlib::quint32> col, name;
    std::vector<TubeMeshBuilder::Prim> prims;

    explicit MeshSnapshot(const TubeMeshBuilder &mb) : prims(mb.getPrims())
    {
        for (int i = 0; i < mb.getVertexSize(); ++i) {
            pos.push_back(mb.getPos(i));
            norm.push_back(mb.getNorm(i));
            col.push_back(mb.getColor(i));
            name.push_back(mb.getHitName(i));
        }
    }
};

bool samePrims(const MeshSnapshot &a, const MeshSnapshot &b)
{
    if (a.prims.size() != b.prims.size()) return false;
    for (size_t i = 0; i < a.prims.size(); ++i) {
        if (a.prims[i].type != b.prims[i].type || a.prims[i].first != b.prims[i].first ||
            a.prims[i].count != b.prims[i].count)
            return false;
    }
    return true;
}

class TubeGpuMeshTest : public ::testing::TestWithParam<const char *>
{
protected:
    qsys::ScenePtr m_scene;
    MolCoordPtr m_mol;

    void SetUp() override
    {
        // 1CRN: helices and a sheet, so ribbon/cartoon draw junctions and arrows
        std::ifstream ifs(std::string(CUEMOL2_TEST_DATA_DIR) + "/1CRN.pdb");
        ASSERT_TRUE(ifs.good());
        std::stringstream ss;
        ss << ifs.rdbuf();
        const std::string pdb = ss.str();

        m_scene = qsys::SceneManager::getInstance()->createScene();
        molstr::PDBFileReader reader;
        qlib::StrInStream ins(pdb.c_str(), static_cast<int>(pdb.size()));
        m_mol = MolCoordPtr(reader.load(ins));
        m_mol->setName("crn");
        m_scene->addObject(m_mol);

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
};

}  // namespace

TEST_P(TubeGpuMeshTest, AtomsMovedUpdatesMeshInPlace)
{
    qsys::RendererPtr pRend = m_mol->createRenderer(GetParam());
    auto *pTg = dynamic_cast<TubeGpuSupport *>(pRend.get());
    ASSERT_NE(pTg, nullptr);
    // (the default style that sets the pivot is not loaded in the tests)
    dynamic_cast<molstr::MainChainRenderer *>(pRend.get())->setPivAtomName("CA");

    pTg->tubeGpuBuildMesh();
    const MeshSnapshot built(pTg->tubeGpuMesh());
    ASSERT_GT(built.pos.size(), 0u);

    // Move every atom a little (different directions per atom)
    for (auto it = m_mol->beginAtom(); it != m_mol->endAtom(); ++it) {
        const double a = double(it->first);
        it->second->setPos(it->second->getPos() +
                           Vector4D(0.3 * std::sin(a), 0.3 * std::cos(a), 0.1));
    }
    m_mol->fireAtomsMoved();

    // The event requested an in-place update that keeps the topology
    ASSERT_TRUE(pTg->tubeGpuUpdateMesh());
    const MeshSnapshot updated(pTg->tubeGpuMesh());
    EXPECT_TRUE(samePrims(built, updated));
    EXPECT_EQ(built.name, updated.name);
    EXPECT_EQ(built.col, updated.col);
    EXPECT_NE(built.pos, updated.pos);

    // ... and gives the same mesh as a fresh build from the moved atoms
    // (no stale position-derived cache such as the spline coeffs)
    pTg->tubeGpuBuildMesh();
    const MeshSnapshot rebuilt(pTg->tubeGpuMesh());
    EXPECT_TRUE(samePrims(rebuilt, updated));
    EXPECT_EQ(rebuilt.pos, updated.pos);
    EXPECT_EQ(rebuilt.norm, updated.norm);
    EXPECT_EQ(rebuilt.name, updated.name);
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
        qsys::RendererPtr pR = m_mol->createRenderer("ribbon");
        auto *pRib = dynamic_cast<molvis::RibbonRenderer *>(pR.get());
        pRib->setPivAtomName("CA");
        pRib->setHelixSmooth(dHelixSmo);
        return pR;
    };
    auto meshOf = [](qsys::RendererPtr pR) {
        auto *pTg = dynamic_cast<TubeGpuSupport *>(pR.get());
        pTg->tubeGpuBuildMesh();
        return MeshSnapshot(pTg->tubeGpuMesh());
    };

    qsys::RendererPtr pRend = newRibbon(0.0);
    const MeshSnapshot before = meshOf(pRend);

    // Secondary structure: residues 1-10 become a strand (binormal from C=O,
    // sheet smoothing weight)
    for (int i = 1; i <= 10; ++i)
        m_mol->getResidue("A", molstr::ResidIndex(i))->setPropStr("secondary", "sheet");
    qsys::ObjectEvent obe;
    obe.setType(qsys::ObjectEvent::OBE_CHANGED);
    obe.setTarget(m_mol->getUID());
    obe.setDescr("secondary");
    m_mol->fireObjectEvent(obe);

    const MeshSnapshot afterSec = meshOf(pRend);
    EXPECT_NE(afterSec.pos, before.pos);
    EXPECT_EQ(afterSec.pos, meshOf(newRibbon(0.0)).pos);

    // Smoothing
    dynamic_cast<molvis::RibbonRenderer *>(pRend.get())->setHelixSmooth(0.7);
    const MeshSnapshot afterSmo = meshOf(pRend);
    EXPECT_EQ(afterSmo.pos, meshOf(newRibbon(0.7)).pos);
}

INSTANTIATE_TEST_SUITE_P(TubeLike, TubeGpuMeshTest,
                         ::testing::Values("tube", "ribbon", "cartoon"));

// The nucleic-acid renderer records its base sticks in the same traversal:
// they are rewritten in place with the tube and ring mesh.
TEST(NARendererGpuMeshTest, AtomsMovedUpdatesSticksInPlace)
{
    std::ifstream ifs(std::string(CUEMOL2_TEST_DATA_DIR) + "/1ehz_rna.pdb");
    ASSERT_TRUE(ifs.good());
    std::stringstream ss;
    ss << ifs.rdbuf();
    const std::string pdb = ss.str();

    qsys::ScenePtr pScene = qsys::SceneManager::getInstance()->createScene();
    molstr::PDBFileReader reader;
    qlib::StrInStream ins(pdb.c_str(), static_cast<int>(pdb.size()));
    MolCoordPtr pMol(reader.load(ins));
    pMol->setName("rna");
    pScene->addObject(pMol);

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

    qsys::RendererPtr pRend = pMol->createRenderer("nucl");
    auto *pNA = dynamic_cast<molvis::NARenderer *>(pRend.get());
    ASSERT_NE(pNA, nullptr);
    pNA->setPivAtomName("P");
    pNA->setBaseType(molvis::NARenderer::NAREND_DETAIL1);

    pNA->tubeGpuBuildMesh();
    const MeshSnapshot built(pNA->tubeGpuMesh());
    const auto sphs = pNA->getSpheres();
    const auto cyls = pNA->getCylinders();
    ASSERT_GT(built.pos.size(), 0u);
    ASSERT_GT(sphs.size(), 0u);
    ASSERT_GT(cyls.size(), 0u);

    for (auto it = pMol->beginAtom(); it != pMol->endAtom(); ++it) {
        const double a = double(it->first);
        it->second->setPos(it->second->getPos() +
                           Vector4D(0.3 * std::sin(a), 0.3 * std::cos(a), 0.1));
    }
    pMol->fireAtomsMoved();

    ASSERT_TRUE(pNA->tubeGpuUpdateMesh());
    const MeshSnapshot updated(pNA->tubeGpuMesh());
    const auto usphs = pNA->getSpheres();
    const auto ucyls = pNA->getCylinders();
    EXPECT_TRUE(samePrims(built, updated));
    ASSERT_EQ(usphs.size(), sphs.size());
    ASSERT_EQ(ucyls.size(), cyls.size());
    EXPECT_FALSE(usphs[0].pos1 == sphs[0].pos1);
    EXPECT_EQ(usphs[0].name, sphs[0].name);

    // Same as a fresh build from the moved atoms
    pNA->tubeGpuBuildMesh();
    const MeshSnapshot rebuilt(pNA->tubeGpuMesh());
    EXPECT_EQ(rebuilt.pos, updated.pos);
    const auto rsphs = pNA->getSpheres();
    const auto rcyls = pNA->getCylinders();
    ASSERT_EQ(rsphs.size(), usphs.size());
    ASSERT_EQ(rcyls.size(), ucyls.size());
    for (size_t i = 0; i < rsphs.size(); ++i) {
        EXPECT_EQ(rsphs[i].pos1, usphs[i].pos1);
        EXPECT_EQ(rsphs[i].name, usphs[i].name);
        EXPECT_EQ(rsphs[i].col, usphs[i].col);
    }
    for (size_t i = 0; i < rcyls.size(); ++i) {
        EXPECT_EQ(rcyls[i].pos1, ucyls[i].pos1);
        EXPECT_EQ(rcyls[i].pos2, ucyls[i].pos2);
        EXPECT_EQ(rcyls[i].name, ucyls[i].name);
    }

    const qlib::uid_t uid = pScene->getUID();
    pRend = qsys::RendererPtr();
    pMol = MolCoordPtr();
    pScene = qsys::ScenePtr();
    qsys::SceneManager::getInstance()->destroyScene(uid);
}

// Update overwrites only the flagged data and reports a topology change.
TEST(TubeMeshBuilderTest, UpdateKeepsTopologyAndDetectsChange)
{
    auto drawStrip = [](TubeMeshBuilder &mb, int nverts, double dx) {
        mb.loadName(5);
        mb.normal(Vector4D(0, 0, 2));
        mb.startTriangleStrip();
        for (int i = 0; i < nverts; ++i) mb.vertex(Vector4D(i + dx, i % 2, 0));
        mb.end();
    };

    TubeMeshBuilder mb;
    mb.startBuild(qlib::invalid_uid);
    drawStrip(mb, 4, 0.0);
    mb.loadName(7);
    mb.startTriangleFan();
    for (int i = 0; i < 4; ++i) mb.vertex(Vector4D(0, i, 1));
    mb.end();
    ASSERT_TRUE(mb.finish());
    EXPECT_EQ(mb.getVertexSize(), 8);
    EXPECT_EQ(mb.getFaceSize(), 4);
    EXPECT_EQ(mb.getHitName(0), gfx::encodeHitName(5));
    EXPECT_EQ(mb.getHitName(4), gfx::encodeHitName(7));
    EXPECT_EQ(mb.getNorm(0), Vector4D(0, 0, 1));

    // Same topology: positions rewritten, hit names kept
    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM);
    drawStrip(mb, 4, 10.0);
    mb.loadName(99);
    mb.startTriangleFan();
    for (int i = 0; i < 4; ++i) mb.vertex(Vector4D(0, i, 1));
    mb.end();
    EXPECT_TRUE(mb.finish());
    EXPECT_EQ(mb.getPos(0), Vector4D(10, 0, 0));
    EXPECT_EQ(mb.getHitName(4), gfx::encodeHitName(7));

    // A longer strip is a topology change
    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM);
    drawStrip(mb, 6, 0.0);
    EXPECT_FALSE(mb.finish());
}

// Once the mesh is in the GPU primitive, the update writes straight into the
// primitive's vertex array (the builder keeps no vertex data of its own).
TEST(TubeMeshBuilderTest, UpdateWritesIntoGpuPrim)
{
    auto draw = [](TubeMeshBuilder &mb, double dx) {
        mb.loadName(3);
        mb.normal(Vector4D(0, 1, 0));
        mb.startTriangleStrip();
        for (int i = 0; i < 4; ++i) mb.vertex(Vector4D(i + dx, i % 2, 0));
        mb.end();
    };

    MockDisplayContext dc;
    gfx::TrigGpuPrim prim;
    ASSERT_TRUE(prim.init(&dc));

    TubeMeshBuilder mb;
    mb.startBuild(qlib::invalid_uid);
    draw(mb, 0.0);
    ASSERT_TRUE(mb.finish());
    mb.toGpuPrim(&dc, prim);
    mb.releaseVertexData();
    EXPECT_FALSE(mb.hasVertexData());
    EXPECT_EQ(mb.getVertexSize(), 4);

    mb.startUpdate(qlib::invalid_uid, TubeMeshBuilder::UPD_GEOM, prim.getVertexArray());
    draw(mb, 10.0);
    EXPECT_TRUE(mb.finish());

    const gfx::TrigGpuPrim::TrigVertAttr *pv = prim.getVertexArray();
    EXPECT_FLOAT_EQ(pv[0].x, 10.0f);
    EXPECT_FLOAT_EQ(pv[3].x, 13.0f);
    EXPECT_FLOAT_EQ(pv[3].ny, 1.0f);
    EXPECT_EQ(prim.getHitName(0), gfx::encodeHitName(3));
}

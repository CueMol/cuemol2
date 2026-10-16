#include <gtest/gtest.h>
#include <common.h>

#include "molanl/MolAnlManager.hpp"

#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/PDBFileReader.hpp"
#include "molstr/SelCommand.hpp"
#include "molstr/AtomIterator.hpp"

#include "qsys/SceneManager.hpp"
#include "qsys/Scene.hpp"

#include <qlib/FileStream.hpp>
#include <qlib/Matrix4D.hpp>
#include <qlib/Vector4D.hpp>
#include <qlib/Utils.hpp>

#include <cmath>
#include <vector>

using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::SelectionPtr;
using molstr::SelCommand;
using molstr::AtomIterator;
using qlib::LString;
using qlib::Matrix4D;
using qlib::Vector4D;

namespace {

// Tests for MolAnlManager US-align superpose
// (USalign.cpp -> USalignImpl.cpp -> vendored molanl/usalign).
//
// Baselines are the output of the upstream US-align CLI built from the
// same vendored commit (see molanl/usalign/README.md), e.g.
//   USalign 3cw5_rna.pdb 1ehz_rna.pdb -m -
//   USalign 3cw5_rna.pdb 1ehz_rna.pdb -atom " P  " -m -
//   USalign 1crn_af2_2.pdb 1CRN.pdb -m -
// Structure 1 of the CLI is the moving molecule, structure 2 the reference.

SelectionPtr allSel()
{
    return SelectionPtr(new SelCommand(LString("*")));
}

std::vector<Vector4D> collectPos(const MolCoordPtr &mol, const char *sel, bool raw)
{
    std::vector<Vector4D> v;
    AtomIterator iter(mol, SelectionPtr(new SelCommand(LString(sel))));
    for (iter.first(); iter.hasMore(); iter.next())
        v.push_back(raw ? iter.get()->getRawPos() : iter.get()->getPos());
    return v;
}

void expectCoordsNear(const std::vector<Vector4D> &a,
                      const std::vector<Vector4D> &b, double tol)
{
    ASSERT_EQ(a.size(), b.size());
    ASSERT_GT(a.size(), 0u);
    for (size_t i = 0; i < a.size(); ++i) {
        EXPECT_NEAR(a[i].x(), b[i].x(), tol) << "atom " << i;
        EXPECT_NEAR(a[i].y(), b[i].y(), tol) << "atom " << i;
        EXPECT_NEAR(a[i].z(), b[i].z(), tol) << "atom " << i;
    }
}

void expectMatrixNear(const Matrix4D &a, const Matrix4D &b, double tol)
{
    for (int i = 1; i <= 4; ++i)
        for (int j = 1; j <= 4; ++j)
            EXPECT_NEAR(a.aij(i, j), b.aij(i, j), tol)
                << "element (" << i << "," << j << ")";
}

// A known rigid-body transform: rotation about z by 35 deg + translation.
Matrix4D makeKnownXform()
{
    Matrix4D m;  // identity
    const double th = qlib::toRadian(35.0);
    m.aij(1, 1) = std::cos(th);
    m.aij(1, 2) = -std::sin(th);
    m.aij(2, 1) = std::sin(th);
    m.aij(2, 2) = std::cos(th);
    m.aij(1, 4) = 12.0;
    m.aij(2, 4) = -8.0;
    m.aij(3, 4) = 5.0;
    return m;
}

// Expected values printed by the upstream CLI
struct Baseline {
    double tmRef, tmMov, rmsd;
    int nAligned;
    bool nucleic;
    double t[3];
    double u[3][3];
};

class USalignSuperposeTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_scene;

    void SetUp() override
    {
        m_scene = qsys::SceneManager::getInstance()->createScene();
        m_scene->setName("usalignSuperposeTestScene");
    }

    void TearDown() override
    {
        if (!m_scene.isnull()) {
            qlib::uid_t uid = m_scene->getUID();
            m_scene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    MolCoordPtr loadPdb(const char *fname, const char *name)
    {
        qlib::FileInStream fis;
        fis.open(LString(CUEMOL2_TEST_DATA_DIR "/") + fname);
        molstr::PDBFileReader reader;
        MolCoordPtr pMol(reader.load(fis));
        pMol->setName(name);
        m_scene->addObject(pMol);
        return pMol;
    }

    // Superpose movFile onto refFile and compare with the CLI baseline;
    // also checks that superposeUSalign1 returns the same matrix.
    void checkBaseline(const char *refFile, const char *movFile,
                       const char *pivot, const Baseline &exp)
    {
        MolCoordPtr ref = loadPdb(refFile, "ref");
        MolCoordPtr mov = loadPdb(movFile, "mov");
        auto *mgr = molanl::MolAnlManager::getInstance();

        const molanl::usalign::Result res = mgr->superposeUSalign_impl(
            ref, allSel(), mov, allSel(), LString(pivot), false);
        EXPECT_NEAR(res.tmRef, exp.tmRef, 1.0e-4);
        EXPECT_NEAR(res.tmMov, exp.tmMov, 1.0e-4);
        EXPECT_NEAR(res.rmsd, exp.rmsd, 1.0e-2);
        EXPECT_EQ(res.nAligned, exp.nAligned);
        EXPECT_EQ(res.nucleic, exp.nucleic);

        Matrix4D expMat;
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 3; ++j)
                expMat.aij(i + 1, j + 1) = exp.u[i][j];
            expMat.aij(i + 1, 4) = exp.t[i];
        }
        const Matrix4D x =
            mgr->superposeUSalign1(ref, allSel(), mov, allSel(), LString(pivot), false);
        expectMatrixNear(x, expMat, 1.0e-4);
    }
};

// Same structure -> identity matrix and TM-score 1.
TEST_F(USalignSuperposeTest, IdentitySuperpose)
{
    MolCoordPtr ref = loadPdb("1CRN.pdb", "ref");
    MolCoordPtr mov = loadPdb("1CRN.pdb", "mov");
    auto *mgr = molanl::MolAnlManager::getInstance();

    const molanl::usalign::Result res =
        mgr->superposeUSalign_impl(ref, allSel(), mov, allSel(), LString(), false);
    EXPECT_NEAR(res.tmRef, 1.0, 1.0e-6);
    EXPECT_NEAR(res.rmsd, 0.0, 1.0e-3);
    EXPECT_EQ(res.nAligned, 46);
    EXPECT_FALSE(res.nucleic);

    const Matrix4D x =
        mgr->superposeUSalign1(ref, allSel(), mov, allSel(), LString(), false);
    expectMatrixNear(x, Matrix4D(), 1.0e-3);
}

// Apply a known transform to the moving copy; the result must be its inverse
// and the moving molecule must land on the reference (pins the t/u -> Matrix4D
// conversion and the direction mov -> ref).
TEST_F(USalignSuperposeTest, KnownTransformRecoversInverse)
{
    MolCoordPtr ref = loadPdb("1CRN.pdb", "ref");
    MolCoordPtr mov = loadPdb("1CRN.pdb", "mov");
    const std::vector<Vector4D> refPos = collectPos(ref, "*", false);

    const Matrix4D applied = makeKnownXform();
    mov->xformByMat(applied);

    auto *mgr = molanl::MolAnlManager::getInstance();
    const Matrix4D x =
        mgr->superposeUSalign1(ref, allSel(), mov, allSel(), LString("auto"), false);

    expectMatrixNear(x, applied.invert(), 1.0e-3);
    expectCoordsNear(collectPos(mov, "*", false), refPos, 1.0e-2);
}

// superposeUSalignJSON (wire format pinned) does not move anything; bUseProp=true sets the
// xformMat property and leaves the raw coordinates.
TEST_F(USalignSuperposeTest, ScoreDoesNotMutateAndUsePropSetsXformMat)
{
    MolCoordPtr ref = loadPdb("1CRN.pdb", "ref");
    MolCoordPtr mov = loadPdb("1CRN.pdb", "mov");
    const std::vector<Vector4D> refPos = collectPos(ref, "name CA", false);
    mov->xformByMat(makeKnownXform());
    const std::vector<Vector4D> rawBefore = collectPos(mov, "name CA", true);

    auto *mgr = molanl::MolAnlManager::getInstance();
    const LString json =
        mgr->superposeUSalignJSON(ref, allSel(), mov, allSel(), LString(), false);
    // rmsd carries rounding noise in the last digit
    EXPECT_TRUE(json.startsWith("{\"tm_ref\":1.000000,\"tm_mov\":1.000000,\"rmsd\":0.00000"))
        << json.c_str();
    EXPECT_TRUE(json.endsWith(",\"nalgn\":46,\"seqid\":1.000000,\"nucleic\":false}"))
        << json.c_str();
    expectCoordsNear(collectPos(mov, "name CA", true), rawBefore, 1.0e-9);
    EXPECT_TRUE(mov->getXformMatrix().isIdent());

    const Matrix4D x =
        mgr->superposeUSalign1(ref, allSel(), mov, allSel(), LString(), true);
    expectCoordsNear(collectPos(mov, "name CA", true), rawBefore, 1.0e-9);
    expectMatrixNear(mov->getXformMatrix(), x, 1.0e-9);
    expectCoordsNear(collectPos(mov, "name CA", false), refPos, 1.0e-2);
}

// Protein with insertions/deletions (auto pivot = CA).
TEST_F(USalignSuperposeTest, ProteinIndelBaseline)
{
    checkBaseline("1CRN.pdb", "1crn_af2_2.pdb", "",
                  {0.60416, 0.61193, 2.22, 43, false,
                   {13.2987593248, 13.4046848267, 3.9024392462},
                   {{0.6250181198, 0.7699312810, 0.1286785624},
                    {0.4501269130, -0.4901541672, 0.7464145327},
                    {0.6377602309, -0.4086009238, -0.6529220267}}});
}

// RNA (tRNA-fMet onto tRNA-Phe): auto pivot picks C3' and scores the pair as
// nucleic acid (RNA d0 and secondary structure).
TEST_F(USalignSuperposeTest, RnaAutoPivotBaseline)
{
    checkBaseline("1ehz_rna.pdb", "3cw5_rna.pdb", "auto",
                  {0.65787, 0.59754, 2.10, 57, true,
                   {45.5613081469, 83.4509027716, 36.8684126080},
                   {{-0.8802358080, -0.2812286335, 0.3822242510},
                    {0.4167261872, -0.8433975031, 0.3391458928},
                    {0.2269894429, 0.4578112138, 0.8595840188}}});
}

// RNA with an explicit pivot atom (P), matching the CLI's -atom " P  ".
TEST_F(USalignSuperposeTest, RnaExplicitPivotBaseline)
{
    checkBaseline("1ehz_rna.pdb", "3cw5_rna.pdb", "P",
                  {0.61391, 0.56510, 2.39, 58, true,
                   {45.9025766946, 83.5916877158, 36.8609751221},
                   {{-0.8752067824, -0.2928932745, 0.3850021011},
                    {0.4272302315, -0.8413090801, 0.3311696861},
                    {0.2269083897, 0.4543264922, 0.8614522745}}});
}

}  // namespace

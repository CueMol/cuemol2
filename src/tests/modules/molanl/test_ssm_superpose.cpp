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

// E2E regression baseline for MolAnlManager SSM superpose
// (MolAnlManager.cpp -> molanl/mmdb + molanl/ssmlib).
//
// These tests pin the observable contract of the current implementation
// BEFORE the planned mmdb/ssmlib refactoring: the returned transform
// matrix, the RMSD, and the side effects on the moving molecule. They
// must pass against the current code and serve as the degrade detector.
//
// Strategy: self-superpose of 1CRN (crambin) so the ground truth is
// analytically known (identity, or the inverse of a known applied
// transform). This avoids any external golden values.

// Selection fed to the superpose call. SSM builds its SSE graph via
// CModel::CalcSecStructure(), which needs the protein backbone
// (N/CA/C/O) to assign secondary structure -- a CA-only selection
// yields an empty graph (SSM_noGraph). So superpose over all atoms.
SelectionPtr supSel()
{
    return SelectionPtr(new SelCommand(LString("*")));
}

// Selection used only to read back CA coordinates for comparison.
SelectionPtr caSel()
{
    return SelectionPtr(new SelCommand(LString("name CA")));
}

// Raw (stored) CA positions, ignoring any xformMat property.
std::vector<Vector4D> collectCARaw(const MolCoordPtr &mol)
{
    std::vector<Vector4D> v;
    AtomIterator iter(mol, caSel());
    for (iter.first(); iter.hasMore(); iter.next())
        v.push_back(iter.get()->getRawPos());
    return v;
}

// Effective CA positions (xformMat property applied, if any).
std::vector<Vector4D> collectCAPos(const MolCoordPtr &mol)
{
    std::vector<Vector4D> v;
    AtomIterator iter(mol, caSel());
    for (iter.first(); iter.hasMore(); iter.next())
        v.push_back(iter.get()->getPos());
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

class SSMSuperposeTest : public ::testing::Test {
protected:
    qsys::ScenePtr m_scene;

    void SetUp() override
    {
        m_scene = qsys::SceneManager::getInstance()->createScene();
        m_scene->setName("ssmSuperposeTestScene");
    }

    void TearDown() override
    {
        if (!m_scene.isnull()) {
            qlib::uid_t uid = m_scene->getUID();
            m_scene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    MolCoordPtr loadCrambin(const char *name)
    {
        qlib::FileInStream fis;
        fis.open(LString(CUEMOL2_TEST_DATA_DIR "/1CRN.pdb"));
        molstr::PDBFileReader reader;
        MolCoordPtr pMol(reader.load(fis));
        pMol->setName(name);
        m_scene->addObject(pMol);
        return pMol;
    }
};

// Same structure -> superpose must return identity and ~zero RMSD.
TEST_F(SSMSuperposeTest, IdentitySuperpose)
{
    MolCoordPtr ref = loadCrambin("ref");
    MolCoordPtr mov = loadCrambin("mov");
    ASSERT_FALSE(ref.isnull());
    ASSERT_FALSE(mov.isnull());

    auto *mgr = molanl::MolAnlManager::getInstance();

    const double rmsd =
        mgr->superposeSSM_rmsd(ref, supSel(), mov, supSel(), false);
    EXPECT_NEAR(rmsd, 0.0, 1.0e-3);

    const Matrix4D x = mgr->superposeSSM1(ref, supSel(), mov, supSel(), false);
    expectMatrixNear(x, Matrix4D(), 1.0e-3);

    // moving coords now coincide with the reference
    expectCoordsNear(collectCAPos(mov), collectCAPos(ref), 1.0e-2);
}

// Apply a known transform to the moving copy; SSM must recover its
// inverse and map the moving molecule back onto the reference.
TEST_F(SSMSuperposeTest, KnownTransformRecoversInverse)
{
    MolCoordPtr ref = loadCrambin("ref");
    MolCoordPtr mov = loadCrambin("mov");

    const std::vector<Vector4D> refCA = collectCAPos(ref);

    const Matrix4D applied = makeKnownXform();
    mov->xformByMat(applied);  // bake into raw coordinates

    auto *mgr = molanl::MolAnlManager::getInstance();
    const Matrix4D x = mgr->superposeSSM1(ref, supSel(), mov, supSel(), false);

    expectMatrixNear(x, applied.invert(), 1.0e-2);
    expectCoordsNear(collectCAPos(mov), refCA, 1.0e-2);
}

// superposeSSM_rmsd must NOT mutate the moving molecule.
TEST_F(SSMSuperposeTest, RmsdDoesNotMutateMoving)
{
    MolCoordPtr ref = loadCrambin("ref");
    MolCoordPtr mov = loadCrambin("mov");

    mov->xformByMat(makeKnownXform());
    const std::vector<Vector4D> before = collectCARaw(mov);

    auto *mgr = molanl::MolAnlManager::getInstance();
    const double rmsd =
        mgr->superposeSSM_rmsd(ref, supSel(), mov, supSel(), false);
    EXPECT_NEAR(rmsd, 0.0, 1.0e-3);

    expectCoordsNear(collectCARaw(mov), before, 1.0e-9);
    EXPECT_TRUE(mov->getXformMatrix().isIdent());
}

// bUseProp=true must set the xformMat property (not bake raw coords).
TEST_F(SSMSuperposeTest, UsePropSetsXformMatNotRawCoords)
{
    MolCoordPtr ref = loadCrambin("ref");
    MolCoordPtr mov = loadCrambin("mov");

    const std::vector<Vector4D> refCA = collectCAPos(ref);
    mov->xformByMat(makeKnownXform());
    const std::vector<Vector4D> rawBefore = collectCARaw(mov);

    auto *mgr = molanl::MolAnlManager::getInstance();
    const Matrix4D x = mgr->superposeSSM1(ref, supSel(), mov, supSel(), true);

    // raw coordinates are untouched ...
    expectCoordsNear(collectCARaw(mov), rawBefore, 1.0e-9);
    // ... the result is exposed via the xformMat property ...
    expectMatrixNear(mov->getXformMatrix(), x, 1.0e-9);
    // ... and the effective (rendered) position lands on the reference.
    expectCoordsNear(collectCAPos(mov), refCA, 1.0e-2);
}

}  // namespace

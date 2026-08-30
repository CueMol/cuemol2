#include <gtest/gtest.h>
#include <common.h>
#include "molanl/MolAnlManager.hpp"
#include "molstr/MolCoord.hpp"
#include "molstr/MolAtom.hpp"
#include "molstr/SelCommand.hpp"
#include "qsys/SceneManager.hpp"
#include "qsys/Scene.hpp"

using molanl::MolAnlManager;
using molstr::MolAtom;
using molstr::MolAtomPtr;
using molstr::MolCoord;
using molstr::MolCoordPtr;
using molstr::ResidIndex;
using molstr::SelCommand;
using molstr::SelectionPtr;
using qlib::LString;
using qlib::Vector4D;

namespace {

int addAtom(MolCoordPtr pMol, const char *name, const char *elem, double x)
{
    MolAtomPtr pAtom(MB_NEW MolAtom());
    pAtom->setChainName("A");
    pAtom->setResName("XXX");
    pAtom->setResIndex(ResidIndex(1));
    pAtom->setName(name);
    pAtom->setElementName(elem);
    pAtom->setPos(Vector4D(x, 0.0, 0.0));
    return pMol->appendAtom(pAtom);
}

SelectionPtr allSel()
{
    return SelectionPtr(new SelCommand(LString("*")));
}

class ContactMapTest : public ::testing::Test
{
protected:
    qsys::ScenePtr m_scene;

    void SetUp() override
    {
        m_scene = qsys::SceneManager::getInstance()->createScene();
        m_scene->setName("contactMapTestScene");
    }

    void TearDown() override
    {
        if (!m_scene.isnull()) {
            qlib::uid_t uid = m_scene->getUID();
            m_scene = qsys::ScenePtr();
            qsys::SceneManager::getInstance()->destroyScene(uid);
        }
    }

    MolCoordPtr newMol(const char *name)
    {
        MolCoordPtr pMol(MB_NEW MolCoord());
        pMol->setName(name);
        m_scene->addObject(pMol);
        return pMol;
    }

    // calcAtomContact3JSON over two molecules, contacts within [0, 4] A
    static LString contacts(MolCoordPtr pMol1, MolCoordPtr pMol2)
    {
        return MolAnlManager::getInstance()->calcAtomContact3JSON(
            pMol1, allSel(), pMol2, allSel(), 0.0, 4.0, false, 100);
    }
};

}  // namespace

TEST_F(ContactMapTest, TwoMoleculesSameAtomCount)
{
    // mol1: N(0)  O(10)     mol2: O(3)  N(30)
    // The only pair within 4 A is mol1:N -- mol2:O.
    MolCoordPtr pMol1 = newMol("mol1");
    const int n1 = addAtom(pMol1, "N", "N", 0.0);
    addAtom(pMol1, "O", "O", 10.0);

    MolCoordPtr pMol2 = newMol("mol2");
    const int o2 = addAtom(pMol2, "O", "O", 3.0);
    addAtom(pMol2, "N", "N", 30.0);

    const LString expected = LString::format("[[%d,%d]]", n1, o2);
    EXPECT_STREQ(contacts(pMol1, pMol2).c_str(), expected.c_str());
}

TEST_F(ContactMapTest, FirstMoleculeLargerThanSecond)
{
    // mol1: N(0) O(1.5) N(20)     mol2: O(2.5)
    // Pairs within 4 A: mol1:N(0)--mol2:O and mol1:O(1.5)--mol2:O.
    MolCoordPtr pMol1 = newMol("mol1");
    const int a = addAtom(pMol1, "N1", "N", 0.0);
    const int b = addAtom(pMol1, "O1", "O", 1.5);
    addAtom(pMol1, "N2", "N", 20.0);

    MolCoordPtr pMol2 = newMol("mol2");
    const int c = addAtom(pMol2, "O", "O", 2.5);

    const LString expected = LString::format("[[%d,%d],[%d,%d]]", a, c, b, c);
    EXPECT_STREQ(contacts(pMol1, pMol2).c_str(), expected.c_str());
}

TEST_F(ContactMapTest, NoContactsGivesEmptyString)
{
    MolCoordPtr pMol1 = newMol("mol1");
    addAtom(pMol1, "N", "N", 0.0);
    MolCoordPtr pMol2 = newMol("mol2");
    addAtom(pMol2, "O", "O", 50.0);
    EXPECT_STREQ(contacts(pMol1, pMol2).c_str(), "");
}
